/**
 * RISK RULE LIBRARY — multifamily deal screening.
 * Rule-set version 1.0. Deal-agnostic: no rule may reference a specific property,
 * submarket, broker, tenant or page number. Page citations come from the extraction
 * of the document under review via cite(); named context comes from the deal object.
 *
 * Separation of concerns (per lecture guidance "rules are data, not a prompt"):
 *  - The TUNABLE data (weight, thresholds in `params`, page, severity ceiling, text) is what
 *    lives in the Supabase `risk_rules` table and can be edited without touching engine code.
 *  - `evaluate(d, p)` holds only the comparison SHAPE; it reads thresholds from `p` (params),
 *    so changing a number in the table changes behavior with no redeploy.
 *
 * evaluate() returns one of:
 *   { status:'FLAG', level:1|2, severity, evidence, financialImpact, nextAction? }
 *   { status:'PASS', evidence }                      // mitigant / why-not note
 *   { status:'INSUFFICIENT_DATA', evidence, financialImpact? }
 */

const money = n => (n == null || isNaN(n)) ? "n/a" :
  (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US");
const pct = n => (n == null || isNaN(n)) ? "n/a" : (n * 100).toFixed(1) + "%";
const pmtAnnual = (rate, years, pv) => pv * rate / (1 - Math.pow(1 + rate, -years));

// ---- universality helpers -------------------------------------------------
// NOTHING in this file may be specific to any one offering memorandum.
// cite() emits a page reference ONLY when the extraction placed that figure in
// THIS document. A missing page yields an empty string, never a guess.
const cite = (d, key) => {
  const v = d && d.pages && d.pages[key];
  if (v == null) return "";
  const s = String(v).trim();
  if (!/^p?\d+$/i.test(s)) return "";
  return " (" + (/^p/i.test(s) ? s.toLowerCase() : "p" + s) + ")";
};
// Named context pulled from the deal, never assumed. Falls back to neutral wording.
const submarket = d => (d && d.meta && d.meta.submarket) || "the submarket";
const jurisdiction = d => (d && d.regulatory && d.regulatory.jurisdiction) ||
  (d && d.meta && d.meta.submarket) || "the jurisdiction";
const nOr = (n, singular, plural) => n == null ? plural : (n === 1 ? singular : plural);

const RULES = [
  // ---------------------------------------------------------------- OCCUPANCY
  { id: "R01", name: "Occupancy & leased-rate integrity", category: "Occupancy & Vacancy",
    page: null,
    pageKey: "occupancy",
    requires: ["occupancy.physical", "occupancy.leased", "income.gsr.seller", "property.units"], weight: 10, ddRequired: true, guardrail: false,
    params: { l1Gap: 0.05, l2Gap: 0.10, stabilizedOcc: 0.95 },
    whyItMatters: "Physical occupancy counts bodies in units; leased rate counts signed leases net of notices. A large leased-below-occupied gap signals a forward vacancy wave that the seller's underwritten vacancy does not capture.",
    nextAction: "Pull the notice-to-vacate report and 60-day leasing velocity; re-underwrite vacancy to the leased rate until velocity proves otherwise.",
    evaluate(d, p) {
      const gap = d.occupancy.physical - d.occupancy.leased;
      if (gap <= p.l1Gap) return { status: "PASS", evidence: `Leased ${pct(d.occupancy.leased)} vs occupied ${pct(d.occupancy.physical)} — gap within tolerance.` };
      const sev = gap > p.l2Gap ? "CRITICAL" : "HIGH";
      const exposure = Math.max(0, (p.stabilizedOcc - d.occupancy.leased)) * d.income.gsr.seller;
      return { status: "FLAG", level: gap > p.l2Gap ? 2 : 1, severity: sev,
        evidence: `${pct(d.occupancy.physical)} occupied but only ${pct(d.occupancy.leased)} leased${cite(d,'occupancy')} — a ${(gap*100).toFixed(0)}-pt gap (~${Math.round(gap*d.property.units)} ${nOr(Math.round(gap*d.property.units),'unit','units')} under notice) vs an underwritten ${pct(d.underwrite && d.underwrite.vacancyUW)} vacancy.`,
        financialImpact: `~${money(exposure)}/yr NOI exposure if leased rate holds (≈${money(exposure/d.hold.exitCap)} of value at ${pct(d.hold.exitCap)}).` };
    } },

  // ---------------------------------------------------------------- LOSS-TO-LEASE
  { id: "R02", name: "Loss-to-lease disclosure", category: "Revenue / Rent",
    page: null,
    pageKey: "rentRoll",
    requires: [], weight: 2, ddRequired: true, guardrail: false,
    params: {},
    whyItMatters: "Loss-to-lease is the gap between in-place and market rent — the core of any rent upside thesis. Without a unit-level roll and market rents it cannot be verified.",
    nextAction: "Obtain the full unit-level rent roll with market-rent column; compute LTL by unit and by floor plan.",
    evaluate(d) {
      if (d.rentRoll.unitLevelProvided && d.rentRoll.marketRentDisclosed)
        return { status: "PASS", evidence: "Unit-level roll with market rents provided; LTL computable." };
      return { status: "INSUFFICIENT_DATA",
        evidence: `No unit-level rent roll, no market-rent column and no stated loss-to-lease${cite(d,'rentRoll')}.` +
          (d.rents && d.rents.avgEffPsf != null && d.rents.submarketAAPsf != null
            ? ` Subject in-place ${money(d.rents.avgEffRent)} ($${d.rents.avgEffPsf}/SF) vs a ${submarket(d)} average of $${d.rents.submarketAAPsf}/SF${cite(d,'comps')}.`
            : ``),
        financialImpact: "Rent-upside thesis unquantifiable from the OM." };
    } },

  // ---------------------------------------------------------------- RENT GROWTH
  { id: "R03", name: "Year-1 rent-growth aggressiveness", category: "Revenue / Rent",
    page: null,
    pageKey: "gsr",
    requires: ["underwrite.yr1RentGrowth", "income.gsr.t12", "income.gsr.t3ann"], weight: 6, ddRequired: true, guardrail: false,
    params: { maxGrowth: 0.03 },
    whyItMatters: "Front-loaded rent growth inflates Year-1 NOI and therefore going-in value. It is only credible with signed-lease trade-out evidence, especially when trailing rents are flat-to-down.",
    nextAction: "Require signed new-lease and renewal trade-out data for the last 6 months before crediting Year-1 growth.",
    evaluate(d, p) {
      const g = d.underwrite.yr1RentGrowth;
      const trendingDown = d.income.gsr.t12 > d.income.gsr.t3ann; // trailing 12 > trailing 3 annualized => decelerating
      if (g <= p.maxGrowth) return { status: "PASS", evidence: `Year-1 rent growth ${pct(g)} within market tolerance.` };
      const excess = g * d.income.gsr.t3ann;
      return { status: "FLAG", level: trendingDown ? 2 : 1, severity: trendingDown ? "HIGH" : "MEDIUM",
        evidence: `Seller underwrites +${pct(g)} Year-1 rent growth off the T-3${cite(d,'gsr')}, yet T-12 GSR (${money(d.income.gsr.t12)}) exceeds T-3 annualized (${money(d.income.gsr.t3ann)}) — rents are decelerating, not accelerating.`,
        financialImpact: `~${money(excess)} of Year-1 revenue not yet in place.` };
    } },

  // ---------------------------------------------------------------- RENT PREMIUM
  { id: "R04", name: "Renovation / rent-premium substantiation", category: "Value-Add",
    page: null,
    pageKey: "valueAdd",
    requires: [], weight: 2, ddRequired: true, guardrail: false,
    params: {},
    whyItMatters: "Marketed upgrade premiums ($/unit/month) mean nothing without $/SF normalization and achieved-lease evidence — unit-size mix can masquerade as renovation lift (the classic OM overstatement).",
    nextAction: "Obtain the 'ROIs & Amenities' data-room sheet; normalize premiums to $/SF against classic units of like size.",
    evaluate(d) {
      if (d.valueAdd.roiSheetInOM) return { status: "PASS", evidence: "ROI/amenities detail provided; premiums substantiated." };
      if (!d.valueAdd.interiorPremiumsClaimed) return { status: "PASS", evidence: "No renovation-premium claim to test." };
      return { status: "FLAG", level: 1, severity: "MEDIUM",
        evidence: `OM markets interior-upgrade premiums${cite(d,'valueAdd')} on a $/unit basis with no $/SF normalization and no achieved-lease evidence; the supporting ROI detail is referenced but not included.`,
        financialImpact: "Upgrade upside unverified — exclude from value until substantiated." };
    } },

  // ---------------------------------------------------------------- NOI QUALITY
  { id: "R05", name: "NOI quality / manufactured NOI", category: "NOI Quality",
    page: null,
    pageKey: "expenses",
    requires: ["noi.seller", "noi.t12", "expenses.turnover.t12", "expenses.turnover.seller", "expenses.rm.t12", "expenses.rm.seller"], weight: 12, ddRequired: true, guardrail: false,
    params: { ctrlCut: 0.05, lineCut: 0.25 },
    whyItMatters: "NOI lifted by cutting expenses below trailing actuals — rather than growing revenue — is not durable. It is the single most common OM overstatement and directly inflates value at the going-in cap.",
    nextAction: "Re-underwrite controllable expenses to T-12 actuals; treat 'market adjustments' as unproven until third-party bids support them.",
    evaluate(d, p) {
      const toCut = d.expenses.turnover.seller / d.expenses.turnover.t12 - 1;   // negative = cut
      const rmCut = d.expenses.rm.seller / d.expenses.rm.t12 - 1;
      const bigLines = [toCut, rmCut].filter(x => x < -p.lineCut).length;
      if (bigLines === 0) return { status: "PASS", evidence: "No controllable line cut materially below T-12." };
      const restore = (d.expenses.turnover.t12 - d.expenses.turnover.seller) + (d.expenses.rm.t12 - d.expenses.rm.seller);
      return { status: "FLAG", level: bigLines >= 2 ? 2 : 1, severity: bigLines >= 2 ? "CRITICAL" : "HIGH",
        evidence: `Seller Year-1 NOI (${money(d.noi.seller)}) exceeds T-12 actual (${money(d.noi.t12)}) via expense cuts, not revenue: Turnover ${pct(toCut)} and R&M ${pct(rmCut)} below T-12${cite(d,'expenses')}.`,
        financialImpact: `~${money(restore)}/yr of NOI overstated → ≈${money(restore/d.hold.exitCap)} of value at ${pct(d.hold.exitCap)}.` };
    } },

  // ---------------------------------------------------------------- EXPENSE ANOMALY
  { id: "R06", name: "Expense anomaly — insurance step-change", category: "Expenses",
    page: null,
    pageKey: "expenses",
    requires: ["expenses.insurance.t12", "expenses.insurance.seller"], weight: 5, ddRequired: true, guardrail: false,
    params: { maxDelta: 0.50 },
    whyItMatters: "A >50% swing between trailing and underwritten insurance means either T-12 is understated (further NOI drag) or the UW is padded — either way the true run-rate is unknown without the bound policy.",
    nextAction: "Obtain the bound policy and 5-year loss runs; set insurance to the quoted renewal, not a $/unit rule of thumb.",
    evaluate(d, p) {
      const delta = d.expenses.insurance.seller / d.expenses.insurance.t12 - 1;
      if (Math.abs(delta) <= p.maxDelta) return { status: "PASS", evidence: `Insurance change ${pct(delta)} within tolerance.` };
      return { status: "FLAG", level: 1, severity: "MEDIUM",
        evidence: `Insurance underwritten at ${money(d.expenses.insurance.seller)} vs T-12 ${money(d.expenses.insurance.t12)} — a ${pct(delta)} step-change${cite(d,'expenses')}.`,
        financialImpact: `${money(d.expenses.insurance.seller - d.expenses.insurance.t12)} of unexplained annual expense swing.` };
    } },

  // ---------------------------------------------------------------- MGMT FEE
  { id: "R07", name: "Management-fee adequacy", category: "Expenses",
    page: null,
    pageKey: "expenses",
    requires: ["expenses.mgmtFee.pctOfEgi"], weight: 4, ddRequired: false, guardrail: false,
    params: { minPct: 0.025, marketPct: 0.03 },
    whyItMatters: "A below-market management fee understates operating cost and overstates NOI. Mixed-use high-rises with ground-floor retail warrant 2.5–3.5%.",
    nextAction: "Underwrite management to 3.0% of EGI (market for a 12-story mixed-use asset).",
    evaluate(d, p) {
      const f = d.expenses.mgmtFee.pctOfEgi;
      if (f >= p.minPct) return { status: "PASS", evidence: `Management fee ${pct(f)} at/above market minimum.` };
      const gap = (p.marketPct - f) * d.income.egi.seller;
      return { status: "FLAG", level: 1, severity: "MEDIUM",
        evidence: `Seller underwrites a ${pct(f)} management fee${cite(d,'expenses')} vs a ${pct(p.marketPct)} market benchmark; T-12 shows ${money(d.expenses.mgmtFee.t12)}${(d.expenses.mgmtFee.t12===0?' (self-managed) — no third-party benchmark':'')}.`,
        financialImpact: `~${money(gap)}/yr understated → ≈${money(gap/d.hold.exitCap)} of value at ${pct(d.hold.exitCap)}.` };
    } },

  // ---------------------------------------------------------------- CAPEX ADEQUACY
  { id: "R08", name: "Capital-expenditure & reserve adequacy", category: "Capital / Value-Add",
    page: null,
    pageKey: "reserves",
    requires: ["expenses.reserves.perUnit"], weight: 10, ddRequired: true, guardrail: false,
    params: { minReservePU: 250 },
    whyItMatters: "Thin reserves plus a value-add thesis with zero renovation capital means the upside is claimed but unfunded — the buyer pays for NOI growth that requires unbudgeted capital to achieve.",
    nextAction: "Budget interior + fitness-center capital and raise reserves to ≥$250/unit for a 12-story asset; net the capital from the bid.",
    evaluate(d, p) {
      const rpu = d.valueAdd.reservesPerUnit;
      const unfunded = d.valueAdd.interiorPremiumsClaimed && d.valueAdd.renovationCapexBudgeted === 0;
      if (rpu >= p.minReservePU && !unfunded) return { status: "PASS", evidence: `Reserves ${money(rpu)}/unit and value-add capital budgeted.` };
      const reserveGap = (p.minReservePU - rpu) * d.property.units;
      return { status: "FLAG", level: unfunded ? 2 : 1, severity: unfunded ? "CRITICAL" : "HIGH",
        evidence: `Reserves only ${money(rpu)}/unit${cite(d,'reserves')}${(d.property.yearBuilt!=null||d.property.stories!=null)?` for a ${[d.property.yearBuilt,d.property.stories?d.property.stories+'-story':null].filter(Boolean).join(' ')} asset`:''}; the marketed value-add thesis${cite(d,'valueAdd')} carries ${money(d.valueAdd.renovationCapexBudgeted)} of renovation capital.`,
        financialImpact: `Reserve shortfall ~${money(reserveGap)}/yr (≈${money(reserveGap/d.hold.exitCap)} of value); interior renovation est. $1.5–2.5M unfunded.` };
    } },

  // ---------------------------------------------------------------- DEFERRED MAINT
  { id: "R09", name: "Deferred maintenance & building systems", category: "Physical / Capital",
    page: null,
    pageKey: "buildingSystems",
    requires: [], weight: 5, ddRequired: true, guardrail: false,
    params: { roofLifeYears: 20 },
    whyItMatters: "A single-membrane roof and other major systems near end of service life are large, lumpy costs. Absent a PCA, they are unquantified and unreserved.",
    nextAction: "Commission a Property Condition Assessment; obtain roof age/warranty and a 12-year capital plan.",
    evaluate(d, p) {
      if (d.buildingSystems.pcaProvided) return { status: "PASS", evidence: "PCA provided; systems condition documented." };
      const roofAge = (new Date().getFullYear()) - d.buildingSystems.roofYear;
      return { status: "FLAG", level: 1, severity: "MEDIUM",
        evidence: `No PCA in the OM. Roof is original ${d.buildingSystems.roofType} from ${d.buildingSystems.roofYear} (~${roofAge} yrs, mid-life). Boiler replaced ${d.buildingSystems.boilerReplaced} (mitigant)${cite(d,'buildingSystems')}.`,
        financialImpact: "Roof replacement est. $1.5–2.5M within a typical hold — unreserved." };
    } },

  // ---------------------------------------------------------------- CAP RATE / PRICING
  { id: "R10", name: "Cap-rate & pricing sufficiency", category: "Pricing / Valuation",
    page: null,
    pageKey: "price",
    requires: [], weight: 6, ddRequired: true, guardrail: true,
    params: {},
    whyItMatters: "An OM offered unpriced gives no going-in cap or price-per-unit anchor. Value must be triangulated from re-underwritten NOI and a cap-rate matrix, not the seller's numbers.",
    nextAction: "Confirm pricing guidance; value off re-underwritten NOI via a cap-rate sensitivity matrix; do not bid to the seller's Year-1 NOI.",
    evaluate(d) {
      if (d.pricing.askingPrice) return { status: "PASS", evidence: `Asking price ${money(d.pricing.askingPrice)} disclosed.` };
      const capUW = d.underwrite.yr1NoiUW / d.pricing.assessorFmv;
      const capSeller = d.noi.seller / d.pricing.assessorFmv;
      return { status: "INSUFFICIENT_DATA",
        evidence: `OM is unpriced and free-and-clear${cite(d,'price')} — no asking price or going-in cap. At the assessor FMV (${money(d.pricing.assessorFmv)}): ${pct(capUW)} on re-underwritten NOI vs ${pct(capSeller)} on the seller's Year-1 NOI.`,
        financialImpact: `Each 25 bps of cap ≈ ${money(d.underwrite.yr1NoiUW/0.05 - d.underwrite.yr1NoiUW/0.0525)} of value swing at this NOI.` };
    } },

  // ---------------------------------------------------------------- DSCR
  { id: "R11", name: "DSCR / debt-service coverage", category: "Debt / Leverage",
    page: null,
    pageKey: "price",
    requires: ["underwrite.yr1NoiUW", "financing.ltv", "financing.rate"], weight: 5, ddRequired: false, guardrail: false,
    params: { minDSCR: 1.25 },
    whyItMatters: "Coverage below 1.25x on a fully-amortizing basis means the asset barely services its debt once interest-only burns off — a refinancing and distribution risk.",
    nextAction: "Size debt to a 1.25x amortizing DSCR floor; stress the post-IO coverage before committing.",
    evaluate(d, p) {
      const loan = d.financing.ltv * d.pricing.assessorFmv;
      const dsIO = loan * d.financing.rate;
      const dsAmort = pmtAnnual(d.financing.rate, d.financing.amortYears, loan);
      const dscrIO = d.underwrite.yr1NoiUW / dsIO;
      const dscrAmort = d.underwrite.yr1NoiUW / dsAmort;
      if (dscrAmort >= p.minDSCR) return { status: "PASS", evidence: `DSCR ${dscrAmort.toFixed(2)}x on an amortizing basis (${dscrIO.toFixed(2)}x during IO) — above the ${p.minDSCR}x floor.` };
      return { status: "FLAG", level: dscrAmort < 1.0 ? 2 : 1, severity: dscrAmort < 1.0 ? "HIGH" : "MEDIUM",
        evidence: `At ${pct(d.financing.ltv)} LTV / ${pct(d.financing.rate)} / ${d.financing.amortYears}-yr, coverage is ${dscrIO.toFixed(2)}x during the ${d.financing.ioYears}-yr IO but only ${dscrAmort.toFixed(2)}x once amortizing — below the ${p.minDSCR}x floor.`,
        financialImpact: `Post-IO coverage cushion is thin; distributions compress when the loan begins amortizing.` };
    } },

  // ---------------------------------------------------------------- LTV
  { id: "R12", name: "Leverage / LTV", category: "Debt / Leverage",
    page: null,
    pageKey: "price",
    requires: ["financing.ltv"], weight: 2, ddRequired: false, guardrail: false,
    params: { maxLTV: 0.75 },
    whyItMatters: "Leverage above 75% leaves a thin equity cushion against value declines.",
    nextAction: "Keep leverage ≤65–70% given the aggressive OM basis.",
    evaluate(d, p) {
      if (d.financing.ltv > p.maxLTV) return { status: "FLAG", level: 1, severity: "HIGH",
        evidence: `Assumed LTV ${pct(d.financing.ltv)} exceeds the ${pct(p.maxLTV)} prudence threshold.`,
        financialImpact: "Limited equity cushion to a downward re-trade." };
      return { status: "PASS", evidence: `Assumed LTV ${pct(d.financing.ltv)} is conservative (≤${pct(p.maxLTV)}).` };
    } },

  // ---------------------------------------------------------------- DEBT YIELD
  { id: "R13", name: "Debt yield", category: "Debt / Leverage",
    page: null,
    pageKey: "price",
    requires: ["underwrite.yr1NoiUW", "financing.ltv"], weight: 2, ddRequired: false, guardrail: false,
    params: { minDebtYield: 0.08 },
    whyItMatters: "Debt yield (NOI ÷ loan) is the lender's downside test; below ~8% signals aggressive proceeds relative to income.",
    nextAction: "Confirm lender debt-yield floor; size proceeds to ≥8% on re-underwritten NOI.",
    evaluate(d, p) {
      const loan = d.financing.ltv * d.pricing.assessorFmv;
      const dy = d.underwrite.yr1NoiUW / loan;
      if (dy >= p.minDebtYield) return { status: "PASS", evidence: `Debt yield ${pct(dy)} on re-underwritten NOI — above the ${pct(p.minDebtYield)} floor.` };
      return { status: "FLAG", level: dy < 0.07 ? 2 : 1, severity: dy < 0.07 ? "HIGH" : "MEDIUM",
        evidence: `Debt yield ${pct(dy)} on re-underwritten NOI is below the ${pct(p.minDebtYield)} floor.`,
        financialImpact: "Proceeds may need to be reduced to satisfy lender debt-yield test." };
    } },

  // ---------------------------------------------------------------- MARKET
  { id: "R14", name: "Submarket supply / demand fundamentals", category: "Market",
    page: null,
    pageKey: "market",
    requires: ["market.officeVacancy", "market.retailVacancy"], weight: 8, ddRequired: false, guardrail: false,
    params: { maxVacancy: 0.05 },
    whyItMatters: "Supply-constrained, high-income submarkets protect occupancy and pricing power — the demand side of the thesis. A PASS here proves the rule set discriminates rather than flagging everything.",
    nextAction: "Confirm the multifamily (not office/retail) vacancy and 2024–2028 delivery pipeline with CoStar.",
    evaluate(d, p) {
      if (d.market.submarketMfVacancyEst > p.maxVacancy) return { status: "FLAG", level: 1, severity: "MEDIUM",
        evidence: `Submarket vacancy ${pct(d.market.submarketMfVacancyEst)} exceeds ${pct(p.maxVacancy)}.`,
        financialImpact: "Softening demand pressures rent and occupancy." };
      return { status: "PASS",
        evidence: `${submarket(d)} shows constrained supply: office vacancy ${pct(d.market.officeVacancy)}, retail ${pct(d.market.retailVacancy)}, est. MF vacancy ~${pct(d.market.submarketMfVacancyEst)}; 1-mile avg HH income ${money(d.market.avgHhIncome1mi)}+; ${d.market.pipelineUnitsCCR} submarket units in the pipeline${cite(d,'market')}.${d.market.rentControl?'':' No rent control disclosed.'}` };
    } },

  // ---------------------------------------------------------------- COMPS
  { id: "R15", name: "Comparable-set integrity", category: "Comparables",
    page: null,
    pageKey: "comps",
    requires: ["rents.avgEffPsf", "rents.submarketAAPsf"], weight: 2, ddRequired: true, guardrail: false,
    params: {},
    whyItMatters: "Rent comps drive the mark-to-market thesis; internal inconsistencies between OM sections undermine any premium/discount conclusion.",
    nextAction: "Rebuild the comp set from primary source (CoStar) at like vintage/geography; reconcile the OM's conflicting figures.",
    evaluate(d) {
      if (!d.comps.internalInconsistency) return { status: "PASS", evidence: "Comp set internally consistent." };
      return { status: "FLAG", level: 1, severity: "MEDIUM",
        evidence: `Comp rent/PSF figures conflict between sections of the OM${cite(d,'comps')}. Subject $${d.rents.avgEffPsf}/SF vs the ${submarket(d)} average $${d.rents.submarketAAPsf}/SF.`,
        financialImpact: "Mark-to-market upside cannot be sized until comps are reconciled." };
    } },

  // ---------------------------------------------------------------- REGULATORY
  { id: "R16", name: "Regulatory exposure", category: "Regulatory",
    page: null,
    pageKey: "market",
    requires: [], weight: 1, ddRequired: true, guardrail: false,
    params: {},
    whyItMatters: "Rent regulation and undisclosed affordable/restricted units cap upside and change the risk profile.",
    nextAction: "Confirm no affordable/income-restricted units and no local rent-stabilization overlay in the applicable jurisdiction.",
    evaluate(d) {
      if (d.regulatory.rentControl) return { status: "FLAG", level: 2, severity: "HIGH",
        evidence: "Asset subject to rent regulation.", financialImpact: "Rent upside capped by statute." };
      if (!d.regulatory.affordableUnitsDisclosed) return { status: "FLAG", level: 1, severity: "LOW",
        evidence: `${d.regulatory.jurisdiction}: no statewide rent control (favorable), but the OM does not affirmatively disclose the absence of affordable/income-restricted units.`,
        financialImpact: "Low — confirmatory only." };
      return { status: "PASS", evidence: "No rent control; affordable status disclosed." };
    } },

  // ---------------------------------------------------------------- TAX
  { id: "R17", name: "Property-tax & reassessment risk", category: "Tax",
    page: null,
    pageKey: "tax",
    requires: ["expenses.reTaxes.seller", "income.egi.seller", "tax.fmv"], weight: 4, ddRequired: true, guardrail: false,
    params: { maxTaxPctEgi: 0.15 },
    whyItMatters: "A sale can trigger reassessment and assessment rates change; underwriting taxes flat to the current bill understates go-forward expense.",
    nextAction: "Model a reassessment-on-sale scenario at the purchase basis; confirm the current mill levy and assessment ratio.",
    evaluate(d, p) {
      const taxPct = d.expenses.reTaxes.seller / d.income.egi.seller;
      const overThreshold = taxPct > p.maxTaxPctEgi;
      return { status: "FLAG", level: overThreshold ? 2 : 1, severity: overThreshold ? "HIGH" : "MEDIUM",
        evidence: `RE taxes ${money(d.expenses.reTaxes.seller)} = ${pct(taxPct)} of EGI${cite(d,'tax')}, grown only ~3%/yr off the assessor FMV; a sale near ${money(d.tax.fmv)} FMV plus assessment-rate changes in ${jurisdiction(d)} create reassessment exposure not modeled.`,
        financialImpact: `Each +10% to the tax bill ≈ ${money(d.expenses.reTaxes.seller*0.10)}/yr of NOI.` };
    } },

  // ---------------------------------------------------------------- LEASE ROLLOVER
  { id: "R18", name: "Lease rollover & retail anchor risk", category: "Lease Rollover",
    page: null,
    pageKey: "retail",
    requires: [], weight: 2, ddRequired: true, guardrail: false,
    params: { maxRollPct: 0.20 },
    whyItMatters: "Concentrated retail rollover and an anchor rent abatement create near-term income volatility that the blended pro forma masks.",
    nextAction: "Abstract every retail lease; model any disclosed abatement and the retail rollover schedule explicitly.",
    evaluate(d, p) {
      const flags = [];
      if (d.retail.anchorAbatement2026) flags.push(`anchor ${d.retail.anchorTenant} (${pct(d.retail.anchorPctSf)} of retail SF) has a 2026 base-rent abatement`);
      if (d.retail.rollWithinHoldPctSf >= p.maxRollPct) flags.push(`~${pct(d.retail.rollWithinHoldPctSf)} of retail SF rolls within the hold`);
      if (!flags.length) return { status: "PASS", evidence: "No concentrated retail rollover or abatement in the hold." };
      return { status: "FLAG", level: 1, severity: "MEDIUM",
        evidence: `Retail income volatility${cite(d,'retail')}: ${flags.join("; ")}.`,
        financialImpact: "Near-term retail income at risk of re-lease downtime and TI/LC." };
    } },

  // ---------------------------------------------------------------- DATA INTEGRITY (guardrail)
  { id: "R19", name: "Document integrity", category: "Data Integrity",
    page: null,
    pageKey: null,
    requires: [], weight: 4, ddRequired: true, guardrail: true,
    params: { maxInconsistencies: 0 },
    whyItMatters: "Internal contradictions in the OM undermine confidence in every extracted figure and must be reconciled before any number is trusted.",
    nextAction: "Reconcile each inconsistency against the rent roll and T-12 source documents before relying on OM figures.",
    evaluate(d, p) {
      const n = d.dataIntegrity.documentedInconsistencies;
      if (n <= p.maxInconsistencies) return { status: "PASS", evidence: "No documented internal inconsistencies." };
      return { status: "FLAG", level: n >= 4 ? 2 : 1, severity: "MEDIUM",
        evidence: `${n} documented inconsistencies: ${d.dataIntegrity.notes.slice(0,3).join("; ")}${n>3?"; …":""}.`,
        financialImpact: "Extraction confidence reduced; verify all figures against source docs." };
    } },

  // ---------------------------------------------------------------- MISSING DD (guardrail)
  { id: "R20", name: "Missing due-diligence coverage", category: "Due Diligence",
    page: null,
    pageKey: null,
    requires: [], weight: 8, ddRequired: true, guardrail: true,
    params: { maxMissing: 3 },
    whyItMatters: "Core underwriting inputs absent from the OM mean the screening rests on marketing figures; the deal cannot clear IC until they are obtained.",
    nextAction: "Issue the DD request list; do not advance to IC until the rent roll, T-12 statement, leases, and PCA are received.",
    evaluate(d, p) {
      const n = d.missingDD.criticalMissingCount;
      if (n <= p.maxMissing) return { status: "PASS", evidence: `${n} critical DD items outstanding — within tolerance.` };
      return { status: "FLAG", level: 1, severity: "HIGH",
        evidence: `${n} critical DD items not provided in the OM: ${d.missingDD.items.slice(0,4).join(", ")}, …`,
        financialImpact: "Screening rests on marketing figures until DD is received." };
    } },
];

const RULE_SET_VERSION = "1.0";


/**
 * RISK & RED-FLAG ENGINE — multifamily deal screening.
 *
 * Pure, dependency-free. Drop the body of `screen()` into an n8n Code node:
 * feed it the extracted deal object (from the Claude extraction node) and the
 * rule set (from the Supabase `risk_rules` table), and it returns the full
 * risk assessment as JSON for the Lovable front end.
 *
 * Design (per CBRE × Project Destined lecture guidance + PARITY reference):
 *  - Rules are DATA (thresholds/weights/text live in `risk_rules`); this engine
 *    only applies them, so thresholds change with no redeploy.
 *  - Two-level rules (L1 flag → L2 escalate) with a why-not/mitigant branch.
 *  - Severity-weighted scoring so CRITICALs drive the score, not noise.
 *  - A GUARDRAIL layer runs first and caps the verdict — data-integrity,
 *    missing-DD, or pricing gaps cannot be "passed over" into a buy verdict.
 *  - Every flag carries: category, severity, triggered rule, evidence, OM page,
 *    why it matters, estimated financial impact, next action, DD-required.
 *  - Modular & expandable: add a rule object to rules.js / a row to the table;
 *    nothing in this file changes.
 */

const SEVERITY_FACTOR = { CRITICAL: 1.0, HIGH: 0.75, MEDIUM: 0.4, LOW: 0.2, INFO: 0, INSUFFICIENT_DATA: 0.5, PASS: 0 };
const SEVERITY_RANK   = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INSUFFICIENT_DATA: 1, INFO: 0, PASS: 0 };

const VERDICT_BANDS = [
  { min: 80, verdict: "PURSUE",      note: "Underwrite in full." },
  { min: 60, verdict: "PROCEED",     note: "Advance to IC with conditions." },
  { min: 40, verdict: "CONDITIONAL — RE-TRADE", note: "Re-underwrite and re-trade before bidding." },
  { min: 0,  verdict: "NO-GO on OM economics", note: "Do not bid off the OM's stated numbers." },
];

function verdictFor(score) {
  return VERDICT_BANDS.find(b => score >= b.min);
}

// Deal-level risk posture (risk-synthesis heuristic from the rule-tree diagram)
function dealRiskPosture(counts) {
  if (counts.CRITICAL >= 1) return "CRITICAL";
  if (counts.HIGH >= 2)     return "CRITICAL";
  if (counts.HIGH >= 1)     return "HIGH";
  if (counts.MEDIUM >= 3)   return "HIGH";
  if (counts.MEDIUM >= 1)   return "MEDIUM";
  return "LOW";
}

/**
 * @param {object} deal   extracted deal facts (see exampleDeal.js)
 * @param {object} ruleset { RULES: [...], RULE_SET_VERSION: '1.0' }
 * @returns full assessment object
 */
// Resolve a dotted path ("income.gsr.t12") against the deal. Returns undefined for
// any missing link, so a null anywhere in the chain counts as missing.
function at(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
// Human wording for a missing input, so the UI explains the gap in the analyst's
// language rather than printing a code path.
const PATH_LABELS = {
  "occupancy.physical": "physical occupancy", "occupancy.leased": "leased occupancy",
  "income.gsr.t12": "T-12 gross scheduled rent", "income.gsr.t3ann": "T-3 annualised gross scheduled rent",
  "income.gsr.seller": "the seller's gross scheduled rent", "income.egi.seller": "the seller's effective gross income",
  "noi.t12": "T-12 NOI", "noi.seller": "the seller's Year-1 NOI",
  "expenses.turnover.t12": "T-12 turnover expense", "expenses.turnover.seller": "underwritten turnover expense",
  "expenses.rm.t12": "T-12 repairs & maintenance", "expenses.rm.seller": "underwritten repairs & maintenance",
  "expenses.insurance.t12": "T-12 insurance", "expenses.insurance.seller": "underwritten insurance",
  "expenses.reserves.perUnit": "reserves per unit", "expenses.mgmtFee.pctOfEgi": "the management fee",
  "expenses.reTaxes.seller": "underwritten real-estate taxes",
  "property.units": "the unit count", "property.nrsf": "net rentable square footage",
  "rents.avgEffRent": "average effective rent", "rents.avgEffPsf": "average effective rent per SF",
  "rents.submarketAAPsf": "the submarket rent comparable",
  "pricing.assessorFmv": "the assessor's fair market value", "tax.fmv": "the assessed fair market value",
  "underwrite.yr1NoiUW": "a re-underwritten Year-1 NOI",
};
function labelForPath(p) {
  return PATH_LABELS[p] || p.split(".").pop().replace(/([A-Z])/g, " $1").toLowerCase();
}
// A rule may only run when every input it declares is actually present. Without this,
// comparisons on nulls silently coerce (null - null === 0) and a rule can PASS or FLAG
// on data the OM never contained — fabricating a finding.
function missingInputs(rule, deal) {
  const req = rule.requires || [];
  return req.filter(p => {
    const v = at(deal, p);
    return v === undefined || v === null || (typeof v === "number" && !isFinite(v));
  });
}
// Page citation for a flag, read from THIS document's extraction. Never a constant.
function pageFor(rule, deal) {
  const key = rule.pageKey;
  if (!key) return null;
  const v = deal && deal.pages && deal.pages[key];
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^p?\d+$/i.test(s)) return null;
  return /^p/i.test(s) ? s.toLowerCase() : "p" + s;
}

function screen(deal, ruleset) {
  const rules = ruleset.RULES;
  const flags = [];        // triggered risks
  const passes = [];       // rules that cleared (proves discrimination)
  const insufficient = []; // data gaps
  const guardrailHits = [];
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INSUFFICIENT_DATA: 0, PASS: 0 };
  let pointsLost = 0;
  const totalWeight = rules.reduce((s, r) => s + r.weight, 0);

  for (const rule of rules) {
    let res;
    const missing = missingInputs(rule, deal);
    if (missing.length) {
      res = { status: "INSUFFICIENT_DATA",
        evidence: `The OM does not state ${missing.map(labelForPath).join(", ")}, so this rule cannot be evaluated.` };
    } else {
      try {
        res = rule.evaluate(deal, rule.params || {});
      } catch (e) {
        res = { status: "INSUFFICIENT_DATA", evidence: `Rule could not evaluate (missing input): ${e.message}` };
      }
    }
    // Belt and braces: a rule that returns prose containing "n/a" is reporting on data
    // it does not have. Downgrade it rather than publish a sentence with a hole in it.
    if (res && res.status !== "INSUFFICIENT_DATA" && typeof res.evidence === "string" && /\bn\/a\b/i.test(res.evidence)) {
      res = { status: "INSUFFICIENT_DATA",
        evidence: "One or more figures this rule depends on are not stated in the OM." };
    }
    const severity = res.status === "PASS" ? "PASS"
      : res.status === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA"
      : res.severity;
    const factor = SEVERITY_FACTOR[severity] ?? 0;
    const lost = +(rule.weight * factor).toFixed(2);
    pointsLost += lost;
    counts[severity] = (counts[severity] || 0) + 1;

    const record = {
      ruleId: rule.id,
      rule: rule.name,
      category: rule.category,
      status: res.status,
      severity,
      level: res.level || null,
      weight: rule.weight,
      pointsLost: lost,
      evidence: res.evidence,
      omPage: pageFor(rule, deal),
      whyItMatters: rule.whyItMatters,
      financialImpact: res.financialImpact || (res.status === "PASS" ? "None — mitigant present." : "Unquantified — DD required."),
      recommendedNextAction: res.nextAction || rule.nextAction,
      additionalDDRequired: res.status === "PASS" ? false : !!rule.ddRequired,
      guardrail: !!rule.guardrail,
    };

    if (res.status === "PASS") passes.push(record);
    else if (res.status === "INSUFFICIENT_DATA") insufficient.push(record);
    else flags.push(record);
    if (rule.guardrail && res.status !== "PASS") guardrailHits.push(record);
  }

  // ---- score & verdict ----
  let score = Math.max(0, Math.round((100 - pointsLost) * (100 / totalWeight)));

  // COVERAGE CEILING. Without this a document we cannot read outscores one we can:
  // every rule that fails to evaluate simply stops deducting, so opacity is rewarded.
  // An unreadable OM is not a good deal — it is an unscreened one. The score may not
  // exceed the share of the rule set that actually resolved against real figures.
  const evaluatedWeight = rules.reduce((s, r) =>
    s + (missingInputs(r, deal).length ? 0 : r.weight), 0);
  const coverage = totalWeight ? evaluatedWeight / totalWeight : 0;
  const coverageCeiling = Math.round(100 * coverage);
  const coverageCapped = score > coverageCeiling;
  if (coverageCapped) score = coverageCeiling;

  let band = verdictFor(score);
  // Guardrail cap: unresolved data-integrity / missing-DD / pricing gaps cannot
  // clear into PURSUE or PROCEED — cap the verdict at CONDITIONAL.
  let guardrailCapped = false;
  if (guardrailHits.length && score >= 60) {
    band = verdictFor(59);
    guardrailCapped = true;
  }
  const posture = dealRiskPosture(counts);

  // rank flags most-severe first, then by pointsLost
  flags.sort((a, b) => (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) || (b.pointsLost - a.pointsLost));

  return {
    property: deal.meta,
    ruleSetVersion: ruleset.RULE_SET_VERSION,
    generatedFrom: deal.meta.sourceOM,
    score,
    verdict: band.verdict,
    verdictNote: band.note,
    guardrailCapped,
    coverage: {
      rulesEvaluated: rules.length - rules.filter(r => missingInputs(r, deal).length).length,
      rulesTotal: rules.length,
      weightResolvedPct: coverageCeiling,
      scoreCappedByCoverage: coverageCapped,
      note: coverageCapped
        ? `Score limited to ${coverageCeiling} because only ${coverageCeiling}% of the rule set could be evaluated against stated figures.`
        : null,
    },
    dealRiskPosture: posture,
    counts: {
      critical: counts.CRITICAL, high: counts.HIGH, medium: counts.MEDIUM,
      low: counts.LOW, insufficientData: counts.INSUFFICIENT_DATA, pass: counts.PASS,
      flaggedTotal: flags.length, guardrailHits: guardrailHits.length,
    },
    topRisks: flags.slice(0, 5).map(f => `${f.severity} · ${f.rule} — ${f.financialImpact}`),
    flags,
    insufficientData: insufficient,
    passes,
  };
}




// ===== n8n Code node: map extraction -> deal, re-underwrite, run risk engine =====
function num(x){ return (typeof x==='number' && isFinite(x)) ? x : null; }
function computeUwNoi(d, a){
  try{
    const e=d.expenses, i=d.income; if(!e||!i||num(d.noi&&d.noi.seller)==null) return null;
    let noi=d.noi.seller;
    const restore=((e.turnover&&num(e.turnover.t12)-num(e.turnover.seller))||0)+((e.rm&&num(e.rm.t12)-num(e.rm.seller))||0);
    noi-=restore;                                                   // restore turnover+R&M to T-12
    if(e.mgmtFee&&num(e.mgmtFee.pctOfEgi)!=null&&i.egi&&num(i.egi.seller)!=null)
      noi-=Math.max(0,(a.mgmtMarketPct - e.mgmtFee.pctOfEgi))*i.egi.seller; // mgmt to market
    if(d.valueAdd&&num(d.valueAdd.reservesPerUnit)!=null&&d.property&&num(d.property.units)!=null)
      noi-=Math.max(0,(a.minReservePU - d.valueAdd.reservesPerUnit))*d.property.units; // reserves to floor
    if(i.gsr&&num(i.gsr.seller)!=null) noi-=a.concessionRate*i.gsr.seller; // restore concessions
    return Math.round(noi);
  }catch(e){ return null; }
}
function mergeAssumptions(assumptions){
  return Object.assign({ ltv:0.60, rate:0.0625, amortYears:30, ioYears:2, exitCap:0.0525, holdYears:5,
                         yr1RentGrowth:0.035, vacancyUW:0.05, concessionRate:0.012, badDebtRate:0.003,
                         mgmtMarketPct:0.03, minReservePU:250, noiGrowth:0.03, closingPct:0.01, saleCostPct:0.02 },
                       assumptions||{});
}
// note: pmtAnnual() is already defined in the rule library above — reused here.
function irr(cfs){
  const npv=r=>cfs.reduce((s,c,i)=>s+c/Math.pow(1+r,i),0);
  let lo=-0.95, hi=5;
  if(npv(lo)*npv(hi)>0) return null;
  for(let i=0;i<300;i++){ const mid=(lo+hi)/2; if(npv(lo)*npv(mid)<=0) hi=mid; else lo=mid; }
  return (lo+hi)/2;
}
// Deterministic headline metrics (NOI, cap rate, price/unit, occupancy, DSCR, IRR, ...).
// Provenance: actual = OM trailing actual | seller = OM pro forma | calculated = derived here
// | assumption = user/default input | insufficient_data = OM does not state it.
function computeMetrics(d, a){
  const M=[];
  const add=(key,label,value,unit,provenance,omPage,note)=>M.push({
    key,label,value:(value==null?null:value),unit,provenance,
    omPage:omPage||null,note:note||null,
    status:(value==null?'INSUFFICIENT_DATA':'OK')
  });
  // Citations come from THIS document's extraction, never from a constant. pg() returns
  // null when Claude could not place a figure, and the UI then shows no citation at all.
  const PG = (d && d.pages && typeof d.pages === 'object') ? d.pages : {};
  const pg = k => {
    const v = PG[k];
    if (typeof v === 'number' && isFinite(v)) return 'p' + v;
    if (typeof v === 'string' && /^p?\d+$/i.test(v.trim())) return v.trim().replace(/^(\d)/, 'p$1');
    return null;
  };

  const units=num(d.property&&d.property.units), nrsf=num(d.property&&d.property.nrsf);
  const askPrice=num(d.pricing&&d.pricing.askingPrice);
  const fmv=num(d.pricing&&d.pricing.assessorFmv);
  const price = askPrice!=null ? askPrice : fmv;
  const priceProv = askPrice!=null ? 'actual' : (fmv!=null ? 'assumption' : 'insufficient_data');
  const noiUW=num(d.underwrite&&d.underwrite.yr1NoiUW);
  const noiSeller=num(d.noi&&d.noi.seller), noiT12=num(d.noi&&d.noi.t12);

  add('units','Units',units,'count','actual',pg('units'));
  add('occupancyPhysical','Physical occupancy',num(d.occupancy&&d.occupancy.physical),'pct','actual',pg('occupancy'));
  add('occupancyLeased','Leased occupancy',num(d.occupancy&&d.occupancy.leased),'pct','actual',pg('occupancy'));
  add('avgEffRent','Avg effective rent',num(d.rents&&d.rents.avgEffRent),'usd_month','actual',pg('rents'));
  add('noiT12','NOI — T-12 actual',noiT12,'usd','actual',pg('noiT12'));
  add('noiSeller','NOI — seller Year-1 pro forma',noiSeller,'usd','seller',pg('noiSeller'));
  add('noiUnderwritten','NOI — re-underwritten Year-1',noiUW,'usd','calculated',null,
      'Seller pro forma with turnover/R&M restored to T-12, concessions restored, management to market, reserves to floor.');
  add('purchasePrice', askPrice!=null?'Purchase price (OM)':'Purchase price (assumed — OM unpriced)', price,'usd',priceProv,askPrice!=null?pg('price'):pg('tax'),
      askPrice!=null?null:'OM is unpriced/free-and-clear; anchored to assessor FMV. Override via assumptions.purchasePrice.');
  add('pricePerUnit','Price per unit',(price!=null&&units)?Math.round(price/units):null,'usd',price!=null?'calculated':'insufficient_data');
  add('pricePerSf','Price per SF',(price!=null&&nrsf)?+(price/nrsf).toFixed(2):null,'usd',price!=null?'calculated':'insufficient_data');
  add('capRateUnderwritten','Going-in cap — re-underwritten NOI',(price&&noiUW!=null)?+(noiUW/price).toFixed(4):null,'pct','calculated');
  add('capRateSeller','Going-in cap — seller NOI',(price&&noiSeller!=null)?+(noiSeller/price).toFixed(4):null,'pct','calculated');

  // Debt (OM is free & clear — financing is a user assumption)
  const loan=(price!=null)?price*a.ltv:null;
  const dsIO=(loan!=null)?loan*a.rate:null;
  const dsAmort=(loan!=null)?pmtAnnual(a.rate,a.amortYears,loan):null;
  add('loanAmount','Loan amount',loan!=null?Math.round(loan):null,'usd','assumption',null,
      'OM offered free and clear; financing is a user assumption.');
  add('ltv','LTV',a.ltv,'pct','assumption');
  add('dscrIO','DSCR — interest-only period',(dsIO&&noiUW!=null)?+(noiUW/dsIO).toFixed(2):null,'x','calculated');
  add('dscrAmortizing','DSCR — once amortizing',(dsAmort&&noiUW!=null)?+(noiUW/dsAmort).toFixed(2):null,'x','calculated');
  add('debtYield','Debt yield',(loan&&noiUW!=null)?+(noiUW/loan).toFixed(4):null,'pct','calculated');

  // 5-yr levered return (mirrors the underwriting model: NOI growth, exit at cap, IO then amortizing)
  let leveredIrr=null, equityMultiple=null, exitValue=null, equity=null;
  if(price!=null && noiUW!=null && loan!=null){
    const H=Math.max(1,Math.round(a.holdYears));
    const noiY=y=>noiUW*Math.pow(1+a.noiGrowth,y-1);
    exitValue=noiY(H+1)/a.exitCap;
    equity=price-loan+price*a.closingPct;
    let bal=loan; const cfs=[-equity];
    for(let y=1;y<=H;y++){
      const interest=bal*a.rate;
      const ds=(y<=a.ioYears)?interest:dsAmort;
      if(y>a.ioYears) bal-=(dsAmort-interest);
      let cf=noiY(y)-ds;
      if(y===H) cf+=exitValue*(1-a.saleCostPct)-bal;
      cfs.push(cf);
    }
    leveredIrr=irr(cfs);
    equityMultiple=+(cfs.slice(1).reduce((s,c)=>s+c,0)/equity).toFixed(2);
  }
  add('equityInvested','Equity invested (incl. closing)',equity!=null?Math.round(equity):null,'usd','calculated');
  add('exitValue','Exit value @ exit cap',exitValue!=null?Math.round(exitValue):null,'usd','calculated');
  add('leveredIrr','Levered IRR ('+a.holdYears+'-yr hold)',leveredIrr!=null?+leveredIrr.toFixed(4):null,'pct','calculated',null,
      'Requires a purchase price and financing assumptions; both are user inputs on an unpriced OM.');
  add('equityMultiple','Equity multiple',equityMultiple,'x','calculated');
  return M;
}
function buildDeal(extraction, assumptions, body){
  const a = mergeAssumptions(assumptions);
  const d = extraction || {};
  d.meta = Object.assign({ name: (body&&body.deal_name)||'Uploaded OM', sourceOM: (body&&body.deal_name)||'uploaded.pdf' }, d.meta||{});
  d.financing = Object.assign({ ltv:a.ltv, rate:a.rate, amortYears:a.amortYears, ioYears:a.ioYears }, d.financing||{});
  d.hold = Object.assign({ years:a.holdYears, exitCap:a.exitCap }, d.hold||{});
  d.underwrite = Object.assign({ yr1RentGrowth:a.yr1RentGrowth, vacancyUW:a.vacancyUW }, d.underwrite||{});
  const uw = computeUwNoi(d, a);
  if(uw!=null) d.underwrite.yr1NoiUW = uw;
  // ensure nested objects exist so rules degrade to INSUFFICIENT_DATA rather than throwing
  ['occupancy','rents','income','expenses','noi','tax','pricing','valueAdd','buildingSystems','retail','market','comps','dataIntegrity','rentRoll','regulatory','missingDD','property']
    .forEach(k=>{ if(!d[k]||typeof d[k]!=='object') d[k]={}; });
  // Determinism guard: these two fields are the only judgment calls in the extraction,
  // and they drive flag counts. Derive the count from the list rather than trusting a
  // separately-generated number, and de-duplicate + canonically order the list so the
  // same OM yields the same count on every run.
  const canon = (arr) => Array.from(new Set((Array.isArray(arr)?arr:[])
    .filter(s => typeof s === 'string' && s.trim())
    .map(s => s.trim().toLowerCase()))).sort();
  // Column-label normalisation. Institutional OMs publish a trailing-12 statement;
  // smaller ones publish only an "In-Place"/"Current" column against a pro forma. Both
  // describe the same thing — what the asset actually earns today — so treat current as
  // the actual column when no trailing statement exists. Without this the engine reads
  // a fully-disclosed small deal as having no operating data at all.
  const fillT12 = o => { if (o && typeof o === 'object' && o.t12 == null && o.current != null) o.t12 = o.current; };
  fillT12(d.noi);
  ['gsr','vacancy','concessions','badDebt','egi'].forEach(k => fillT12(d.income && d.income[k]));
  ['controllable','turnover','rm','mgmtFee','reTaxes','insurance','reserves'].forEach(k => fillT12(d.expenses && d.expenses[k]));

  d.missingDD.items = canon(d.missingDD.items);
  d.missingDD.criticalMissingCount = d.missingDD.items.length;
  d.dataIntegrity.notes = canon(d.dataIntegrity.notes);
  d.dataIntegrity.documentedInconsistencies = d.dataIntegrity.notes.length;
  return d;
}
// --- document validation guard (runs before anything else) ---
// Catches the two ways an upload can be unusable: a scanned PDF with no text
// layer, and a PDF that simply isn't a multifamily OM. Both return a clean,
// structured error the UI can render honestly instead of a confusing empty run.
let __raw = '', __pages = 0, __guard = null;
try { const x = $('Extract OM text').first().json; __raw = x.text || ''; __pages = x.numpages || 0; } catch(e){}
try { __guard = $('Prep extraction request').first().json.__guard || null; } catch(e){}

const __chars = __raw.trim().length;
const __perPage = __pages ? Math.round(__chars/__pages) : __chars;

if (__guard === 'NO_TEXT_LAYER' || __chars < 1000 || (__pages > 3 && __perPage < 50)) {
  return [{ json: { error: {
    stage: 'document_validation',
    code: 'NO_TEXT_LAYER',
    message: 'This PDF has no extractable text layer — it appears to be a scanned or image-only document. Re-export the OM as a text-based PDF, or run OCR on it before uploading.',
    retryable: false,
    detail: { charsExtracted: __chars, pages: __pages, charsPerPage: __perPage }
  } } }];
}

const __t = __raw.toLowerCase();
const __signals = ['net operating income','rent roll','occupancy','offering memorandum','effective gross',
                   'operating statement','unit mix','per unit','capitalization rate','multifamily','apartment'];
const __hits = __signals.filter(s => __t.includes(s));
if (__hits.length < 2) {
  return [{ json: { error: {
    stage: 'document_validation',
    code: 'NOT_A_MULTIFAMILY_OM',
    message: 'This document does not read as a multifamily Offering Memorandum — no rent roll, operating statement, or occupancy data was found. Upload a multifamily OM to screen.',
    retryable: false,
    detail: { charsExtracted: __chars, pages: __pages, signalsFound: __hits }
  } } }];
}

// --- repair MacRoman-mojibaked text (n8n/HTTP-layer bug re-decodes correct UTF-8 punctuation
// as MacRoman before re-encoding; this reverses that exact transform). Only triggers when the
// tell-tale marker char (U+201A) is present, so normal clean text is never touched.
const MAC_ROMAN_HI = [196,197,199,201,209,214,220,225,224,226,228,227,229,231,233,232,234,235,237,236,238,239,241,243,242,244,246,245,250,249,251,252,8224,176,162,163,167,8226,182,223,174,169,8482,180,168,8800,198,216,8734,177,8804,8805,165,181,8706,8721,8719,960,8747,170,186,937,230,248,191,161,172,8730,402,8776,8710,171,187,8230,160,192,195,213,338,339,8211,8212,8220,8221,8216,8217,247,9674,255,376,8260,8364,8249,8250,64257,64258,8225,183,8218,8222,8240,194,202,193,203,200,205,206,207,204,211,212,63743,210,218,219,217,305,710,732,175,728,729,730,184,733,731,711];
const MAC_ROMAN_INV = {}; MAC_ROMAN_HI.forEach((cp,i)=>{ MAC_ROMAN_INV[cp] = 0x80+i; });
function repairMojibake(str) {
  if (typeof str !== 'string' || str.indexOf('\u201A') === -1) return str;
  try {
    const bytes = [];
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      if (cp < 0x80) bytes.push(cp);
      else if (MAC_ROMAN_INV[cp] !== undefined) bytes.push(MAC_ROMAN_INV[cp]);
      else return str; // unmappable char present — bail out rather than risk corrupting it
    }
    return Buffer.from(bytes).toString('utf8');
  } catch(e) { return str; }
}

// --- read inputs from the workflow ---
let extraction = $json;
try{
  if (extraction && extraction.content && Array.isArray(extraction.content)) {           // Anthropic HTTP response
    let txt = extraction.content.map(c=>c.text||'').join('');
    txt = repairMojibake(txt);
    extraction = JSON.parse(txt.replace(/^\s*```json\s*/i,'').replace(/```\s*$/,'').trim());
  } else if (typeof extraction === 'string') {
    extraction = JSON.parse(repairMojibake(extraction));
  }
}catch(e){ return [{ json: { error:{ stage:'extraction_parse', message:'Claude did not return valid JSON: '+e.message, retryable:true } } }]; }

let body = {}, assumptions = {};
try { body = $('Webhook').first().json.body || {}; assumptions = body.assumptions || {}; } catch(e){}

const deal = buildDeal(extraction, assumptions, body);
const out = screen(deal, { RULES, RULE_SET_VERSION });
out.metrics = computeMetrics(deal, mergeAssumptions(assumptions));
out.meta = Object.assign({ runId: (body&&body.run_id)||null }, out.meta||{});
// Carry the extracted OM text through so the deal chat can quote and cite the source
// document itself, not just the computed analysis. Capped to keep the payload sane.
out.source = {
  text: repairMojibake(__raw).slice(0, 120000),
  pages: __pages,
  chars: __chars,
  truncated: __chars > 120000
};
return [{ json: out }];

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
module.exports = { RULES, RULE_SET_VERSION };

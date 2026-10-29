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

module.exports = { screen, VERDICT_BANDS, SEVERITY_FACTOR };

# Risk & Red-Flag Engine — Multifamily Deal Screening

Institutional risk-review engine for the CBRE × Project Destined deal-screening agent.
Built for **Example Tower** and architecturally reusable for any multifamily OM.

## What it does
Takes an extracted deal object → applies a versioned rule set → returns a full risk assessment:
composite score, verdict, deal risk posture, and per-risk detail (category, severity,
triggered rule, evidence, **OM page citation**, why it matters, **estimated $ impact**,
recommended next action, DD-required).

## Files
| File | Role |
|---|---|
| `ruleEngine.js` | Pure engine — `screen(deal, ruleset)`. **Drop into an n8n Code node.** |
| `rules.js` | 20-rule library (v1.0). Metadata = data (→ Supabase); `evaluate()` = logic. |
| `exampleDeal.js` | The only property specific file. A synthetic fixture, not a real deal. |
| `run.js` | Runner → writes `../example-risk-report.{json,md}`. |
| `genSql.js` | Emits `seed.sql` (rules + assessment + flags) for Supabase. |
| `seed.sql` | Generated idempotent seed. |

## Run
```bash
node run.js        # screen Example Tower → report JSON + MD
node genSql.js     # regenerate Supabase seed after editing rules/deal
```

## Design (per lecture guidance)
- **Rules are data, not a prompt.** Thresholds/weights/text live in Supabase `risk_rules`
  (`params` jsonb); the engine only applies them → change a threshold, no redeploy.
- **Two-level rules** (L1 flag → L2 escalate) with a why-not / mitigant branch.
- **Severity-weighted scoring**: pointsLost = weight × factor
  (CRITICAL 1.0 · HIGH 0.75 · MEDIUM 0.4 · LOW 0.2 · INSUFFICIENT_DATA 0.5 · PASS 0),
  normalized to 100. Verdict bands: 80+ Pursue · 60–79 Proceed · 40–59 Conditional/Re-Trade · <40 No-Go.
- **Guardrail layer** (pricing, data integrity, missing DD) runs first and **caps the verdict** —
  unresolved data gaps can't clear into a buy.
- **Risk-synthesis heuristic** → deal risk posture (any 1 CRITICAL → CRITICAL; 2+ HIGH → CRITICAL; 3+ MEDIUM → HIGH).
- **PASS rules retained** (debt yield, LTV, market) to prove the set discriminates.
- **Deterministic** — all math in code, never the LLM.

## Rule set v1.0 — categories covered
Occupancy/vacancy · loss-to-lease · rent growth · renovation premium · NOI quality ·
expense anomalies · management fee · capex/reserve adequacy · deferred maintenance ·
cap rate & pricing · DSCR · LTV · debt yield · market fundamentals · comparables ·
regulatory · tax/reassessment · lease rollover · data integrity · missing DD.

## Supabase (rules-as-data)
Tables: `risk_rules` (versioned rule config), `risk_assessments` (per-run result),
`risk_flags` (per-rule output, FK to assessment). Project `scrkenjdebyqqxxmozzz`.
Lovable reads `risk_flags` for a screening to render the dashboard; n8n writes a new
`risk_assessments` + `risk_flags` set per OM run.

## Reuse for a new OM
1. Produce a new deal object like `exampleDeal.js` (the n8n → Claude extractor emits this shape).
2. `screen(newDeal, ruleset)` — done. No engine or rule change needed.
3. Tune thresholds by editing `risk_rules.params` in Supabase (or `rules.js`), bump `version`.

## Example Tower result (rule-set v1.0)
**Score 40/100 → CONDITIONAL — RE-TRADE · deal risk posture CRITICAL**
3 critical (manufactured NOI, occupancy/leased gap, unfunded value-add capex) ·
2 high (missing DD, aggressive rent growth) · 9 medium · 1 low · 2 insufficient-data · 3 pass.
Thesis: trophy Central submarket asset, aggressive OM economics — re-underwrite to trailing actuals and re-trade on basis.

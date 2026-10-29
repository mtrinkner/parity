# PRODUCT REQUIREMENTS — Multifamily Deal Screening AI Agent
**Project:** CBRE × Project Destined — AI Agents: CRE Investments Hackathon
**Canonical spec — v1.0** · Active property: **Example Tower** (Metro City) · Architecturally reusable for any multifamily OM
**Status:** source of truth. Every implementation decision references this doc before code is written.

> This is a project-specific specification, not a template. The Session-4 "requirements file" table below is filled for THIS app; the sections that follow are the detailed contract.

---

## 0. Requirements file (Session-4 format, filled)

| Field | Our app |
|---|---|
| **App name** | **PARITY** — Multifamily Deal Screener (working name; confirm before submission) |
| **What it does** | Reads a multifamily Offering Memorandum, re-underwrites it from trailing actuals, runs a versioned risk-rule engine, and returns a defensible **risk position + valuation + investment verdict** — not a summary. |
| **It accepts** | A multifamily OM uploaded as a PDF (broker/analyst). Optional: user overrides for purchase price and financing. |
| **It displays** | Property overview, unit mix, occupancy, re-underwritten NOI, cap rate, price/unit, price/SF, DSCR, LTV, debt yield, cash flow, valuation matrix, color-coded risk flags with evidence + OM page, composite score, verdict, and missing-DD tracker. |
| **Visual style** | Clean institutional dashboard; dark-neutral base; color reserved for severity (red/amber/green); tabular right-aligned numerals; no marketing gloss. Easy for a judge to scan. |
| **Required features** | OM upload; metric cards; risk badges w/ severity; **provenance/OM-page citations**; deal summary; valuation matrix; **exportable investment report**; **optional OM chatbot (RAG)**. |
| **Frontend layer** | **Lovable** — dashboard UI, PDF upload, metric cards, risk-badge feed, valuation & report views, export. |
| **Backend layer** | **n8n** — receives PDF, orchestrates extraction → compute → rules → score → persist, returns JSON; async (202 + status polling). |
| **Agent + LLM** | **Claude** — extracts OM data to strict JSON with per-field confidence + page; writes the narrative memo from computed numbers only (never the raw OM). All math is deterministic code, not the LLM. |
| **Database** | **Supabase** — stores deals, extracted metrics, versioned risk rules, assessments, flags, and reports for the dashboard and deal log. |

---

## 1. Overview — what the application does
An analyst uploads a multifamily OM. The system:
1. Extracts every material figure (property, rent roll/unit mix, T-12 & seller pro forma, debt, market) with **confidence scores and OM page citations**.
2. **Re-underwrites** the deal from trailing actuals in deterministic code (the OM is a marketing document; its headline figures are claims, not facts).
3. Runs a **versioned risk-rule engine** (two-level rules, guardrails, severity-weighted scoring).
4. Produces a **composite risk score, verdict, valuation, and IC-style report** — with a clear "who should buy and why / at what basis" conclusion.
5. Presents it in a live, navigable Lovable app and offers an exportable report (and optional OM chatbot).

**Guiding test for every feature:** *does it improve an institutional investor's ability to decide on this asset?* If not, cut it.

## 2. Users / personas
- **Primary — Acquisitions Analyst / Associate:** uploads OM, reviews flags & metrics, exports the memo for IC. Wants speed + defensibility (evidence, citations).
- **Secondary — Investment Committee / VP:** reads the verdict, top risks, valuation range, and thesis; drills into evidence on demand.
- **Tertiary — Judge (hackathon):** opens the live app cold, navigates the screening, and evaluates agent logic, CRE insight, UI/UX, and honesty.

## 3. Inputs
- **Required:** one multifamily OM as PDF (up to ~250 pages, ~25 MB).
- **User-editable assumptions:** purchase price (OMs are often unpriced), financing (LTV, rate, amort, IO), exit cap, hold, growth/expense levers, rule thresholds (guardrail-configurable).
- **Optional runtime toggles (guardrail panel):** web-search on/off, model select, token budget.
- **NOT trusted as input:** the OM's own subtotals/NOI — recomputed and reconciled, not accepted.

## 4. Outputs
- Structured **deal JSON** (the canonical contract — §17).
- **Dashboard**: metric cards, risk feed, valuation matrix, DD tracker.
- **Investment report** (exportable PDF/HTML): overview, unit mix, re-underwritten financials, NOI bridge, valuation, risk flags w/ evidence, missing-DD, verdict + thesis.
- **Risk assessment** persisted to Supabase (`risk_assessments` + `risk_flags`).
- Every figure and flag traceable to an OM page or a named external source.

## 5. Feature requirements (MoSCoW; F# maps to the Feature & Architecture diagram)
**MUST**
- F1 OM upload & intake (PDF, drag-drop, states).
- F2/F3 Extraction: rent roll/unit mix + metric engine → structured JSON, **per-field confidence + page**.
- F5/F6 Document-integrity audit + extraction-confidence badges.
- Deterministic compute: NOI, cap rate, price/unit, price/SF, DSCR, LTV, debt yield, cash flow.
- F10 Risk-flag engine (the built 20-rule engine, rules-as-data, two-level, guardrails, severity-weighted).
- F13 Composite score & verdict.
- F14 Implied valuation matrix (required — Example Tower is unpriced).
- F16 Generated investment report (exportable) — the required end deliverable.
- Provenance everywhere; **INSUFFICIENT-DATA states, never a dash/zero/false pass.**
- Live deployed Lovable app; judge collaborator added.

**SHOULD**
- F7 like-for-like $/SF rent normalization; F8 pro forma vs T-12 bridge; F9 renovation-capital adequacy.
- F11 regulatory/tax screen; F15 re-trade quantifier; F17 guardrail config panel; human override w/ audit log.
- Deal Log (historical screenings / comp memory).

**COULD**
- F18 OM chatbot (RAG, grounded, cited) — the rubric's optional differentiator.
- F12 market-research agent (web search for comps/vacancy) behind the guardrail toggle.

**WON'T (this phase)**
- Multi-asset portfolio roll-up; non-multifamily asset classes; live CoStar API (use OM + optional web search).

## 6. AI responsibilities (Claude)
- **Extract, don't compute.** Emit strict JSON against a schema with confidence + page per field; re-ask on schema-validation failure; merge multi-chunk keeping highest confidence.
- **Never invent.** Missing input → explicit `insufficient_data` entry naming the document required.
- **Distinguish** verified actuals · seller projections · calculated values · user assumptions · missing.
- **Memo writer sees only computed JSON**, never the raw OM; reject/retry if it emits a number not in the input.
- All arithmetic and rule evaluation are **deterministic code**, not the model.
- Chatbot (if built): answer only from the indexed OM + computed results, with citations; refuse ungrounded questions.

## 7. Frontend requirements (Lovable — required)
- **6 routes** in a persistent left sidebar: Upload & Configure · Dashboard · Flags · Valuation & Re-Trade · Report · Deal Log. Persistent header: property, units, score chip, verdict badge.
- **Components:** MetricCard, SeverityChip, RiskScoreCard, FlagRow, WhyFlaggedPanel (why/evidence/page/next action), DataTable (tabular numerals, right-aligned), PageCitationChip, ValuationMatrix, StageTracker, GuardrailPanel, DDTrackerTable, EmptyState, ErrorState, LoadingSkeleton (skeletons, not spinners).
- **Style:** institutional; color = severity only (red Critical, amber High/Medium, green Pass); no gradients/hero/marketing copy.
- **Responsive:** >1280 sidebar + multi-column; 768–1280 collapsible + 2-col + scroll tables w/ frozen first column; <768 bottom tabs + single column + stacked flag cards.
- **Deploy:** published production URL; screenshot the live app (never the editor); add `hackathons@projectdestined.com` collaborator.
- **API keys in Lovable env vars only** — never in prompts or front-end code.

## 8. Backend / workflow requirements (n8n — required)
- **Async contract:** `POST /webhook/om-upload` (multipart, PDF under `om_file` + `deal_name` + `guardrails` JSON) → **202 in <2s** with `run_id`/`status:queued`; front end polls `GET /webhook/om-status?run_id=` (parsing → extracting → computing → scoring → writing).
- **Node chain:** Webhook → Write Binary File → Extract from File → IF text-density → OCR fallback → validate doc (rent roll + cashflow found) → split pages → Claude extract (strict JSON schema) → merge chunks → schema validator (re-ask) → **Code: compute (all math)** → reconcile to OM printed totals (fail loud >0.5%) → **Code: rules engine (reads `risk_rules` table)** → Code: score/verdict → Claude memo (computed JSON only) → persist to Supabase → Respond.
- **Determinism, split large PDFs (OOM guard), publish production webhook** (not the test URL).
- The **risk engine is already built** as portable JS (`risk-engine/ruleEngine.js` + `rules.js`) — paste into the Code node; feed the extracted deal object.

## 9. Database requirements (Supabase — live, project `scrkenjdebyqqxxmozzz`)
Existing (built): `risk_rules` (versioned rule config, params jsonb), `risk_assessments`, `risk_flags`.
**To add:** `deals` (property + transaction facts + source OM + run metadata), `deal_metrics` (extracted + computed values w/ confidence + page + provenance-type), `reports` (generated memo + export URL), optional `deal_documents` (uploaded file refs) and `chat_chunks` (RAG index for the chatbot).
- Rules-as-data: editing a threshold in `risk_rules.params` changes behavior with no redeploy; every assessment stamps `rule_set_version`.
- Lovable reads `risk_flags`/`deal_metrics` for a run; n8n writes a new assessment per OM.

## 10. Excel model integration
- The **15-sheet underwriting model** (`Example Tower - Multifamily Underwriting Model.xlsx`) is the analytical backbone and audit reference. `underwriting-model-field-mapping.json` maps OM fields → cells so the extractor can auto-populate a workbook per deal.
- The app's compute logic mirrors the model (NOI bridge, cap-rate matrix, DSCR/returns) so on-screen numbers reconcile to the workbook.
- **Optional feature:** "Download underwriting model" — populate the template from the deal JSON via the field mapping and offer the .xlsx as an export alongside the PDF report.

## 11. Risk engine behavior (built — v1.0)
- 20 rules across every required category; **rules-as-data** (metadata in `risk_rules`, logic in engine).
- **Two-level** rules (L1 flag → L2 escalate) + why-not/mitigant branch.
- **Severity-weighted scoring** normalized to 100 (CRITICAL 1.0 · HIGH .75 · MEDIUM .4 · LOW .2 · INSUFFICIENT .5 · PASS 0). Verdict bands: 80+ Pursue · 60–79 Proceed · 40–59 Conditional/Re-Trade · <40 No-Go.
- **Guardrail layer** (pricing, data integrity, missing DD) caps the verdict — data gaps can't clear into a buy.
- **Deal risk posture** heuristic (any 1 CRITICAL → CRITICAL; 2+ HIGH → CRITICAL; 3+ MEDIUM → HIGH).
- **PASS rules retained** to prove discrimination. Every flag: category · severity · triggered rule · evidence · OM page · why it matters · **estimated $ impact** · next action · DD-required.
- Example Tower result: **40/100 → CONDITIONAL — RE-TRADE, posture CRITICAL.**

## 12. Report generation
- Sections: property overview · unit mix · occupancy · re-underwritten financials · NOI bridge · valuation matrix / re-trade · risk flags (w/ evidence + page) · missing-DD · verdict + thesis ("who should buy, at what basis, why").
- Auto-generated from computed JSON (not hand-written); exportable to PDF/HTML; optionally the populated .xlsx.
- The on-stage line for the demo: state the verdict and the one number that changes the decision.

## 13. User interactions
Upload OM → watch stage tracker → land on Dashboard → scan metric cards + score/verdict → open Flags (expand WhyFlagged panels w/ citations) → Valuation & Re-Trade (adjust price/financing, matrix recalcs) → override a flag if warranted (writes to audit log, recomputes score) → export report → (optional) ask the OM chatbot a question → save to Deal Log.

## 14. Success states
- Agent parses the OM and returns all required metrics with citations.
- Risk flags identified **and explained**; verdict rendered with a clear basis.
- Report auto-generated and exportable; live app navigable by a judge.
- Reconciliation checks pass (recomputed NOI ties to OM within rounding).
- (Optional) chatbot answers grounded, cited questions.

## 15. Error states
- Unreadable/image-only PDF → OCR fallback; if still empty → `NO_TEXT_LAYER` error state w/ retry.
- No rent roll / no cashflow detected → structured `NO_RENT_ROLL` / `NO_CASHFLOW`.
- Extraction low-confidence → flag fields for review, don't silently accept.
- Schema-validation failure → re-ask loop; after N tries → surface partial + error.
- Reconciliation mismatch >0.5% → data-integrity flag, don't hide it.
- n8n/model/timeout errors → user-visible error state with retry, cost cap, and a stubbed fallback path.
- Upload too large → split/guide; corrupt/non-OM PDF → reject with reason.

## 16. Edge cases
- **Unpriced OM (Example Tower):** no going-in cap/PPU → valuation matrix + INSUFFICIENT-DATA gate; require user price for returns.
- **Free-and-clear (no debt):** DSCR/LTV/debt-yield depend on user financing; show as assumption-driven.
- **Occupied ≠ leased** (96% vs 85%): surface the gap, don't average it away.
- **Manufactured NOI** (expense cuts below T-12): re-underwrite to actuals; flag.
- **Retail/mixed-use** (Anchor restaurant tenant abatement, rollover): model separately, don't blend away.
- **Internal OM inconsistencies** (concrete vs steel, comp-label conflicts): data-integrity flag + reconcile.
- **Large PDF / scanned pages / non-standard rent-roll formats:** split, OCR, validate.
- **Multiple documents** (OM + supplements): accept and merge.

## 17. Canonical data contract (the single most important artifact)
`POST /webhook/om-upload` → 202 `{ run_id, deal_id, status:"queued" }`; poll → final:
```json
{
  "deal": { "name","address","submarket","units","yearBuilt","nrsf","retailSf","sourceOM" },
  "metrics": [ { "key","label","value","unit","provenance":"actual|seller|calculated|assumption","confidence":0-1,"omPage" } ],
  "financials": { "t12":{...}, "seller":{...}, "underwritten":{...}, "cashflow":[...], "noiBridge":[...] },
  "valuation": { "matrix":[ {"cap","noiBasis","value","perUnit","perSf"} ], "goingInCap":{...} },
  "debt": { "ltv","rate","amortYears","ioYears","dscr","debtYield" },
  "flags": [ { "ruleId","rule","category","severity","level","evidence","omPage","whyItMatters","financialImpact","recommendedNextAction","additionalDDRequired","guardrail" } ],
  "score": { "composite","verdict","dealRiskPosture","guardrailCapped","counts" },
  "insufficient_data": [ { "field","documentRequired","omPage" } ],
  "report": { "thesis","exportUrl" },
  "meta": { "ruleSetVersion","generatedFrom","runId" }
}
```
Error: `{ stage, code, message, retryable }`.

## 18. Non-functional
- **Security:** API keys in n8n credentials + Lovable env vars only; never in prompts/repo.
- **Performance:** 202 in <2s; full screening target < a few minutes; split PDFs to avoid OOM; cost cap per run.
- **Reliability:** end-to-end tested; publish production URLs; spec must match the live build exactly (no spec-vs-build drift).
- **Auditability:** provenance + citations on every figure; rule-set version stamped; overrides logged.

## 19. Design challenges & improvements over the base prompt (adopted)
1. **Re-underwrite, don't summarize.** The base ask is "extract + flag"; we compute a defensible *re-underwritten* NOI/value and a re-trade number — the differentiator judges reward.
2. **Rules-as-data + guardrail cap + severity-weighted scoring** (beyond a flat rule list) — already built; superior to a prompt-embedded rule list.
3. **INSUFFICIENT-DATA as a first-class state** (never a false pass) — directly targets the "no hallucination" rubric line.
4. **Provenance/citation on every figure** — targets "risk flags justified" and defends against "the robots were wrong."
5. **Valuation matrix for unpriced OMs** — a feature, not a workaround.
6. **Excel model as reconciliation backbone + optional export** — proves the numbers, adds a tangible deliverable.
7. **Honesty in the demo** — show built-vs-designed truthfully; a working end-to-end call with a stubbed middle beats a broken live one.
8. **Deal Log / memory** — historical comp database over time (stretch, rewarded as "trying something new").

## 20. Open decisions (resolve before/at build)
- Final app name (PARITY vs alternative) — confirm before submission for spec-vs-build consistency.
- Chatbot in scope for submission? (optional; build only if core is solid.)
- Web-search market agent on by default or user-toggled? (default off; guardrail toggle.)
- Purchase-price handling in UI: require user entry vs default to assessor FMV with a visible "assumption" tag.

## 21. Traceability to judging rubric
- **AI Agent & Technical Logic (n8n):** §8 node chain, strict-JSON extraction, determinism, rules-as-data.
- **CRE Investment Analysis:** §6/§11/§12 re-underwrite, severity-weighted verdict, evidence + $ impact, clear "who/why/basis".
- **Lovable UI/UX:** §7 six routes, institutional components, states.
- **Video/Presentation:** §12 report + demo line; cover front end + back end + *motivation*; honest confidence rating.

## 22. Change log
- v1.0 — initial canonical spec. Sources: Example Tower OM dataset, all 4 hackathon + CBRE transcripts, architecture/workflow/rule-tree diagrams, PARITY playbook, judging rubric + one-pager, built underwriting model & risk engine, Supabase schema. Update this doc as development proceeds.

# n8n Workflow — Import & Setup (PARITY OM Deal Screener)

Importable workflow that implements the PRD §17 contract:
**Webhook → Extract OM text → Prep request → Claude extract (`claude-sonnet-5`) → Screen (risk engine) → Respond**, plus optional Supabase persistence. The deterministic risk engine is inlined in the "Screen (risk engine)" Code node, so it runs identically to the local engine (validated: Example Tower → **40 / CONDITIONAL — RE-TRADE / posture CRITICAL**).

## Files
- `PARITY-workflow.json` — import this into n8n.
- `codeNode.screen.js` — the Screen node body (already embedded; kept here for reference/edits).
- `codeNode.prep.js` — the Prep node body (builds the Claude request).
- `extraction-prompt.md` — the Claude extraction system prompt + deal schema.

## Step 01 — import & connect Claude (works with just the Anthropic credential)
1. **Import:** n8n → Workflows → ⋯ menu → **Import from File** → `PARITY-workflow.json`.
2. **Anthropic credential:** open **Claude extract** node → Credentials → select your **Anthropic API** credential (create it first: Credentials → New → *Anthropic API* → paste key). The node is preset to `authentication: Anthropic API` and model `claude-sonnet-5`.
3. **Activate** the workflow (toggle top-right) to expose the **production** webhook, or use **Test URL** while building.
4. Copy the **Production URL** from the Webhook node — this is what Lovable will POST to.

## Test with Example Tower
```bash
curl -X POST "<YOUR_PRODUCTION_WEBHOOK_URL>" \
  -F "om_file=@Example Tower - Example Brokerage OM Main CBRE Hackathon OM.pdf;type=application/pdf" \
  -F "deal_name=Example Tower"
```
Expected: the full screening JSON (property, metrics, flags, score, verdict, insufficient_data). For Example Tower the score should land ~**40 / CONDITIONAL — RE-TRADE**, posture **CRITICAL**.

- Optional overrides: add `-F 'assumptions={"ltv":0.6,"rate":0.0625,"exitCap":0.0525}'` (defaults are applied if omitted).
- The extractor returns the deal facts; the Code node re-underwrites NOI and runs the rules. No math is done by the model.

## Notes / gotchas
- **Binary property name:** the Extract node reads binary property **`om_file`** — this must match the upload form field. If extraction errors, open the Webhook node's output and confirm the PDF landed under `om_file` (rename in the Extract node if your client uses a different field).
- **Large OMs:** the Prep node caps OM text at ~120k chars. For very long OMs, split into page ranges before the Claude node (add a Split node) to avoid token limits / timeouts.
- **Sync vs async:** this build responds synchronously (simplest, reliable). To match the PRD's 202+poll pattern later, set the Webhook to respond "immediately" with a `run_id`, persist status to a `runs` table, and add a `GET /om-status` webhook.
- **Model:** extraction on `claude-sonnet-5` (cost-effective, strong). Change the model string in the **Prep** node if desired.

## Optional — enable Supabase persistence (nodes are disabled by default)
Two HTTP nodes (`Supabase: assessment`, `Supabase: flags`) are included but **disabled** so the core path imports and runs without extra credentials. To turn on:
1. Easiest: **replace** them with n8n's native **Supabase** node (credential: *Supabase API* → host `https://scrkenjdebyqqxxmozzz.supabase.co` + service-role key), "Create row" into `risk_assessments` then `risk_flags`.
2. Or keep the HTTP nodes and add a **Header Auth** credential plus an `apikey` header (Supabase REST needs both `apikey` and `Authorization: Bearer <service_role>`). Then enable the nodes.
The tables (`risk_rules`, `risk_assessments`, `risk_flags`) already exist in the project.

## How Lovable consumes it
Lovable POSTs the uploaded PDF to the production webhook and renders the returned JSON:
metric cards from `metrics`/`financials`, the risk feed from `flags` (severity + evidence + `omPage`),
the valuation matrix from `valuation`, the DD list from `insufficient_data`, and the header from `score`/`verdict`.
Paste a real response from the curl test into the Lovable prompt so it builds the parser against the exact shape.

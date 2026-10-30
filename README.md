# PARITY

AI deal screening for multifamily offering memorandums.

An offering memorandum is a sales document. The broker writes it, the seller pays for it, and every
number inside it is a claim rather than a fact. PARITY reads the OM, recomputes the economics from
source figures, and reports where the broker's numbers and the actual numbers stop agreeing.

Built for the CBRE x Project Destined AI Agents hackathon.

## Demo

**[Watch the walkthrough (4:26)](https://github.com/mtrinkner/parity/releases/download/v1.0/PARITY_Demo_MasonTrinkner.mp4)**  ·  [all releases](https://github.com/mtrinkner/parity/releases/tag/v1.0)

Four and a half minutes, recorded while the app was live. The first 1:43 covers the problem and the
architecture. The remaining 2:43 is the running product: the landing page, a real offering memorandum
already screened, the risk report, the grounded chat endpoint, and the n8n pipeline behind it.

> **Note on hosting.** The deployed app has been retired. It ran on a trial n8n instance and a free
> tier Supabase project, both of which lapsed after the hackathon. The video shows the system working
> end to end, and the scoring engine in this repository still runs locally with no services and no
> API keys. See [Run the risk engine locally](#run-the-risk-engine-locally).


## What it does

Upload a raw OM as a PDF. PARITY returns:

* A deal score out of 100 and a verdict (PURSUE, PROCEED, CONDITIONAL, NO GO)
* Net operating income stated three ways: trailing twelve actual, seller pro forma, and PARITY's own
  independent calculation
* Going in cap rate, levered IRR, equity multiple, price per unit
* Risk flags from a 20 rule engine, ranked by severity, each one citing the page of the OM it came from
* A provenance tag on every figure: ACTUAL, SELLER, CALCULATED, or ASSUMPTION

## Architecture

```
React front end  ->  n8n webhook  ->  Anthropic Files API (PDF as pages)
                                   ->  Claude Sonnet extraction (structured JSON + page cites)
                                   ->  risk engine (deterministic, in code)
                                   ->  Supabase Postgres (auth, deal history, rule set)
```

A second n8n workflow serves a stateless chat endpoint. The front end posts up the screening result
it already holds plus the raw OM text, and the model answers from those two sources only.

## Design decisions worth naming

**The model extracts. It does not score.** All arithmetic and all scoring run in `risk-engine/`, so
the same deal produces the same score every time. The model is used where language models are good
(reading an unstructured document) and kept away from where they are unreliable (arithmetic).

**Rules are data, not code.** The 20 rules live as rows in Supabase with their own weights and
thresholds. Changing a threshold does not require a redeploy.

**Opacity is not rewarded.** A rule that cannot find its inputs returns INSUFFICIENT_DATA instead of
guessing, and the final score is capped by the share of the rule set that actually resolved against
stated figures. A document we cannot read does not get to outscore one we can.

**Nothing is hardcoded to one deal.** The same rule set was run against four different offering
memorandums, from a 218 unit institutional asset down to a 9 unit property in another state.

## Repo layout

| Path | What it is |
| --- | --- |
| `risk-engine/` | The scoring engine. Pure JavaScript, no dependencies. |
| `risk-engine/rules.js` | The 20 rules, with weights, thresholds and evidence text. |
| `risk-engine/ruleEngine.js` | Evaluation, severity weighting, guardrails, coverage cap. |
| `risk-engine/genWorkflow.js` | Generates the main n8n workflow JSON and its code nodes. |
| `risk-engine/genChatWorkflow.js` | Generates the chat workflow JSON. |
| `n8n/` | Generated workflow JSON, prompts, and setup notes. |
| `parity-web/` | Next.js front end. |
| `PRD-Multifamily-Deal-Screening.md` | Original product spec. |

## Run the risk engine locally

No services, no API keys, no network.

```bash
cd risk-engine
node run.js
```

Scores the bundled synthetic `exampleDeal.js` fixture and writes `example-risk-report.json` and `.md`.

## Rebuilding the hosted pipeline

1. Import `n8n/PARITY-workflow.json` and `n8n/PARITY-chat-workflow.json` into any n8n instance.
2. Bind an Anthropic credential to the `Upload PDF`, `Claude extract` and `Claude chat` nodes.
3. Create the Supabase tables from `risk-engine/seed.sql`.
4. Point the front end at the new webhook URLs.

See `n8n/SETUP.md` for detail.

## Not included

The offering memorandum this project was built and tested against is a confidential, copyrighted
third party document. Neither it nor anything derived from it is in this repository: not the PDF,
not the extracted dataset, not the real deal's figures or reports.

The engine instead ships with `risk-engine/exampleDeal.js`, a synthetic fixture with an invented
property, address, broker and tenant names, and scaled figures. It exercises every one of the 20
rules and produces the same severity profile, so `node run.js` works for anyone who clones this.

// Generates the PARITY deal-chat n8n workflow (webhook: /om-chat).
//
// Stateless by design: the frontend posts the screening result it already holds
// (analysis + the OM text carried in `source.text`), the question, and recent turns.
// Nothing is persisted here, so the chat works for guests and signed-in users alike.
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "..", "n8n");

const SYSTEM_PROMPT =
`You are the PARITY deal analyst assistant. You answer an acquisitions analyst's questions
about ONE multifamily deal that PARITY has already screened.

You are given two sources for FACTS ABOUT THIS DEAL:
  (1) ANALYSIS — PARITY's computed screening result: metrics, the rule set, every raised
      flag with its severity, points lost, evidence and OM page citation, and the
      provenance tag on each figure (ACTUAL / SELLER / CALCULATED / ASSUMPTION).
  (2) OM TEXT — the raw text extracted from the Offering Memorandum.

TWO KINDS OF QUESTION — handle them differently:

A. CONCEPT QUESTIONS ("what is NOI", "what's a cap rate", "what does DSCR mean", "why
   does loss-to-lease matter", "how is equity multiple calculated", "what is a T-12").
   Answer these from your own commercial real estate knowledge — clearly and concisely,
   the way a senior analyst would explain it to a junior one. You do NOT need a source in
   the ANALYSIS or OM to explain a standard industry concept, and you must not refuse
   these. Give the definition, why it matters, and the formula when there is one.
   THEN, whenever this deal has a relevant figure, ground the concept in it: give the
   deal's number with its provenance and page cite so the definition lands on something
   concrete. Keep that second part short — one or two sentences.

B. FACT QUESTIONS about this specific deal (any number, claim, date, name, or condition
   of this property). These are strictly grounded — see the rules below.

GROUNDING RULES for deal facts — these are absolute:
- Never invent, estimate, or infer a number for THIS DEAL. If a figure is not in the
  ANALYSIS or the OM TEXT, say plainly that the OM does not state it.
- Never present general knowledge as a fact about this property. Typical market ranges,
  rules of thumb and industry benchmarks are fine to mention, but label them as general
  context, clearly separated from what this OM actually says.
- Prefer the ANALYSIS over the OM for any computed figure. The OM is a MARKETING
  document: its headline numbers are claims, not facts. PARITY's re-underwritten figures
  are the independent view.
- When a broker claim and PARITY's calculation disagree, say so explicitly and give both,
  labelled. That gap is usually the most useful thing you can tell the analyst.
- Always carry provenance. State whether a number is a trailing actual, a seller pro
  forma claim, a PARITY calculation, or an assumption. Cite the OM page (e.g. p9) when
  the ANALYSIS or OM TEXT gives one.
- Do not give investment advice or a buy/sell recommendation. You may explain what the
  score, verdict and flags mean and what due diligence would resolve them.
- Multifamily and commercial real estate questions are always in scope, even when they
  are not about this deal. Only decline things genuinely unrelated to real estate or to
  this screening.

STYLE: direct and analytical, like a colleague on the acquisitions desk. Lead with the
answer, then the evidence. Use short paragraphs; use a compact table only when comparing
figures. Never pad. Do not repeat the question back. Two to six sentences is usually right.`;

const prepNode = `// Build the Anthropic request for a grounded question about one screened deal.
const b = $json.body || $json || {};
const question = (b.question || '').toString().trim();
if (!question) {
  return [{ json: { __guard:'NO_QUESTION', model:'claude-sonnet-5', max_tokens:16,
    messages:[{ role:'user', content:'Reply with the single word: skip' }] } }];
}

const deal = b.deal || {};
// Strip the bulky source text out of the analysis blob, then re-attach it separately
// so we control exactly how much OM text goes into the prompt.
const analysis = Object.assign({}, deal);
const omText = ((deal.source && deal.source.text) || b.om_text || '').toString();
delete analysis.source;

const OM_BUDGET = 90000;
const omExcerpt = omText.slice(0, OM_BUDGET);

let analysisJson = '';
try { analysisJson = JSON.stringify(analysis, null, 1); } catch(e) { analysisJson = '{}'; }
if (analysisJson.length > 90000) analysisJson = analysisJson.slice(0, 90000) + '\\n… (analysis truncated)';

// Recent turns only — keeps latency and cost bounded.
const history = Array.isArray(b.history) ? b.history.slice(-8) : [];
const messages = [];
for (const turn of history) {
  const role = turn && turn.role === 'assistant' ? 'assistant' : 'user';
  const content = (turn && turn.content || '').toString().slice(0, 4000);
  if (content) messages.push({ role, content });
}

messages.push({ role:'user', content:
  'ANALYSIS (PARITY computed screening result):\\n' + analysisJson +
  '\\n\\nOM TEXT (raw extract from the Offering Memorandum' +
  (omText.length > OM_BUDGET ? ', truncated' : '') + '):\\n' + omExcerpt +
  '\\n\\nQUESTION:\\n' + question });

return [{ json: {
  model: 'claude-sonnet-5',
  max_tokens: 1500,
  system: ${JSON.stringify(SYSTEM_PROMPT)},
  messages
} }];`;

const formatNode = `// Normalise the Anthropic response into { answer } for the UI.
const MAC_ROMAN_HI = [196,197,199,201,209,214,220,225,224,226,228,227,229,231,233,232,
234,235,237,236,238,239,241,243,242,244,246,245,250,249,251,252,8224,176,162,163,167,
8226,182,223,174,169,8482,180,168,8800,198,216,8734,177,8804,8805,165,181,8706,8721,
8719,960,8747,170,186,937,230,248,191,161,172,8730,402,8776,8710,171,187,8230,160,192,
195,213,338,339,8211,8212,8220,8221,8216,8217,247,9674,255,376,8260,8364,8249,8250,
64257,64258,8225,183,8218,8222,8240,194,202,193,203,200,205,206,207,204,211,212,63743,
210,218,219,217,305,710,732,175,728,729,730,184,733,731,711];
const MAC_ROMAN_INV = {}; MAC_ROMAN_HI.forEach((cp,i)=>{ MAC_ROMAN_INV[cp] = 0x80+i; });
function repairMojibake(str){
  if (typeof str !== 'string' || str.indexOf('\\u201A') === -1) return str;
  try {
    const bytes = [];
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      if (cp < 0x80) bytes.push(cp);
      else if (MAC_ROMAN_INV[cp] !== undefined) bytes.push(MAC_ROMAN_INV[cp]);
      else return str;
    }
    return Buffer.from(bytes).toString('utf8');
  } catch(e){ return str; }
}

let guard = null;
try { guard = $('Prep chat request').first().json.__guard || null; } catch(e){}
if (guard === 'NO_QUESTION') {
  return [{ json: { error: { code:'no_question', message:'Ask a question about this deal.' } } }];
}

const r = $json || {};
let text = '';
if (r && Array.isArray(r.content)) text = r.content.map(c=>c.text||'').join('');
else if (typeof r === 'string') text = r;
text = repairMojibake(text).trim();

if (!text) {
  return [{ json: { error: { code:'empty_response',
    message:'The assistant did not return an answer. Please try again.', retryable:true } } }];
}
return [{ json: { answer: text, model: r.model || null,
  usage: r.usage ? { input: r.usage.input_tokens, output: r.usage.output_tokens } : null } }];`;

fs.writeFileSync(path.join(OUT, "codeNode.chatPrep.js"), prepNode);
fs.writeFileSync(path.join(OUT, "codeNode.chatFormat.js"), formatNode);

const node = (name, type, tv, pos, params, extra={}) =>
  Object.assign({ parameters: params, id: name.replace(/\W/g,'_'), name, type, typeVersion: tv, position: pos }, extra);

const wf = {
  name: "PARITY — Deal Chat",
  nodes: [
    node("Webhook", "n8n-nodes-base.webhook", 2, [0,300], {
      httpMethod:"POST", path:"om-chat", responseMode:"responseNode", options:{ rawBody:false } },
      { webhookId: "parity-om-chat" }),
    node("Prep chat request", "n8n-nodes-base.code", 2, [220,300], { jsCode: prepNode }),
    node("Claude chat", "n8n-nodes-base.httpRequest", 4.2, [440,300], {
      method:"POST", url:"https://api.anthropic.com/v1/messages",
      authentication:"predefinedCredentialType", nodeCredentialType:"anthropicApi",
      sendHeaders:true, headerParameters:{ parameters:[{ name:"anthropic-version", value:"2023-06-01" }] },
      sendBody:true, specifyBody:"json", jsonBody:"={{ JSON.stringify($json) }}", options:{} }),
    node("Format reply", "n8n-nodes-base.code", 2, [660,300], { jsCode: formatNode }),
    node("Respond", "n8n-nodes-base.respondToWebhook", 1, [880,300], {
      respondWith:"json", responseBody:"={{ JSON.stringify($json) }}", options:{} })
  ],
  connections: {
    "Webhook": { main: [[{ node:"Prep chat request", type:"main", index:0 }]] },
    "Prep chat request": { main: [[{ node:"Claude chat", type:"main", index:0 }]] },
    "Claude chat": { main: [[{ node:"Format reply", type:"main", index:0 }]] },
    "Format reply": { main: [[{ node:"Respond", type:"main", index:0 }]] }
  },
  settings: {}
};

fs.writeFileSync(path.join(OUT, "PARITY-chat-workflow.json"), JSON.stringify(wf, null, 2));
fs.writeFileSync(path.join(OUT, "chat-prompt.md"),
  `# PARITY deal-chat system prompt\n\nModel: \`claude-sonnet-5\`\n\n\`\`\`\n${SYSTEM_PROMPT}\n\`\`\`\n`);

console.log("Wrote n8n/: PARITY-chat-workflow.json, codeNode.chatPrep.js, codeNode.chatFormat.js, chat-prompt.md");
console.log("chat prep node:", prepNode.length, "chars | format node:", formatNode.length, "chars");

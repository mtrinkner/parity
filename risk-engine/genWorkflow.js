/**
 * Generates an importable n8n workflow (PARITY-workflow.json) plus the standalone
 * Code-node source and the Claude extraction prompt. The deterministic engine is
 * inlined from rules.js + ruleEngine.js so the workflow runs identically to local.
 */
const fs = require("fs"), path = require("path");
const DIR = __dirname;
const OUT = path.join(DIR, "..", "n8n");
fs.mkdirSync(OUT, { recursive: true });

const strip = s => s
  .replace(/module\.exports[^\n]*;?/g, "")
  .replace(/^\s*const\s*\{[^}]*\}\s*=\s*require\([^)]*\);?\s*$/gm, "");

const rulesSrc  = strip(fs.readFileSync(path.join(DIR, "rules.js"), "utf8"));
const engineSrc = strip(fs.readFileSync(path.join(DIR, "ruleEngine.js"), "utf8"));

// ---- deal-facts JSON schema Claude must return ----
// NOTE: nothing here may be specific to any one OM. `pages` is how citations become
// data: Claude reports where in THIS document each figure was found, and the engine
// cites that. Where a page is unknown we show no citation rather than a wrong one.
const DEAL_SCHEMA = `{
  "pages": {
    "units","occupancy","rents","noiT12","noiSeller","gsr","expenses","reserves",
    "price","tax","rentRoll","comps","market","retail","buildingSystems","valueAdd"
  },
  "meta": { "name","address","submarket","broker","omDate","sourceOM" },
  "property": { "units","yearBuilt","stories","nrsf","retailSf","avgUnitSf" },
  "occupancy": { "physical"(0-1),"leased"(0-1) },
  "rents": { "avgEffRent","avgEffPsf","submarketAAPsf" },
  "income": {
    "gsr":{"t12","t3ann","current","seller"},
    "vacancy":{"t12","current","seller"},
    "concessions":{"t12","current","seller"},
    "badDebt":{"t12","current","seller"},
    "egi":{"t12","current","seller"} },
  "expenses": {
    "controllable":{"t12","current","seller"},
    "turnover":{"t12","seller"}, "rm":{"t12","seller"},
    "mgmtFee":{"t12","current","seller","pctOfEgi"},
    "reTaxes":{"t12","seller"}, "insurance":{"t12","seller"},
    "reserves":{"t12","seller","perUnit"} },
  "noi": { "t12","current","seller" },
  "tax": { "fmv","assessedValue","ratio","mill","amount","parcel" },
  "pricing": { "askingPrice"(null if unpriced),"statedCapRate","assessorFmv" },
  "debt": { "inPlace","freeAndClear" },
  "valueAdd": { "reservesPerUnit","renovationCapexBudgeted","interiorPremiumsClaimed","roiSheetInOM","fitnessModernizationClaimed" },
  "buildingSystems": { "roofYear","roofType","boilerReplaced","pcaProvided" },
  "retail": { "sf","anchorTenant","anchorSf","anchorPctSf","anchorAbatement2026","rollWithinHoldPctSf" },
  "market": { "officeVacancy","retailVacancy","submarketMfVacancyEst","pipelineUnitsCCR","avgHhIncome1mi","rentControl" },
  "comps": { "providedCount","internalInconsistency" },
  "dataIntegrity": { "documentedInconsistencies","notes":[...] },
  "rentRoll": { "unitLevelProvided","lossToLeaseDisclosed","marketRentDisclosed" },
  "regulatory": { "jurisdiction","rentControl","affordableUnitsDisclosed" },
  "missingDD": { "criticalMissingCount","items":[...] }
}`;

const SYSTEM_PROMPT =
`You are a senior multifamily acquisitions analyst extracting a deal from an Offering Memorandum.
Return ONLY a single JSON object matching this schema (no prose, no markdown fences):
${DEAL_SCHEMA}
Rules:
- pages: for each key, give the page number in THIS document where you found that figure,
  as a string like "p9". Use the OM's own printed page numbering when it has one. Set a key
  to null if you did not find it or are unsure — a wrong citation is far worse than none.
  Never carry over a page number from any other document.
- COLUMN MAPPING. OMs label their financial columns differently by deal size. Map them:
  * "T-12", "Trailing 12", "TTM", "Actual", "In-Place", "Current", "Historical" -> the t12 field
    (use "current" as well when the OM shows BOTH a trailing statement and a separate in-place column).
  * "Pro Forma", "Proforma", "Projected", "Year 1", "Stabilized", "Market" -> the seller field.
  A small OM often shows only "In-Place" and "Pro Forma" with no trailing statement at all — in that
  case put the in-place figures in t12 and the pro forma figures in seller. Do not leave t12 null
  merely because the document never uses the words "T-12".
- Expenses are POSITIVE magnitudes. Occupancy as decimals (0.96), percentages as decimals (0.02).
- Use null for any value not stated in the OM. NEVER invent a number. If the OM is unpriced, pricing.askingPrice=null.
- Do NOT compute NOI or ratios; extract only what the OM states (line items and reported totals).
- dataIntegrity.notes = short list of internal contradictions you observe, one clause each. Set documentedInconsistencies = notes.length.
- missingDD.items = the core underwriting documents NOT provided in the OM. Choose ONLY from this exact
  vocabulary, using these exact strings, and list them in this order. Do not invent other items:
  ["unit-level rent roll","T-12 operating statement","trailing bank statements","executed leases",
   "property condition assessment (PCA)","environmental site assessment (Phase I)","capital expenditure history",
   "tax appeal history","insurance loss runs","service contracts","title / survey","utility billing detail"]
  Include an item only if the OM does not provide it. Set criticalMissingCount = items.length.`;

// ---- buildDeal + re-underwrite bridge + n8n wrapper (runs inside the Code node) ----
const WRAPPER = `
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
    if (typeof v === 'string' && /^p?\\d+$/i.test(v.trim())) return v.trim().replace(/^(\\d)/, 'p$1');
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
  if (typeof str !== 'string' || str.indexOf('\\u201A') === -1) return str;
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
    extraction = JSON.parse(txt.replace(/^\\s*\`\`\`json\\s*/i,'').replace(/\`\`\`\\s*$/,'').trim());
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
`;

const codeNode = `${rulesSrc}\n${engineSrc}\n${WRAPPER}`;
fs.writeFileSync(path.join(OUT, "codeNode.screen.js"), codeNode);

const prepNode = `// Build the Anthropic request.
//
// PRIMARY PATH: send the PDF itself as a document block so Claude READS THE PAGES.
// Many OMs are designed documents whose financial tables are images — a text layer
// either omits them or does not exist. Vision sees the tables regardless, which is
// what makes extraction work on any OM rather than only text-native ones.
// The extracted text is still supplied alongside as a second signal.
//
// FALLBACK: if the binary is unavailable or the document exceeds the API's per-request
// PDF limits, fall back to text-only rather than failing the run.

// Read text via explicit node reference so this node works regardless of what sits
// immediately upstream (an Upload node may be chained in between).
let raw = '', pages = 0;
try { const x = $('Extract OM text').first().json; raw = x.text || ''; pages = Number(x.numpages || 0) || 0; } catch(e) { raw = ($json.text || ''); }

// If an "Upload PDF" node ran (Files API), prefer referencing the stored file — this
// lifts the 32MB inline-base64 request cap to the Files API's 500MB.
let fileId = null;
try { const up = $('Upload PDF').first(); if (up && up.json && up.json.id) fileId = up.json.id; } catch(e) {}

// n8n stores binaries on disk in cloud mode, so binary.data is a reference id
// ("filesystem-v2"), not base64. Resolve it through the binary helpers; only treat
// binary.data as base64 when it genuinely looks like base64.
let b64 = null, mime = 'application/pdf';
try {
  const wh = $('Webhook').first();
  const bin = wh && wh.binary && (wh.binary.om_file || wh.binary.data ||
              wh.binary[Object.keys(wh.binary)[0]]);
  if (bin) {
    mime = bin.mimeType || mime;
    if (bin.id) {
      const stream = await this.helpers.getBinaryStream(bin.id);
      const buf = await this.helpers.binaryToBuffer(stream);
      b64 = buf.toString('base64');
    } else if (typeof bin.data === 'string' && bin.data.length > 1000 && /^[A-Za-z0-9+/=\\r\\n]+$/.test(bin.data.slice(0, 200))) {
      b64 = bin.data;
    }
  }
} catch(e) { b64 = null; }

// Anthropic PDF limits: 100 pages and 32MB per request. base64 inflates ~4/3.
const MAX_PAGES = 100;
const MAX_B64   = 30 * 1024 * 1024;
const pdfUsable = !!b64 && mime === 'application/pdf' &&
                  b64.length <= MAX_B64 && (pages === 0 || pages <= MAX_PAGES);
const fileUsable = !!fileId && (pages === 0 || pages <= MAX_PAGES);

// Only refuse when we have neither a readable PDF nor a usable text layer.
if (!fileUsable && !pdfUsable && raw.trim().length < 1000) {
  return [{ json: {
    __guard: 'NO_TEXT_LAYER',
    model: 'claude-sonnet-5', max_tokens: 16,
    messages: [ { role:'user', content: 'Reply with the single word: skip' } ]
  } }];
}

const text = raw.slice(0, 120000);
const ask = 'Read the OFFERING MEMORANDUM above in full — including tables, charts and ' +
  'figures rendered as images — and return ONLY the JSON object described in the system ' +
  'prompt. Extract every field the document states. Use null only when the document ' +
  'genuinely does not state a value.';

const content = [];
if (fileUsable) {
  content.push({ type: 'document', source: { type: 'file', file_id: fileId } });
  if (text.trim().length >= 1000) {
    content.push({ type: 'text', text: 'Text layer extracted from the same document (may be incomplete):\\n\\n' + text });
  }
} else if (pdfUsable) {
  content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
  if (text.trim().length >= 1000) {
    content.push({ type: 'text', text: 'Text layer extracted from the same document (may be incomplete):\\n\\n' + text });
  }
} else {
  content.push({ type: 'text', text: 'OFFERING MEMORANDUM TEXT:\\n\\n' + text });
}
content.push({ type: 'text', text: ask });

return [{ json: {
  model: 'claude-sonnet-5',
  max_tokens: 16000,
  // NOTE: no temperature. Extended thinking is enabled on the Claude extract node,
  // and the API rejects any temperature != 1 when thinking is on (400 Bad Request).
  system: ${JSON.stringify(SYSTEM_PROMPT)},
  messages: [ { role: 'user', content } ]
} }];`;
fs.writeFileSync(path.join(OUT, "codeNode.prep.js"), prepNode);
fs.writeFileSync(path.join(OUT, "extraction-prompt.md"),
  `# Claude extraction prompt (system)\n\nModel: \`claude-sonnet-5\`\n\n\`\`\`\n${SYSTEM_PROMPT}\n\`\`\`\n`);

// ---- assemble n8n workflow ----
const node = (name, type, tv, pos, params, extra={}) =>
  Object.assign({ parameters: params, id: name.replace(/\W/g,'_'), name, type, typeVersion: tv, position: pos }, extra);

const wf = {
  name: "PARITY — OM Deal Screener",
  nodes: [
    node("Webhook", "n8n-nodes-base.webhook", 2, [0,300], {
      httpMethod:"POST", path:"om-screen", responseMode:"responseNode", options:{ rawBody:false } },
      { webhookId: "parity-om-screen" }),
    // Upload the PDF to the Anthropic Files API so the extraction can reference it by
    // file_id. Inline base64 is capped at 32MB per request and a 25MB image-heavy PDF
    // inflates to ~33MB, which is exactly what blocked vision on picture-based OMs.
    // The Files API lifts that to 500MB. continueOnFail so a failed upload simply
    // falls back to inline base64 / text rather than killing the run.
    node("Upload PDF", "n8n-nodes-base.httpRequest", 4.2, [220,120], {
      method:"POST", url:"https://api.anthropic.com/v1/files",
      authentication:"predefinedCredentialType", nodeCredentialType:"anthropicApi",
      sendHeaders:true, headerParameters:{ parameters:[
        { name:"anthropic-version", value:"2023-06-01" },
        { name:"anthropic-beta", value:"files-api-2025-04-14" } ] },
      sendBody:true, contentType:"multipart-form-data",
      bodyParameters:{ parameters:[
        { parameterType:"formBinaryData", name:"file", inputDataFieldName:"om_file" } ] },
      options:{} }, { alwaysOutputData:true, onError:"continueRegularOutput" }),
    node("Extract OM text", "n8n-nodes-base.extractFromFile", 1, [220,300], {
      operation:"pdf", binaryPropertyName:"om_file", options:{} }),
    node("Prep extraction request", "n8n-nodes-base.code", 2, [440,300], {
      jsCode: prepNode }),
    node("Claude extract", "n8n-nodes-base.httpRequest", 4.2, [660,300], {
      method:"POST", url:"https://api.anthropic.com/v1/messages",
      authentication:"predefinedCredentialType", nodeCredentialType:"anthropicApi",
      // files-api beta is required for document.source.type = "file" (file_id references).
      sendHeaders:true, headerParameters:{ parameters:[
        { name:"anthropic-version", value:"2023-06-01" },
        { name:"anthropic-beta", value:"files-api-2025-04-14" } ] },
      sendBody:true, specifyBody:"json", jsonBody:"={{ JSON.stringify($json) }}", options:{} }),
    node("Screen (risk engine)", "n8n-nodes-base.code", 2, [880,300], {
      jsCode: codeNode }),
    node("Respond", "n8n-nodes-base.respondToWebhook", 1.1, [1100,300], {
      respondWith:"json", responseBody:"={{ JSON.stringify($('Screen (risk engine)').item.json) }}", options:{} }),
    node("Supabase: assessment", "n8n-nodes-base.httpRequest", 4.2, [1100,520], {
      method:"POST", url:"https://scrkenjdebyqqxxmozzz.supabase.co/rest/v1/risk_assessments",
      authentication:"genericCredentialType", genericAuthType:"httpHeaderAuth",
      sendHeaders:true, headerParameters:{ parameters:[{ name:"Prefer", value:"return=representation" }] },
      sendBody:true, specifyBody:"json",
      jsonBody:"={{ JSON.stringify({ property_name: $('Screen (risk engine)').item.json.property.name, source_om: $('Screen (risk engine)').item.json.generatedFrom, rule_set_version: $('Screen (risk engine)').item.json.ruleSetVersion, score: $('Screen (risk engine)').item.json.score, verdict: $('Screen (risk engine)').item.json.verdict, deal_risk_posture: $('Screen (risk engine)').item.json.dealRiskPosture, guardrail_capped: $('Screen (risk engine)').item.json.guardrailCapped, counts: $('Screen (risk engine)').item.json.counts }) }}",
      options:{} }, { disabled:true, continueOnFail:true }),
    node("Supabase: flags", "n8n-nodes-base.httpRequest", 4.2, [1320,520], {
      method:"POST", url:"https://scrkenjdebyqqxxmozzz.supabase.co/rest/v1/risk_flags",
      authentication:"genericCredentialType", genericAuthType:"httpHeaderAuth",
      sendBody:true, specifyBody:"json",
      jsonBody:"={{ JSON.stringify(($('Screen (risk engine)').item.json.flags || []).concat($('Screen (risk engine)').item.json.insufficientData||[], $('Screen (risk engine)').item.json.passes||[]).map(f => ({ assessment_id: $json[0] && $json[0].id, rule_id:f.ruleId, rule_name:f.rule, category:f.category, status:f.status, severity:f.severity, level:f.level, weight:f.weight, points_lost:f.pointsLost, evidence:f.evidence, om_page:f.omPage, why_it_matters:f.whyItMatters, financial_impact:f.financialImpact, recommended_next_action:f.recommendedNextAction, additional_dd_required:f.additionalDDRequired, guardrail:f.guardrail }))) }}",
      options:{} }, { disabled:true, continueOnFail:true }),
  ],
  connections: {
    // Upload PDF is listed first so n8n's v1 execution order completes that leaf branch
    // before the Extract -> Prep chain, guaranteeing $('Upload PDF') is available to Prep.
    "Webhook": { main:[[{ node:"Upload PDF", type:"main", index:0 }, { node:"Extract OM text", type:"main", index:0 }]] },
    "Extract OM text": { main:[[{ node:"Prep extraction request", type:"main", index:0 }]] },
    "Prep extraction request": { main:[[{ node:"Claude extract", type:"main", index:0 }]] },
    "Claude extract": { main:[[{ node:"Screen (risk engine)", type:"main", index:0 }]] },
    "Screen (risk engine)": { main:[[{ node:"Respond", type:"main", index:0 }, { node:"Supabase: assessment", type:"main", index:0 }]] },
    "Supabase: assessment": { main:[[{ node:"Supabase: flags", type:"main", index:0 }]] },
  },
  settings: { executionOrder: "v1" },
  active: false,
};
fs.writeFileSync(path.join(OUT, "PARITY-workflow.json"), JSON.stringify(wf, null, 2));
console.log("Wrote n8n/ : PARITY-workflow.json, codeNode.screen.js, codeNode.prep.js, extraction-prompt.md");
console.log("Screen code node length:", codeNode.length, "chars");

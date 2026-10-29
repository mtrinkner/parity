// Build the Anthropic request.
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
    } else if (typeof bin.data === 'string' && bin.data.length > 1000 && /^[A-Za-z0-9+/=\r\n]+$/.test(bin.data.slice(0, 200))) {
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
    content.push({ type: 'text', text: 'Text layer extracted from the same document (may be incomplete):\n\n' + text });
  }
} else if (pdfUsable) {
  content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
  if (text.trim().length >= 1000) {
    content.push({ type: 'text', text: 'Text layer extracted from the same document (may be incomplete):\n\n' + text });
  }
} else {
  content.push({ type: 'text', text: 'OFFERING MEMORANDUM TEXT:\n\n' + text });
}
content.push({ type: 'text', text: ask });

return [{ json: {
  model: 'claude-sonnet-5',
  max_tokens: 16000,
  // NOTE: no temperature. Extended thinking is enabled on the Claude extract node,
  // and the API rejects any temperature != 1 when thinking is on (400 Bad Request).
  system: "You are a senior multifamily acquisitions analyst extracting a deal from an Offering Memorandum.\nReturn ONLY a single JSON object matching this schema (no prose, no markdown fences):\n{\n  \"pages\": {\n    \"units\",\"occupancy\",\"rents\",\"noiT12\",\"noiSeller\",\"gsr\",\"expenses\",\"reserves\",\n    \"price\",\"tax\",\"rentRoll\",\"comps\",\"market\",\"retail\",\"buildingSystems\",\"valueAdd\"\n  },\n  \"meta\": { \"name\",\"address\",\"submarket\",\"broker\",\"omDate\",\"sourceOM\" },\n  \"property\": { \"units\",\"yearBuilt\",\"stories\",\"nrsf\",\"retailSf\",\"avgUnitSf\" },\n  \"occupancy\": { \"physical\"(0-1),\"leased\"(0-1) },\n  \"rents\": { \"avgEffRent\",\"avgEffPsf\",\"submarketAAPsf\" },\n  \"income\": {\n    \"gsr\":{\"t12\",\"t3ann\",\"current\",\"seller\"},\n    \"vacancy\":{\"t12\",\"current\",\"seller\"},\n    \"concessions\":{\"t12\",\"current\",\"seller\"},\n    \"badDebt\":{\"t12\",\"current\",\"seller\"},\n    \"egi\":{\"t12\",\"current\",\"seller\"} },\n  \"expenses\": {\n    \"controllable\":{\"t12\",\"current\",\"seller\"},\n    \"turnover\":{\"t12\",\"seller\"}, \"rm\":{\"t12\",\"seller\"},\n    \"mgmtFee\":{\"t12\",\"current\",\"seller\",\"pctOfEgi\"},\n    \"reTaxes\":{\"t12\",\"seller\"}, \"insurance\":{\"t12\",\"seller\"},\n    \"reserves\":{\"t12\",\"seller\",\"perUnit\"} },\n  \"noi\": { \"t12\",\"current\",\"seller\" },\n  \"tax\": { \"fmv\",\"assessedValue\",\"ratio\",\"mill\",\"amount\",\"parcel\" },\n  \"pricing\": { \"askingPrice\"(null if unpriced),\"statedCapRate\",\"assessorFmv\" },\n  \"debt\": { \"inPlace\",\"freeAndClear\" },\n  \"valueAdd\": { \"reservesPerUnit\",\"renovationCapexBudgeted\",\"interiorPremiumsClaimed\",\"roiSheetInOM\",\"fitnessModernizationClaimed\" },\n  \"buildingSystems\": { \"roofYear\",\"roofType\",\"boilerReplaced\",\"pcaProvided\" },\n  \"retail\": { \"sf\",\"anchorTenant\",\"anchorSf\",\"anchorPctSf\",\"anchorAbatement2026\",\"rollWithinHoldPctSf\" },\n  \"market\": { \"officeVacancy\",\"retailVacancy\",\"submarketMfVacancyEst\",\"pipelineUnitsCCR\",\"avgHhIncome1mi\",\"rentControl\" },\n  \"comps\": { \"providedCount\",\"internalInconsistency\" },\n  \"dataIntegrity\": { \"documentedInconsistencies\",\"notes\":[...] },\n  \"rentRoll\": { \"unitLevelProvided\",\"lossToLeaseDisclosed\",\"marketRentDisclosed\" },\n  \"regulatory\": { \"jurisdiction\",\"rentControl\",\"affordableUnitsDisclosed\" },\n  \"missingDD\": { \"criticalMissingCount\",\"items\":[...] }\n}\nRules:\n- pages: for each key, give the page number in THIS document where you found that figure,\n  as a string like \"p9\". Use the OM's own printed page numbering when it has one. Set a key\n  to null if you did not find it or are unsure — a wrong citation is far worse than none.\n  Never carry over a page number from any other document.\n- COLUMN MAPPING. OMs label their financial columns differently by deal size. Map them:\n  * \"T-12\", \"Trailing 12\", \"TTM\", \"Actual\", \"In-Place\", \"Current\", \"Historical\" -> the t12 field\n    (use \"current\" as well when the OM shows BOTH a trailing statement and a separate in-place column).\n  * \"Pro Forma\", \"Proforma\", \"Projected\", \"Year 1\", \"Stabilized\", \"Market\" -> the seller field.\n  A small OM often shows only \"In-Place\" and \"Pro Forma\" with no trailing statement at all — in that\n  case put the in-place figures in t12 and the pro forma figures in seller. Do not leave t12 null\n  merely because the document never uses the words \"T-12\".\n- Expenses are POSITIVE magnitudes. Occupancy as decimals (0.96), percentages as decimals (0.02).\n- Use null for any value not stated in the OM. NEVER invent a number. If the OM is unpriced, pricing.askingPrice=null.\n- Do NOT compute NOI or ratios; extract only what the OM states (line items and reported totals).\n- dataIntegrity.notes = short list of internal contradictions you observe, one clause each. Set documentedInconsistencies = notes.length.\n- missingDD.items = the core underwriting documents NOT provided in the OM. Choose ONLY from this exact\n  vocabulary, using these exact strings, and list them in this order. Do not invent other items:\n  [\"unit-level rent roll\",\"T-12 operating statement\",\"trailing bank statements\",\"executed leases\",\n   \"property condition assessment (PCA)\",\"environmental site assessment (Phase I)\",\"capital expenditure history\",\n   \"tax appeal history\",\"insurance loss runs\",\"service contracts\",\"title / survey\",\"utility billing detail\"]\n  Include an item only if the OM does not provide it. Set criticalMissingCount = items.length.",
  messages: [ { role: 'user', content } ]
} }];
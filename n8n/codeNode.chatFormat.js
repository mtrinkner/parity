// Normalise the Anthropic response into { answer } for the UI.
const MAC_ROMAN_HI = [196,197,199,201,209,214,220,225,224,226,228,227,229,231,233,232,
234,235,237,236,238,239,241,243,242,244,246,245,250,249,251,252,8224,176,162,163,167,
8226,182,223,174,169,8482,180,168,8800,198,216,8734,177,8804,8805,165,181,8706,8721,
8719,960,8747,170,186,937,230,248,191,161,172,8730,402,8776,8710,171,187,8230,160,192,
195,213,338,339,8211,8212,8220,8221,8216,8217,247,9674,255,376,8260,8364,8249,8250,
64257,64258,8225,183,8218,8222,8240,194,202,193,203,200,205,206,207,204,211,212,63743,
210,218,219,217,305,710,732,175,728,729,730,184,733,731,711];
const MAC_ROMAN_INV = {}; MAC_ROMAN_HI.forEach((cp,i)=>{ MAC_ROMAN_INV[cp] = 0x80+i; });
function repairMojibake(str){
  if (typeof str !== 'string' || str.indexOf('\u201A') === -1) return str;
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
  usage: r.usage ? { input: r.usage.input_tokens, output: r.usage.output_tokens } : null } }];
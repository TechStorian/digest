const USER_AGENT = 'news-dashboard/1.0 (+https://github.com/)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetch a URL as text, retrying rate limits, server errors and network failures. */
async function fetchText(url, { timeoutMs = 15000, retries = 2, retryStatuses = [] } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
      if (res.ok) return await res.text();
      const err = new Error(`${res.status} ${res.statusText} for ${url}`);
      err.retryable = res.status === 429 || res.status >= 500 || retryStatuses.includes(res.status);
      throw err;
    } catch (err) {
      const retryable = err.retryable ?? true; // network errors and timeouts
      if (!retryable || attempt >= retries) throw err;
      await sleep(600 * 2 ** attempt);
    }
  }
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', aring: 'å', Aring: 'Å',
  eacute: 'é', Eacute: 'É', uuml: 'ü', ouml: 'ö', auml: 'ä', copy: '©',
  reg: '®', trade: '™', euro: '€', shy: '',
};

function decodeEntities(str = '') {
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return code in NAMED_ENTITIES ? NAMED_ENTITIES[code] : match;
  });
}

function stripTags(html = '') {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '');
}

/** Turn an HTML fragment into clean, single-spaced plain text. */
function toText(html = '') {
  return decodeEntities(stripTags(html)).replace(/\s+/g, ' ').trim();
}

/** Return the inner content of the first <tag>…</tag>, unwrapping CDATA. */
function tagContent(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
}

function attr(tagHtml, name) {
  const m = tagHtml.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

/** Decode a URL taken from HTML, which may be entity-encoded more than once. */
function cleanUrl(raw = '') {
  let url = raw.trim();
  for (let i = 0; i < 3 && /&amp;/i.test(url); i++) url = decodeEntities(url);
  url = decodeEntities(url);
  return /^https?:\/\//i.test(url) ? url : '';
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** URL used to spot the same story appearing in several newsletters. */
function canonicalKey(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return url;
  }
}

module.exports = { fetchText, decodeEntities, toText, tagContent, attr, cleanUrl, hostname, canonicalKey };

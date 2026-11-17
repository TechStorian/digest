// A small, dependency-free RSS 2.0 / Atom parser that covers what news feeds use.
const { decodeEntities, toText, tagContent, attr, cleanUrl } = require('./util');

/** All inner contents of <tag>…</tag> (CDATA unwrapped). */
function tagContents(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  return [...xml.matchAll(re)].map((m) => m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim());
}

/** All opening tags named `tag` (self-closing or not), e.g. <link …/>. */
function openTags(xml, tag) {
  return xml.match(new RegExp(`<${tag}\\b[^>]*>`, 'gi')) || [];
}

const TRACKING_PIXEL = /(count|pixel|tracker|beacon|spacer)\.(gif|png)|[?&](w|width)=1(&|$)/i;

/** First usable image URL inside an HTML fragment that may itself be entity-escaped. */
function firstImage(html) {
  if (!html) return '';
  const unescaped = /&lt;img/i.test(html) ? decodeEntities(html) : html;
  for (const m of unescaped.matchAll(/<img\b[^>]*>/gi)) {
    const src = cleanUrl(attr(m[0], 'src'));
    if (!src || TRACKING_PIXEL.test(src)) continue;
    if (attr(m[0], 'width') === '1' || attr(m[0], 'height') === '1') continue;
    return src;
  }
  return '';
}

function mediaImage(itemXml) {
  for (const tag of openTags(itemXml, 'enclosure')) {
    const type = attr(tag, 'type');
    if (!type || type.startsWith('image/')) {
      const url = cleanUrl(attr(tag, 'url'));
      if (url) return url;
    }
  }
  for (const name of ['media:content', 'media:thumbnail']) {
    for (const tag of openTags(itemXml, name)) {
      const medium = attr(tag, 'medium');
      const type = attr(tag, 'type');
      if (medium && medium !== 'image') continue;
      if (type && !type.startsWith('image/')) continue;
      const url = cleanUrl(attr(tag, 'url'));
      if (url) return url;
    }
  }
  return '';
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseRssItem(item) {
  const description = tagContent(item, 'description');
  const content = tagContent(item, 'content:encoded');
  return {
    guid: toText(tagContent(item, 'guid')),
    title: toText(tagContent(item, 'title')),
    url: cleanUrl(toText(tagContent(item, 'link'))),
    summary: toText(description || content),
    date: toIso(tagContent(item, 'pubDate') || tagContent(item, 'dc:date')),
    image: mediaImage(item) || firstImage(description) || firstImage(content),
    categories: tagContents(item, 'category').map(toText).filter(Boolean),
    authors: [tagContent(item, 'dc:creator') || tagContent(item, 'author')].map(toText).filter(Boolean),
  };
}

function parseAtomEntry(entry) {
  const links = openTags(entry, 'link');
  const alternate = links.find((l) => !attr(l, 'rel') || attr(l, 'rel') === 'alternate') || links[0] || '';
  const content = tagContent(entry, 'content');
  const summary = tagContent(entry, 'summary');
  return {
    guid: toText(tagContent(entry, 'id')),
    title: toText(tagContent(entry, 'title')),
    url: cleanUrl(attr(alternate, 'href')),
    summary: toText(summary || content),
    date: toIso(tagContent(entry, 'published') || tagContent(entry, 'updated')),
    image: mediaImage(entry) || firstImage(content) || firstImage(summary),
    categories: openTags(entry, 'category')
      .map((c) => decodeEntities(attr(c, 'label') || attr(c, 'term')).trim())
      .filter(Boolean),
    authors: tagContents(entry, 'author').map((a) => toText(tagContent(a, 'name'))).filter(Boolean),
  };
}

/** Parse an RSS or Atom document into a flat list of items. */
function parseFeed(xml) {
  const isAtom = /<feed\b[^>]*xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/i.test(xml) || (!/<rss\b/i.test(xml) && /<entry\b/i.test(xml));
  const blocks = isAtom
    ? xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi) || []
    : xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];
  return blocks.map(isAtom ? parseAtomEntry : parseRssItem).filter((i) => i.title && i.url);
}

module.exports = { parseFeed, firstImage };

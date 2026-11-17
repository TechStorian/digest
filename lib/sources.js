// Every source the dashboard knows about. Enable them in config.js.
//
// Feed sources list one or more RSS/Atom feeds. A feed may pin a `category`;
// otherwise the source's `category(item)` decides, falling back to the
// feed's own first category.
const { fetchText, canonicalKey } = require('./util');
const { parseFeed } = require('./feed');
const { fetchNewsletter } = require('./tldr');

const VIDENSKAB_CATEGORIES = {
  'krop-sundhed': 'Krop & Sundhed',
  'kultur-samfund': 'Kultur & Samfund',
  naturvidenskab: 'Naturvidenskab',
  rummet: 'Rummet',
  teknologi: 'Teknologi',
  'teknologi-innovation': 'Teknologi',
  'miljo-naturvidenskab': 'Miljø & Natur',
  'om-videnskabdk': 'Om Videnskab.dk',
};

function firstPathSegment(url) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean)[0] || '';
  } catch {
    return '';
  }
}

const titleCase = (slug) => slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const SOURCES = {
  tldr: {
    name: 'TLDR',
    home: 'https://tldr.tech',
    lang: 'en',
    colors: { light: '#3b5bdb', dark: '#8ea2ff' },
    kind: 'tldr',
  },

  videnskab: {
    name: 'Videnskab.dk',
    home: 'https://videnskab.dk',
    lang: 'da',
    colors: { light: '#d4541c', dark: '#ff8a57' },
    feeds: [{ url: 'https://videnskab.dk/rss.xml' }],
    category: (item) => {
      const slug = firstPathSegment(item.url);
      return VIDENSKAB_CATEGORIES[slug] || (slug ? titleCase(slug) : '');
    },
  },

  version2: {
    name: 'Version2',
    home: 'https://www.version2.dk',
    lang: 'da',
    colors: { light: '#0b7a66', dark: '#4cd3b5' },
    feeds: [{ url: 'https://www.version2.dk/rss' }],
    category: (item) => item.categories[0] || (firstPathSegment(item.url) === 'holdning' ? 'Holdning' : ''),
  },

  conversation: {
    name: 'The Conversation',
    home: 'https://theconversation.com/global',
    lang: 'en',
    colors: { light: '#b8233f', dark: '#ff7d98' },
    // The global feed has no topics, so read the section feeds instead.
    // Order matters: a story in several sections keeps the first label.
    feeds: [
      { url: 'https://theconversation.com/global/technology/articles.atom', category: 'Science & Tech' },
      { url: 'https://theconversation.com/global/health/articles.atom', category: 'Health' },
      { url: 'https://theconversation.com/global/environment/articles.atom', category: 'Environment' },
      { url: 'https://theconversation.com/global/politics/articles.atom', category: 'Politics & Society' },
    ],
  },
};

/** "Jane Doe, Professor, Uni" → "Jane Doe"; several authors are shortened. */
function formatAuthors(authors) {
  const names = authors.map((a) => a.split(',')[0].trim()).filter(Boolean);
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]} et al.`;
}

async function fetchFeedSource(id, { maxAgeDays }) {
  const source = SOURCES[id];
  const cutoff = maxAgeDays > 0 ? Date.now() - maxAgeDays * 86_400_000 : 0;

  const results = await Promise.allSettled(
    source.feeds.map(async (feed) => ({ feed, items: parseFeed(await fetchText(feed.url)) })),
  );
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length === results.length) throw failed[0].reason;
  failed.forEach((r) => console.warn(`[${id}] feed skipped: ${r.reason?.message || r.reason}`));

  const seen = new Set();
  const articles = [];
  for (const { value } of results.filter((r) => r.status === 'fulfilled')) {
    for (const item of value.items) {
      if (cutoff && item.date && new Date(item.date).getTime() < cutoff) continue;
      const key = canonicalKey(item.url);
      if (seen.has(key)) continue;
      seen.add(key);
      articles.push({
        id: `${id}:${item.guid || item.url}`,
        source: id,
        sourceName: source.name,
        title: item.title,
        summary: item.summary,
        url: item.url,
        image: item.image,
        category: value.feed.category || source.category?.(item) || item.categories[0] || source.name,
        author: formatAuthors(item.authors),
        date: item.date,
        lang: source.lang,
      });
    }
  }
  return articles;
}

/** Turn the enabled source ids into named fetch jobs. */
function buildJobs(config) {
  const jobs = [];
  for (const id of config.sources) {
    const source = SOURCES[id];
    if (!source) {
      console.warn(`[sources] unknown source "${id}" ignored`);
      continue;
    }
    if (source.kind === 'tldr') {
      for (const n of config.tldr.newsletters) {
        jobs.push({ name: `TLDR ${n}`, run: () => fetchNewsletter(n, config.tldr) });
      }
    } else {
      jobs.push({ name: source.name, run: () => fetchFeedSource(id, config) });
    }
  }
  return jobs;
}

/** Public description of the enabled sources, for the frontend. */
function describeSources(config) {
  return config.sources
    .filter((id) => SOURCES[id])
        .map((id) => {
      const { name, home, lang, colors } = SOURCES[id];
      return { id, name, home, lang, colors };
    });
}

module.exports = { SOURCES, buildJobs, describeSources, fetchFeedSource, formatAuthors };

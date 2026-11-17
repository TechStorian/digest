const REFRESH_MS = 15 * 60 * 1000;
const READ_LIMIT = 3000;
const MAX_ALL_TOPICS = 12;

const $ = (sel) => document.querySelector(sel);
const els = {
  today: $('#today'),
  search: $('#search'),
  refresh: $('#refresh'),
  theme: $('#theme'),
  sources: $('#sources'),
  categories: $('#categories'),
  unread: $('#unread'),
  notice: $('#notice'),
  feed: $('#feed'),
  updated: $('#updated'),
  credits: $('#credits'),
};

/* ---------- Storage (fails quietly in private windows) ---------- */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

const saved = store.get('nd:filters', {});
const state = {
  data: null,
  loading: false,
  // Checked against the server's source list once data arrives.
  source: typeof saved.source === 'string' ? saved.source : 'all',
  category: typeof saved.category === 'string' ? saved.category : null,
  unreadOnly: saved.unreadOnly === true,
  query: '',
  read: new Set(store.get('nd:read', [])),
  lastFetch: 0,
};

function persistFilters() {
  store.set('nd:filters', { source: state.source, category: state.category, unreadOnly: state.unreadOnly });
}

/* ---------- Helpers ---------- */

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function svg(markup, cls) {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${markup}</svg>`;
  return wrap.firstChild;
}

const pad = (n) => String(n).padStart(2, '0');
const localDayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function dayKey(article) {
  if (article.day) return article.day;
  if (article.date) return localDayKey(new Date(article.date));
  return 'unknown';
}

function dayLabel(key) {
  if (key === 'unknown') return { title: 'Earlier', meta: '' };
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const full = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  if (key === localDayKey(today)) return { title: 'Today', meta: full };
  if (key === localDayKey(yesterday)) return { title: 'Yesterday', meta: full };
  return {
    title: date.toLocaleDateString('en-GB', { weekday: 'long' }),
    meta: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
  };
}

function timeLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 12 * 60) return `${Math.round(mins / 60)} h ago`;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function hue(str) {
  let n = 0;
  for (const ch of str) n = (n * 31 + ch.codePointAt(0)) >>> 0;
  return n % 360;
}

/**
 * Merge several ordered lists so each one is spread evenly through the
 * result, keeping every list's own order.
 */
function blend(lists) {
  return lists
    .filter((l) => l.length)
    .flatMap((list) => list.map((item, i) => ({ item, key: (i + 0.5) / list.length })))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}

/** Split text into plain strings and <mark> elements for search matches. */
function highlight(text, terms) {
  if (!terms.length) return [text];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? h('mark', {}, part) : part));
}

/* ---------- Filtering ---------- */

function searchTerms() {
  return state.query.toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesQuery(article, terms) {
  if (!terms.length) return true;
  const hay = [article.title, article.summary, article.category, article.domain, article.author, article.sourceName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return terms.every((t) => hay.includes(t));
}

function bySource(articles) {
  return state.source === 'all' ? articles : articles.filter((a) => a.source === state.source);
}

function visibleArticles() {
  const terms = searchTerms();
  return bySource(state.data?.articles || []).filter(
    (a) =>
      (!state.category || a.category === state.category) &&
      (!state.unreadOnly || !state.read.has(a.id)) &&
      matchesQuery(a, terms),
  );
}

/* ---------- Rendering: filters ---------- */

const HEX = /^#[0-9a-f]{3,8}$/i;
const SAFE_ID = /^[a-z0-9-]+$/;

/** Give each source its accent colour, for both themes, as `.src-<id>` rules. */
function applySourceColors(sources) {
  const rules = (theme, scope = '') =>
    sources
      .filter((s) => SAFE_ID.test(s.id) && HEX.test(s.colors?.[theme] || ''))
      .map((s) => `${scope}.src-${s.id}{--accent:${s.colors[theme]}}`)
      .join('');
  let style = document.getElementById('source-colors');
  if (!style) {
    style = h('style', { id: 'source-colors' });
    document.head.append(style);
  }
  style.textContent =
    rules('light') +
    `@media (prefers-color-scheme: dark){${rules('dark', ":root:not([data-theme='light']) ")}}` +
    rules('dark', ":root[data-theme='dark'] ");
}

function renderSources() {
  const articles = state.data?.articles || [];
  const count = (s) => (s === 'all' ? articles.length : articles.filter((a) => a.source === s).length);
  const options = [
    { id: 'all', label: 'All' },
    ...(state.data?.sources || []).map((s) => ({ id: s.id, label: s.name, dot: true })),
  ];

  els.sources.replaceChildren(
    ...options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': String(state.source === o.id),
          onclick: () => {
            if (state.source === o.id) return;
            state.source = o.id;
            state.category = null;
            persistFilters();
            render();
          },
        },
        o.dot && h('span', { class: `dot src-${o.id}` }),
        o.label,
        state.data && h('span', { class: 'count' }, count(o.id)),
      ),
    ),
  );
}

function renderCategories() {
  const counts = new Map();
  for (const a of bySource(state.data?.articles || [])) {
    counts.set(a.category, (counts.get(a.category) || 0) + 1);
  }
  if (state.category && !counts.has(state.category)) state.category = null;

  let sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // Across all sources, show only the busiest topics (plus the selected one).
  if (state.source === 'all' && sorted.length > MAX_ALL_TOPICS) {
    sorted = sorted.filter(([name], i) => i < MAX_ALL_TOPICS || name === state.category);
  }
  const chip = (label, value) =>
    h(
      'button',
      {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(state.category === value),
        onclick: () => {
          state.category = state.category === value || value == null ? null : value;
          persistFilters();
          render();
        },
      },
      label,
    );

  els.categories.replaceChildren(
    chip('All topics', null),
    ...sorted.map(([name]) => chip(name, name)),
  );
}

/* ---------- Rendering: cards ---------- */

function cardFooter(article) {
  const parts = [];
  if (article.source === 'tldr') {
    const domain = article.domain || 'link';
    parts.push(
      h(
        'span',
        { class: 'card__domain' },
        h('span', { class: 'monogram', style: `background:hsl(${hue(domain)} 45% 45%)` }, domain[0]),
        h('span', { class: 'card__domain-text' }, domain),
      ),
    );
    if (article.readTime) parts.push(h('span', { class: 'sep' }, '·'), h('span', {}, article.readTime));
  } else {
    parts.push(h('span', { class: 'card__domain' }, h('span', { class: 'card__domain-text' }, article.author || article.sourceName)));
    const t = timeLabel(article.date);
    if (t) parts.push(h('span', { class: 'sep' }, '·'), h('time', { datetime: article.date }, t));
  }
  parts.push(svg('<path d="M7 17 17 7M8 7h9v9"/>', 'card__arrow'));
  return h('div', { class: 'card__footer' }, parts);
}

function card(article, { feature = false, terms = [] } = {}) {
  const isTldr = article.source === 'tldr';
  const classes = ['card', `src-${article.source}`, article.image ? 'card--media' : 'card--text'];
  if (feature) classes.push('card--feature');
  if (state.read.has(article.id)) classes.push('is-read');

  const markRead = () => {
    if (state.read.has(article.id)) return;
    state.read.add(article.id);
    const ids = [...state.read];
    store.set('nd:read', ids.slice(-READ_LIMIT));
    el.classList.add('is-read');
  };

  const el = h(
    'a',
    {
      class: classes.join(' '),
      href: article.url,
      target: '_blank',
      rel: 'noopener noreferrer',
      lang: article.lang,
      onclick: markRead,
      onauxclick: (e) => e.button === 1 && markRead(),
    },
    article.image &&
      h(
        'div',
        { class: 'card__media' },
        h('img', {
          src: article.image,
          alt: '',
          loading: feature ? 'eager' : 'lazy',
          decoding: 'async',
          referrerpolicy: 'no-referrer',
          onerror: (e) => {
            // Fall back to the text-card style if the image can't load.
            e.currentTarget.parentElement.remove();
            el.classList.remove('card--media', 'card--feature');
            el.classList.add('card--text');
          },
        }),
      ),
    h(
      'div',
      { class: 'card__body' },
      h(
        'div',
        { class: 'card__top' },
        h('span', { class: 'badge badge--source' }, article.sourceName),
        h(
          'span',
          { class: 'card__category' },
          isTldr && article.emoji ? h('span', { class: 'card__emoji', 'aria-hidden': 'true' }, `${article.emoji} `) : null,
          article.category,
        ),
      ),
      h('h3', { class: 'card__title' }, highlight(article.title, terms)),
      article.summary && h('p', { class: 'card__summary' }, highlight(article.summary, terms)),
      cardFooter(article),
    ),
  );
  return el;
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function orderDay(articles) {
  const byTime = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);

  // Lead with the newest illustrated story from a timestamped source.
  const lead = articles.filter((a) => a.image && a.source !== 'tldr').sort(byTime)[0] || null;

  // One ordered list per source: TLDR keeps issue order (newsletters
  // interleaved); feed sources are newest first. Then spread them evenly.
  const lists = [...groupBy(articles.filter((a) => a !== lead), (a) => a.source).entries()].map(([source, items]) =>
    source === 'tldr' ? blend([...groupBy(items, (a) => a.newsletter).values()]) : items.sort(byTime),
  );
  const rest = blend(lists);
  return lead ? [lead, ...rest] : rest;
}

function renderFeed() {
  if (!state.data) {
    els.feed.replaceChildren(skeleton());
    return;
  }

  const articles = visibleArticles();
  if (!articles.length) {
    const filtered = state.query || state.category || state.unreadOnly || state.source !== 'all';
    els.feed.replaceChildren(
      h(
        'div',
        { class: 'empty' },
        h('h2', {}, filtered ? 'Nothing matches' : 'No stories yet'),
        h('p', {}, filtered ? 'Try another search or clear the filters.' : 'The sources returned no stories. Try refreshing in a moment.'),
        filtered
          ? h('button', { type: 'button', onclick: clearFilters }, 'Clear filters')
          : h('button', { type: 'button', onclick: () => load({ force: true }) }, 'Refresh'),
      ),
    );
    return;
  }

  const days = new Map();
  for (const a of articles) {
    const key = dayKey(a);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(a);
  }

  const terms = searchTerms();
  const sections = [...days.entries()]
    .sort((a, b) => (a[0] === 'unknown' ? 1 : b[0] === 'unknown' ? -1 : b[0].localeCompare(a[0])))
    .map(([key, items]) => {
      const label = dayLabel(key);
      const ordered = orderDay(items);
      return h(
        'section',
        { class: 'day', 'aria-label': `${label.title} ${label.meta}` },
        h(
          'header',
          { class: 'day__header' },
          h('h2', { class: 'day__title' }, label.title),
          h('span', { class: 'day__meta' }, [label.meta, `${items.length} ${items.length === 1 ? 'story' : 'stories'}`].filter(Boolean).join(' · ')),
          h('span', { class: 'day__rule', 'aria-hidden': 'true' }),
        ),
        h(
          'div',
          { class: 'grid' },
          ordered.map((a, i) => card(a, { feature: i === 0 && !!a.image && !terms.length, terms })),
        ),
      );
    });

  els.feed.replaceChildren(...sections);
}

function skeleton() {
  const ph = (w, hgt) => h('span', { style: `width:${w};height:${hgt}px` });
  const cards = Array.from({ length: 9 }, (_, i) =>
    h(
      'div',
      { class: 'card skeleton', 'aria-hidden': 'true' },
      i % 3 === 0 && h('div', { class: 'card__media' }),
      h('div', { class: 'card__body' }, ph('35%', 20), ph('92%', 22), ph('70%', 22), ph('100%', 12), ph('85%', 12), ph('40%', 12)),
    ),
  );
  return h(
    'section',
    { class: 'day' },
    h('header', { class: 'day__header' }, h('h2', { class: 'day__title' }, 'Loading stories…')),
    h('div', { class: 'grid' }, cards),
  );
}

function renderMeta() {
  const errors = state.data?.errors || [];
  if (errors.length) {
    els.notice.hidden = false;
    els.notice.textContent = `Couldn't reach ${errors.map((e) => e.source).join(', ')} right now. Showing everything else.`;
  } else {
    els.notice.hidden = true;
  }
  const sources = state.data?.sources || [];
  if (sources.length) {
    const links = sources.map((s) =>
      /^https:\/\//.test(s.home || '') ? h('a', { href: s.home, target: '_blank', rel: 'noopener' }, s.name) : s.name,
    );
    const parts = ['Stories from '];
    links.forEach((link, i) => {
      if (i > 0) parts.push(i === links.length - 1 ? ' and ' : ', ');
      parts.push(link);
    });
    parts.push('.');
    els.credits.replaceChildren(...parts);
  }
  if (state.data?.updatedAt) {
    const t = new Date(state.data.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    els.updated.textContent = `Last updated ${t}.`;
  }
}

function render() {
  renderSources();
  renderCategories();
  renderFeed();
  renderMeta();
  els.unread.checked = state.unreadOnly;
}

function clearFilters() {
  state.query = '';
  els.search.value = '';
  state.category = null;
  state.unreadOnly = false;
  state.source = 'all';
  persistFilters();
  render();
}

/* ---------- Data ---------- */

async function load({ force = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  els.refresh.classList.add('is-spinning');
  els.refresh.disabled = true;
  try {
    const res = await fetch(`/api/news${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    state.data = await res.json();
    state.lastFetch = Date.now();
    const sources = state.data.sources || [];
    applySourceColors(sources);
    if (state.source !== 'all' && !sources.some((s) => s.id === state.source)) state.source = 'all';
    render();
  } catch (err) {
    console.error(err);
    if (!state.data) {
      els.feed.replaceChildren(
        h(
          'div',
          { class: 'empty' },
          h('h2', {}, 'Could not load the news'),
          h('p', {}, 'Check that the server is running and you are online.'),
          h('button', { type: 'button', onclick: () => load({ force: true }) }, 'Try again'),
        ),
      );
    } else {
      els.notice.hidden = false;
      els.notice.textContent = 'Refreshing failed. Showing the stories loaded earlier.';
    }
  } finally {
    state.loading = false;
    els.refresh.classList.remove('is-spinning');
    els.refresh.disabled = false;
  }
}

/* ---------- Events ---------- */

let searchTimer;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = els.search.value.trim();
    renderFeed();
  }, 120);
});

els.unread.addEventListener('change', () => {
  state.unreadOnly = els.unread.checked;
  persistFilters();
  renderFeed();
});

els.refresh.addEventListener('click', () => load({ force: true }));

els.theme.addEventListener('click', () => {
  const root = document.documentElement;
  const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try {
    localStorage.setItem('nd:theme', next);
  } catch {}
});

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    els.search.focus();
  } else if (e.key === 'Escape' && document.activeElement === els.search) {
    els.search.value = '';
    state.query = '';
    renderFeed();
    els.search.blur();
  }
});

// Keep the page fresh without hammering the sources.
setInterval(() => {
  if (document.visibilityState === 'visible') load();
}, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - state.lastFetch > REFRESH_MS) load();
});

els.today.textContent = new Date().toLocaleDateString('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

render();
load();

const { fetchText, toText, tagContent, cleanUrl, hostname } = require('./util');

const NEWSLETTER_NAMES = {
  tech: 'TLDR', ai: 'TLDR AI', webdev: 'TLDR Dev', dev: 'TLDR Dev', infosec: 'TLDR InfoSec',
  devops: 'TLDR DevOps', founders: 'TLDR Founders', design: 'TLDR Design',
  marketing: 'TLDR Marketing', crypto: 'TLDR Crypto', product: 'TLDR Product',
  data: 'TLDR Data', fintech: 'TLDR Fintech', it: 'TLDR IT',
};

// Issue pages never change once published, so keep parsed issues around.
const issueCache = new Map();

/** Split "Title (5 minute read)" into the title and its trailing tag. */
function splitTitle(raw) {
  const m = raw.match(/^(.*\S)\s*\(([^()]*)\)\s*$/);
  if (!m) return { title: raw, tag: '' };
  return { title: m[1], tag: m[2] };
}

function parseIssue(html, { newsletter, issueUrl, issueDate, includeQuickLinks }) {
  const articles = [];
  const sections = html.split(/<section\b[^>]*>/i).slice(1);

  for (const section of sections) {
    const header = section.match(/<header>([\s\S]*?)<\/header>/i);
    let sectionName = '';
    let emoji = '';
    if (header) {
      sectionName = toText(tagContent(header[1], 'h3'));
      emoji = toText(tagContent(header[1], 'div'));
    }
    if (!includeQuickLinks && /quick links/i.test(sectionName)) continue;

    const blocks = section.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi) || [];
    for (const block of blocks) {
      const link = block.match(/<a\b[^>]*href="([^"]+)"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/i);
      if (!link) continue;
      const { title, tag } = splitTitle(toText(link[2]));
      if (/sponsor/i.test(tag) || /sponsor/i.test(sectionName)) continue;

      const url = cleanUrl(link[1]);
      if (!url || !title) continue;

      const summaryMatch = block.match(/<div class="newsletter-html"[^>]*>([\s\S]*?)<\/div>\s*<\/article>/i);
      articles.push({
        id: `tldr:${newsletter}:${url}`,
        source: 'tldr',
        sourceName: NEWSLETTER_NAMES[newsletter] || `TLDR ${newsletter}`,
        newsletter,
        title,
        summary: summaryMatch ? toText(summaryMatch[1]) : '',
        url,
        domain: hostname(url),
        readTime: tag,
        category: sectionName || 'Top stories',
        emoji,
        issueUrl,
        date: issueDate,
        // Issues are dated by calendar day, not by a moment in time.
        day: (issueUrl.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || null,
        lang: 'en',
      });
    }
  }
  return articles;
}

async function fetchIssue(newsletter, issue, includeQuickLinks) {
  const key = `${issue.url}|${includeQuickLinks}`;
  if (issueCache.has(key)) return issueCache.get(key);

  // Issue URLs come from TLDR's own feed, so a 404 is usually a brief glitch.
  const html = await fetchText(issue.url, { retryStatuses: [404] });
  const articles = parseIssue(html, {
    newsletter,
    issueUrl: issue.url,
    issueDate: issue.date,
    includeQuickLinks,
  });
  // Only cache issues that parsed into something, so layout changes recover.
  if (articles.length) issueCache.set(key, articles);
  if (issueCache.size > 200) issueCache.delete(issueCache.keys().next().value);
  return articles;
}

async function fetchNewsletter(newsletter, { issuesPerNewsletter, includeQuickLinks }) {
  const xml = await fetchText(`https://tldr.tech/api/rss/${encodeURIComponent(newsletter)}`);
  const issues = (xml.match(/<item>[\s\S]*?<\/item>/gi) || [])
    .map((item) => {
      const date = new Date(tagContent(item, 'pubDate'));
      return {
        url: cleanUrl(tagContent(item, 'link')),
        date: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      };
    })
    .filter((i) => i.url)
    .slice(0, issuesPerNewsletter);

  // Fetch issues one after another to stay polite to tldr.tech.
  const articles = [];
  let lastError = null;
  for (const issue of issues) {
    try {
      articles.push(...(await fetchIssue(newsletter, issue, includeQuickLinks)));
    } catch (err) {
      lastError = err;
      console.warn(`[tldr] skipped ${issue.url}: ${err.message}`);
    }
  }
  if (!articles.length && lastError) throw lastError;
  return articles;
}

module.exports = { fetchNewsletter, parseIssue };

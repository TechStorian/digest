// Dashboard configuration. Environment variables override the defaults.
const list = (value, fallback) =>
  value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback;

module.exports = {
  port: Number(process.env.PORT) || 3000,

  // How long aggregated news is cached before sources are fetched again.
  cacheMinutes: Number(process.env.CACHE_MINUTES) || 15,

  // Which sources to show, in display order. See lib/sources.js.
  sources: list(process.env.SOURCES, ['tldr', 'videnskab', 'version2', 'conversation']),

  // Feed stories older than this are hidden. Use 0 to keep everything.
  maxAgeDays: process.env.MAX_AGE_DAYS != null ? Number(process.env.MAX_AGE_DAYS) : 7,

  tldr: {
    // Any of: tech, ai, webdev, infosec, devops, founders, design, marketing,
    // crypto, product, data, fintech, it
    newsletters: list(process.env.TLDR_NEWSLETTERS, ['tech', 'ai']),
    // Number of recent daily issues to expand into individual stories.
    issuesPerNewsletter: Number(process.env.TLDR_ISSUES) || 3,
    includeQuickLinks: process.env.TLDR_QUICK_LINKS !== 'false',
  },
};

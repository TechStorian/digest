// Gathers news from every enabled source. Shared by the Node server
// (server.js) and the Netlify Function (netlify/functions/news.mjs).
const defaultConfig = require('../config');
const { buildJobs, describeSources } = require('./sources');
const { canonicalKey } = require('./util');

function withDeadline(promise, ms, name) {
  if (!ms) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} took longer than ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Fetch all sources in parallel and merge them, dropping duplicate stories.
 * A source that fails or misses `deadlineMs` is reported in `errors`
 * instead of failing the whole response.
 */
async function collectNews({ config = defaultConfig, deadlineMs = 0 } = {}) {
  const jobs = buildJobs(config);
  const results = await Promise.allSettled(jobs.map((j) => withDeadline(j.run(), deadlineMs, j.name)));
  const errors = [];
  const seen = new Set();
  const articles = [];

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const message = String(result.reason?.message || result.reason);
      errors.push({ source: jobs[i].name, message });
      console.warn(`[news] ${jobs[i].name} failed:`, message);
      return;
    }
    for (const article of result.value) {
      const key = canonicalKey(article.url);
      if (seen.has(key)) continue;
      seen.add(key);
      articles.push(article);
    }
  });

  return {
    updatedAt: new Date().toISOString(),
    sources: describeSources(config),
    errors,
    articles,
  };
}

let cache = null; // { payload, expires }
let inflight = null;

/**
 * Cached news. The cache lives in memory, so on Netlify it only survives
 * while a function instance stays warm; the CDN cache does the heavy lifting.
 */
async function getNews({ force = false, config = defaultConfig, deadlineMs = 0 } = {}) {
  if (!force && cache && cache.expires > Date.now()) return cache.payload;
  if (!inflight) {
    inflight = collectNews({ config, deadlineMs })
      .then((payload) => {
        // Don't keep a fully failed fetch for the whole cache period.
        const ttl = payload.articles.length ? config.cacheMinutes * 60_000 : 60_000;
        cache = { payload, expires: Date.now() + ttl };
        return payload;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

module.exports = { collectNews, getNews };

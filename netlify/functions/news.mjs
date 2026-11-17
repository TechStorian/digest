// Netlify Function serving /api/news. It runs the same code as the Node
// server (lib/news.js); only the HTTP and caching glue differs.
import news from '../../lib/news.js';
import appConfig from '../../config.js';

const { getNews } = news;

// Stay well inside the function time limit: a source that is slower than
// this is reported as failed and the rest of the news is still returned.
const DEADLINE_MS = 8000;

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers },
  });

export default async (req) => {
  const force = new URL(req.url).searchParams.get('refresh') === '1';

  try {
    const payload = await getNews({ force, deadlineMs: DEADLINE_MS });

    // Browsers always revalidate; Netlify's CDN keeps one shared copy and
    // serves it while refreshing in the background after it goes stale.
    const seconds = payload.articles.length ? appConfig.cacheMinutes * 60 : 60;
    const headers = force
      ? { 'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store' }
      : {
          'Cache-Control': 'public, max-age=0, must-revalidate',
          'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${seconds}, stale-while-revalidate=3600`,
        };
    // Keep "?refresh=1" requests out of the shared cache entry.
    headers['Netlify-Vary'] = 'query=refresh';

    return json(payload, 200, headers);
  } catch (err) {
    console.error('[news] unexpected error', err);
    return json({ error: 'Failed to load news' }, 500, { 'Cache-Control': 'no-store' });
  }
};

// Serve this function at the same URL the Node server uses.
export const config = { path: '/api/news' };

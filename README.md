# Daily Digest

A calm, modern news dashboard that brings tech and science news together in one responsive grid:

- [TLDR](https://tldr.tech) newsletters, in English. Each daily issue is split into its individual stories, with summaries, read times and sections. Sponsored blocks are skipped.
- [Videnskab.dk](https://videnskab.dk), Danish popular science, with images and categories.
- [Version2](https://www.version2.dk), Danish IT news, with topics and authors.
- [The Conversation](https://theconversation.com/global), research-based analysis written by academics. It is read from its Science & Tech, Health, Environment and Politics sections.

Features:

- Stories are grouped by day, with the newest illustrated article as a hero card.
- Filter by source or topic, search titles, summaries and authors with highlighted matches (press `/`), and hide stories you've already opened.
- Each source has its own colour, in both light and dark themes.
- No dependencies: just Node.js 20 or newer.

## Run it

```sh
npm start
# open http://localhost:3000
```

Use `npm run dev` to restart automatically on file changes, and `npm test` to run the parser tests.

## Deploy to Netlify

The same code also runs on Netlify, with no server to manage. Netlify serves `public/` as a static site, and `netlify/functions/news.mjs` answers `/api/news`, the same URL the Node server uses. Both call the shared `lib/news.js`, so a change to sources or parsing applies to both. `netlify.toml` holds the settings, and no build step is needed.

Deploy in one of two ways:

- **From Git:** push the project to GitHub, GitLab or Bitbucket, then choose "Add new site" and "Import an existing project" in Netlify. Netlify reads `netlify.toml` and redeploys on every push.
- **From your machine:** use the Netlify CLI.

  ```sh
  npx netlify-cli login
  npx netlify-cli deploy --prod
  ```

Netlify Drop, the drag-and-drop upload, does not deploy functions, so it won't work for this site.

To try the Netlify version locally, run `npx netlify-cli dev`. The settings below work on Netlify too: add them under Site configuration, then Environment variables. `PORT` is ignored there.

On Netlify, responses are cached on Netlify's CDN for `CACHE_MINUTES`, and a stale copy is served while a fresh one loads in the background. Sources are therefore fetched about every 15 minutes, however many people visit. The refresh button bypasses the cache for that visitor only. Any source that takes longer than 8 seconds is reported as unavailable, so the function stays inside Netlify's time limit.

## Configuration

Set these environment variables, or edit `config.js`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Port for the web server |
| `SOURCES` | `tldr,videnskab,version2,conversation` | Sources to show, in display order |
| `MAX_AGE_DAYS` | `7` | Hide feed stories older than this. `0` keeps everything |
| `TLDR_NEWSLETTERS` | `tech,ai` | Comma-separated TLDR newsletters: `tech`, `ai`, `webdev`, `infosec`, `devops`, `founders`, `design`, `marketing`, `crypto`, `product`, `data`, `fintech`, `it` |
| `TLDR_ISSUES` | `3` | Recent issues to expand per newsletter |
| `TLDR_QUICK_LINKS` | `true` | Set to `false` to drop TLDR's "Quick Links" section |
| `CACHE_MINUTES` | `15` | How long fetched news is cached on the server |

Example:

```sh
SOURCES=tldr,version2 TLDR_NEWSLETTERS=tech,ai,webdev npm start
```

## Adding a source

Most sites with an RSS or Atom feed need only an entry in `lib/sources.js`:

```js
quanta: {
  name: 'Quanta Magazine',
  home: 'https://www.quantamagazine.org',
  lang: 'en',
  colors: { light: '#6b4bd8', dark: '#b3a1ff' },
  feeds: [{ url: 'https://www.quantamagazine.org/feed/' }],
},
```

Then add its id to `sources` in `config.js`. The frontend picks up the new tab, colour and credit line automatically. A feed may set a fixed `category`, or the source may define `category(item)`. Otherwise the feed's own first category is used.

## How it works

`lib/news.js` fetches all sources in parallel, removes duplicate stories and caches the result. Locally, `server.js` serves it at `/api/news` alongside the static frontend in `public/`. On Netlify, the function does the same.

- `lib/feed.js` is a small RSS and Atom parser. It reads titles, links, summaries, dates, authors, categories and images from enclosures, media tags or the first image in the article HTML.
- `lib/sources.js` defines the sources and turns feed items into stories.
- `lib/tldr.js` reads each newsletter's RSS feed to find recent issues, then parses each issue page into stories. Parsed issues are cached in memory because they never change.
- If a source fails, the rest still load and the page shows a notice.

TLDR has no per-story feed, so its issue pages are scraped. If TLDR changes its page layout, `parseIssue` in `lib/tldr.js` is the place to adjust.

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseIssue } = require('../lib/tldr');
const { toText, cleanUrl, canonicalKey, tagContent } = require('../lib/util');

const ISSUE_HTML = `
<section><header><div class="flex"><strong>Together With</strong></div><h3 class="text-center font-bold"></h3></header>
  <article class="mt-3"><a class="font-bold" href="https://sponsor.example/?a=1&amp;amp;b=2"><h3>Buy our thing (Sponsor)</h3></a>
  <div class="newsletter-html">Ad copy.</div></article></section>
<section><header><div class="text-center text-3xl mt-3">📱</div><h3 class="text-center font-bold">Big Tech &amp; Startups</h3></header>
  <article class="mt-3"><a class="font-bold" href="https://www.example.com/story?x=1&amp;amp;utm_source=tldrnewsletter" target="_blank"><h3>Big News Happens (5 minute read)</h3></a>
  <div class="newsletter-html">Something <b>important</b> happened&nbsp;today. It&#x27;s big.</div></article>
  <article class="mt-3"><a class="font-bold" href="https://github.com/acme/tool"><h3>acme/tool (GitHub Repo)</h3></a>
  <div class="newsletter-html"><p>A tool.</p></div></article>
</section>`;

test('parseIssue extracts stories, skips sponsors and splits read time', () => {
  const articles = parseIssue(ISSUE_HTML, {
    newsletter: 'tech',
    issueUrl: 'https://tldr.tech/tech/2026-11-17',
    issueDate: '2026-11-17T00:00:00.000Z',
    includeQuickLinks: true,
  });

  assert.equal(articles.length, 2);
  const [first, second] = articles;
  assert.equal(first.title, 'Big News Happens');
  assert.equal(first.readTime, '5 minute read');
  assert.equal(first.url, 'https://www.example.com/story?x=1&utm_source=tldrnewsletter');
  assert.equal(first.summary, "Something important happened today. It's big.");
  assert.equal(first.category, 'Big Tech & Startups');
  assert.equal(first.emoji, '📱');
  assert.equal(first.domain, 'example.com');
  assert.equal(first.day, '2026-11-17');
  assert.equal(first.sourceName, 'TLDR');
  assert.equal(second.readTime, 'GitHub Repo');
});

test('util helpers decode entities, CDATA and URLs', () => {
  assert.equal(toText('<![CDATA[Hej &amp; farvel&nbsp;&#8211; <i>æøå</i>]]>'), 'Hej & farvel – æøå');
  assert.equal(tagContent('<item><title><![CDATA[ A title ]]></title></item>', 'title'), 'A title');
  assert.equal(cleanUrl('https://a.dk/?x=1&amp;amp;y=2'), 'https://a.dk/?x=1&y=2');
  assert.equal(cleanUrl('javascript:alert(1)'), '');
  assert.equal(canonicalKey('https://www.Example.com/a/?utm=1'), canonicalKey('https://example.com/a'));
});

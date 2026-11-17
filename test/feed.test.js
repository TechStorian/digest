const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFeed } = require('../lib/feed');
const { formatAuthors } = require('../lib/sources');

const RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0"><channel>
  <title>Version2 articles</title>
  <atom:link href="https://www.version2.dk/rss" rel="self"/>
  <item>
    <title>En kaskadefejl lukkede Outlook ned: »Skræmmende«</title>
    <link>https://www.version2.dk/artikel/en-kaskadefejl</link>
    <description>Microsoft&amp;#8217;s tjeneste var nede.</description>
    <pubDate>Tue, 17 Nov 2026 12:15:00 +0100</pubDate>
    <dc:creator>Jonas Kuld Rathje</dc:creator>
    <guid isPermaLink="true">https://www.version2.dk/artikel/en-kaskadefejl</guid>
    <category>Nedbrud</category>
    <category>Big Tech</category>
  </item>
  <item>
    <title><![CDATA[Med billede]]></title>
    <link>https://videnskab.dk/rummet/med-billede/</link>
    <description><![CDATA[Kort tekst.]]></description>
    <enclosure url="https://videnskab.dk/img.jpg" length="1" type="image/jpeg"></enclosure>
    <pubDate>Mon, 16 Nov 2026 08:00:00 +0100</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xml:lang="en-US" xmlns="http://www.w3.org/2005/Atom">
  <title>The Conversation</title>
  <link rel="self" href="https://theconversation.com/global/technology/articles.atom"/>
  <entry>
    <id>tag:theconversation.com,2011:article/289238</id>
    <published>2026-11-16T23:55:20Z</published>
    <link rel="alternate" type="text/html" href="https://theconversation.com/how-does-a-compass-work-289238"/>
    <title>How does a compass work?</title>
    <content type="html">&lt;img src="https://counter.theconversation.com/content/1/count.gif" width="1" height="1"&gt;&lt;figure&gt;&lt;img src="https://images.theconversation.com/files/1/original/a.jpg?ixlib=rb&amp;amp;w=754&amp;amp;fit=clip"&gt;&lt;/figure&gt;&lt;p&gt;Body&lt;/p&gt;</content>
    <summary>Like all cool phenomena, the explanation is not magic – it’s physics.</summary>
    <author><name>Emma Brown, Lecturer, University of Somewhere</name></author>
    <author><name>Sam Lee, Professor, Elsewhere</name></author>
  </entry>
</feed>`;

test('parseFeed reads RSS items with categories, authors and enclosures', () => {
  const [first, second] = parseFeed(RSS);
  assert.equal(first.title, 'En kaskadefejl lukkede Outlook ned: »Skræmmende«');
  assert.equal(first.url, 'https://www.version2.dk/artikel/en-kaskadefejl');
  assert.equal(first.date, '2026-11-17T11:15:00.000Z');
  assert.deepEqual(first.categories, ['Nedbrud', 'Big Tech']);
  assert.deepEqual(first.authors, ['Jonas Kuld Rathje']);
  assert.equal(first.image, '');
  assert.equal(second.title, 'Med billede');
  assert.equal(second.image, 'https://videnskab.dk/img.jpg');
});

test('parseFeed reads Atom entries and skips tracking pixels', () => {
  const [entry] = parseFeed(ATOM);
  assert.equal(entry.url, 'https://theconversation.com/how-does-a-compass-work-289238');
  assert.equal(entry.summary, 'Like all cool phenomena, the explanation is not magic – it’s physics.');
  assert.equal(entry.date, '2026-11-16T23:55:20.000Z');
  assert.equal(entry.image, 'https://images.theconversation.com/files/1/original/a.jpg?ixlib=rb&w=754&fit=clip');
  assert.equal(entry.authors.length, 2);
});

test('formatAuthors keeps names and shortens long lists', () => {
  assert.equal(formatAuthors(['Emma Brown, Lecturer, Uni']), 'Emma Brown');
  assert.equal(formatAuthors(['A, x', 'B, y']), 'A & B');
  assert.equal(formatAuthors(['A', 'B', 'C']), 'A et al.');
  assert.equal(formatAuthors([]), '');
});

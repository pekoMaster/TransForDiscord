const assert = require('assert');

const SharedDOMParser = require('../src/shared/html/dom-parser');
const LegacyDOMParser = require('../tfd-system/utils/dom-parser');

assert.strictEqual(LegacyDOMParser, SharedDOMParser);

const parser = new SharedDOMParser();
const html = `
<!doctype html>
<html>
  <head>
    <title>Fallback Title</title>
    <meta property="og:title" content="  OG   Title  ">
    <meta name="description" content="Description text">
    <meta property="og:image" content="https://example.com/image.jpg">
    <link rel="canonical" href="https://example.com/page">
    <meta property="og:site_name" content="Example Site">
    <meta name="author" content="Author Name">
    <meta property="article:published_time" content="2026-05-16T00:00:00Z">
    <meta name="keywords" content="alpha, beta">
  </head>
  <body>
    <h1>Heading</h1>
    <p class="summary" data-id="42"> Summary Text </p>
    <ul><li>One</li><li>Two</li><li> </li></ul>
  </body>
</html>`;

assert.deepStrictEqual(parser.extractMetadata(html), {
    title: 'OG Title',
    description: 'Description text',
    image: 'https://example.com/image.jpg',
    url: 'https://example.com/page',
    siteName: 'Example Site',
    author: 'Author Name',
    publishedTime: '2026-05-16T00:00:00Z',
    keywords: 'alpha, beta'
});

assert.strictEqual(parser.extractText(html, '.summary'), 'Summary Text');
assert.strictEqual(parser.extractAttribute(html, '.summary', 'data-id'), '42');
assert.deepStrictEqual(parser.extractMultiple(html, 'li'), ['One', 'Two']);
assert.strictEqual(parser.hasElement(html, 'h1'), true);
assert.strictEqual(parser.hasElement(html, '.missing'), false);

console.log('dom-parser smoke ok');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/tv_focus.js'), 'utf8');

function page(body) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    url: 'https://example.test/', runScripts: 'outside-only'
  });
  // jsdom has no layout engine. Give elements predictable rendered dimensions.
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: Number(this.getAttribute('data-width') || 120),
      height: Number(this.getAttribute('data-height') || 120) };
  };
  dom.window.eval(script);
  return dom;
}

test('adds focus only where needed and keeps normal web controls intact', () => {
  const dom = page(`
    <a id="link" href="/first"><img id="in-link" alt="linked picture"><div id="nested-role" role="button">nested</div></a>
    <button id="button" role="button">Play</button>
    <div id="role" role="button">Show</div>
    <div id="click" onclick="void 0"><img id="in-card" alt="card picture"></div>
    <div id="react-card"><img id="poster" alt="poster"></div>
    <img id="small" data-width="24" data-height="24" alt="icon">
    <img id="decorative" role="presentation" alt="">
    <img id="explicit" tabindex="-1" alt="not focusable">
    <div hidden><img id="hidden" alt="hidden image"></div>`);
  const doc = dom.window.document;
  const attr = id => doc.getElementById(id).getAttribute('tabindex');
  assert.equal(attr('role'), '0');
  assert.equal(attr('click'), '0');
  assert.equal(attr('poster'), '0');
  for (const id of ['link', 'button', 'in-link', 'nested-role', 'in-card', 'small', 'decorative', 'hidden']) {
    assert.equal(attr(id), null, `${id} should not get an extra focus stop`);
  }
  assert.equal(attr('explicit'), '-1', 'explicit negative tabindex must be preserved');
  assert.match(doc.querySelector('style').textContent, /outline:4px solid #7ef0cd/);
  dom.window.eval(script);
  assert.equal(doc.querySelectorAll('style').length, 1, 're-injection should be idempotent');
  dom.window.close();
});

test('newly inserted images are prepared after dynamic page updates', async () => {
  const dom = page('<main id="catalogue"></main>');
  const doc = dom.window.document;
  const image = doc.createElement('img');
  image.alt = 'late poster';
  doc.getElementById('catalogue').appendChild(image);
  await new Promise(resolve => dom.window.setTimeout(resolve, 300));
  assert.equal(image.getAttribute('tabindex'), '0');
  assert.equal(image.getAttribute('data-tv-browser-focus-added'), 'true');
  dom.window.close();
});

test('untrusted synthetic key events cannot trigger the added click fallback', () => {
  const dom = page('<img id="poster" alt="poster">');
  const image = dom.window.document.getElementById('poster');
  let clicks = 0;
  image.addEventListener('click', () => clicks++);
  image.focus();
  image.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Enter', keyCode: 13, bubbles: true, cancelable: true
  }));
  assert.equal(clicks, 0);
  dom.window.close();
});

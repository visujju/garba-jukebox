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
    const left = Number(this.getAttribute('data-x') || 0);
    const top = Number(this.getAttribute('data-y') || 0);
    const width = Number(this.getAttribute('data-width') || 120);
    const height = Number(this.getAttribute('data-height') || 120);
    return { left, top, right: left + width, bottom: top + height, width, height };
  };
  const keyHandlers = [];
  const addDocumentListener = dom.window.document.addEventListener.bind(dom.window.document);
  dom.window.document.addEventListener = (type, handler, options) => {
    if (type === 'keydown') keyHandlers.push(handler);
    return addDocumentListener(type, handler, options);
  };
  dom.window.eval(script);
  // jsdom cannot construct trusted keys; the emulator sends real remote events.
  dom.remoteEnter = (overrides = {}) => {
    const event = { key: 'Enter', keyCode: 13, isTrusted: true, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...overrides };
    keyHandlers.forEach(handler => handler(event));
    return event;
  };
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
  const focusStyle = doc.querySelector('style').textContent;
  assert.match(focusStyle, /outline:4px solid #7ef0cd/);
  assert.match(focusStyle, /iframe:focus/);
  assert.match(focusStyle, /video\[controls\]:focus/);
  assert.match(focusStyle, /\[contenteditable="true"\]:focus/);
  assert.match(focusStyle, /box-shadow:0 0 0 2px #102036,0 0 0 6px/);
  dom.window.eval(script);
  assert.equal(doc.querySelectorAll('style').length, 1, 're-injection should be idempotent');
  dom.window.close();
});

test('prepares pointer-style background cards but avoids duplicate or unsafe stops', () => {
  const dom = page(`
    <style>.pointer-card { cursor: pointer; }</style>
    <div id="background-card" class="pointer-card" data-width="180" data-height="100">Background poster</div>
    <div id="with-image" class="pointer-card"><img id="image" alt="Poster"></div>
    <div id="with-button" class="pointer-card"><button id="button">Already a button</button></div>
    <div id="with-video" class="pointer-card"><video controls></video></div>
    <div id="with-frame" class="pointer-card"><iframe title="Player"></iframe></div>
    <div id="disabled" class="pointer-card" aria-disabled="true">Disabled</div>
    <div id="giant" class="pointer-card" data-width="1000" data-height="700">Page-size wrapper</div>
    <div id="group" class="pointer-card" data-width="400" data-height="100">
      <div id="first" class="pointer-card" data-width="120" data-height="80">One</div>
      <div id="second" class="pointer-card" data-width="120" data-height="80">Two</div>
    </div>`);
  const doc = dom.window.document;
  const attr = id => doc.getElementById(id).getAttribute('tabindex');
  for (const id of ['background-card', 'image', 'first', 'second']) assert.equal(attr(id), '0', id);
  for (const id of ['with-image', 'with-button', 'with-video', 'with-frame', 'disabled', 'giant', 'group']) assert.equal(attr(id), null, id);
  const card = doc.getElementById('background-card');
  let clicks = 0;
  card.addEventListener('click', () => clicks++);
  card.focus();
  assert.equal(dom.remoteEnter().defaultPrevented, true);
  assert.equal(clicks, 1, 'trusted remote OK activates the added focus target');
  dom.remoteEnter({ isTrusted: false });
  dom.remoteEnter({ defaultPrevented: true });
  assert.equal(clicks, 1, 'untrusted or site-handled keys do not activate it');
  dom.window.close();
});

test('new pointer-style cards are prepared after dynamic updates', async () => {
  const dom = page('<main id="catalogue"></main>');
  const card = dom.window.document.createElement('div');
  card.style.cursor = 'pointer';
  card.textContent = 'New card';
  dom.window.document.getElementById('catalogue').appendChild(card);
  await new Promise(resolve => dom.window.setTimeout(resolve, 300));
  assert.equal(card.getAttribute('tabindex'), '0');
  dom.window.close();
});

test('reveals pointer cards as a scrolled carousel approaches them', async () => {
  const dom = page('<div id="card" data-x="5000" style="cursor:pointer">Poster</div>');
  const card = dom.window.document.getElementById('card');
  assert.equal(card.getAttribute('tabindex'), null, 'a distant card is not scanned yet');
  card.setAttribute('data-x', '200');
  dom.window.document.dispatchEvent(new dom.window.Event('scroll'));
  await new Promise(resolve => dom.window.setTimeout(resolve, 300));
  assert.equal(card.getAttribute('tabindex'), '0');
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

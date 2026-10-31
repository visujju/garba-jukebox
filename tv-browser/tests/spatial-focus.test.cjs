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
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    const left = Number(this.getAttribute('data-x') || 0);
    const top = Number(this.getAttribute('data-y') || 0);
    const width = Number(this.getAttribute('data-width') || 60);
    const height = Number(this.getAttribute('data-height') || 60);
    return { left, top, right: left + width, bottom: top + height, width, height };
  };
  dom.window.HTMLElement.prototype.scrollIntoView = function (options) { this.lastScroll = options; };
  const handlers = [];
  const addListener = dom.window.addEventListener.bind(dom.window);
  dom.window.addEventListener = (type, handler, options) => {
    if (type === 'keydown') handlers.push(handler);
    return addListener(type, handler, options);
  };
  dom.window.eval(script);
  // jsdom cannot create trusted keyboard events. Invoke the installed listener
  // with an event-like object; the emulator test sends real D-pad key events.
  dom.remoteKey = (key, overrides = {}) => {
    const event = { key, isTrusted: true, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...overrides };
    handlers.forEach((handler, index) => {
      handler(event);
      if (index === 0 && event.siteAction) event.siteAction();
    });
    return event;
  };
  return dom;
}

const card = (id, x, y, attrs = '') =>
  `<a id="${id}" href="#${id}" data-x="${x}" data-y="${y}" ${attrs}>${id}</a>`;

test('arrows select the nearest item by position, not HTML order', () => {
  const dom = page([
    card('far-right', 600, 150), card('lower-left', 150, 260),
    card('upper', 150, 20), card('diagonal', 310, 260),
    card('lower-right', 250, 260), card('center', 150, 150),
    card('near-right', 250, 150), card('disabled', 210, 150, 'aria-disabled="true"')
  ].join(''));
  const doc = dom.window.document;
  doc.getElementById('center').focus();
  assert.equal(dom.remoteKey('ArrowRight').defaultPrevented, true);
  assert.equal(doc.activeElement.id, 'near-right');
  assert.equal(doc.activeElement.lastScroll.block, 'nearest');
  dom.remoteKey('ArrowDown');
  assert.equal(doc.activeElement.id, 'lower-right');
  dom.remoteKey('ArrowLeft');
  assert.equal(doc.activeElement.id, 'lower-left');
  dom.remoteKey('ArrowUp');
  assert.equal(doc.activeElement.id, 'center');
  dom.window.close();
});

test('a page without initial focus starts with the first visible item', () => {
  const dom = page(card('below', 20, 250) + card('offscreen', 10, 900) + card('first', 20, 20));
  const event = dom.remoteKey('ArrowDown');
  assert.equal(event.defaultPrevented, true);
  assert.equal(dom.window.document.activeElement.id, 'first');
  dom.window.close();
});

test('scrolls an off-screen target into view and lets the page scroll at an edge', () => {
  const dom = page(card('top', 20, 20) + card('bottom', 20, 900));
  const doc = dom.window.document;
  doc.getElementById('top').focus();
  dom.remoteKey('ArrowDown');
  assert.equal(doc.activeElement.id, 'bottom');
  assert.equal(doc.activeElement.lastScroll.block, 'nearest');
  assert.equal(dom.remoteKey('ArrowDown').defaultPrevented, false);
  dom.window.close();

  const far = page(card('top', 20, 20) + card('far-away', 20, 4000));
  far.window.document.getElementById('top').focus();
  assert.equal(far.remoteKey('ArrowDown').defaultPrevented, false, 'do not jump several screens');
  assert.equal(far.window.document.activeElement.id, 'top');
  far.window.close();
});

test('leaves text fields, website-handled keys, modifiers and synthetic keys alone', () => {
  const dom = page('<input id="search" data-x="20" data-y="20">' + card('next', 200, 20));
  const doc = dom.window.document;
  doc.getElementById('search').focus();
  assert.equal(dom.remoteKey('ArrowRight').defaultPrevented, false);
  assert.equal(doc.activeElement.id, 'search');
  doc.getElementById('next').focus();
  for (const overrides of [{isTrusted: false}, {ctrlKey: true}, {defaultPrevented: true}]) {
    const event = dom.remoteKey('ArrowLeft', overrides);
    assert.equal(doc.activeElement.id, 'next');
    assert.equal(event.defaultPrevented, !!overrides.defaultPrevented);
  }
  dom.window.close();
});

test('does not move twice when a website already moved focus or scrolled', () => {
  const dom = page(card('first', 20, 20) + card('second', 150, 20) + card('third', 280, 20));
  const doc = dom.window.document;
  doc.getElementById('first').focus();
  const event = dom.remoteKey('ArrowRight', {siteAction: () => doc.getElementById('second').focus()});
  assert.equal(doc.activeElement.id, 'second');
  assert.equal(event.defaultPrevented, false);
  const scrolled = dom.remoteKey('ArrowRight', {siteAction: () => { dom.window.scrollX = 20; }});
  assert.equal(doc.activeElement.id, 'second');
  assert.equal(scrolled.defaultPrevented, false);
  dom.window.close();
});

test('does not navigate behind an open modal', () => {
  const dom = page(card('behind', 200, 20) +
    '<div role="dialog" aria-modal="true" data-width="500" data-height="500">' +
    card('modal-left', 20, 20) + card('modal-right', 400, 20) + '</div>');
  const doc = dom.window.document;
  doc.getElementById('modal-left').focus();
  dom.remoteKey('ArrowRight');
  assert.equal(doc.activeElement.id, 'modal-right');
  dom.window.close();
});

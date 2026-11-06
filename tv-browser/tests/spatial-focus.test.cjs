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

test('Up and Down ignore small row offsets and keep the expected grid sequence', () => {
  const dom = page(card('first', 100, 100, 'data-width="120" data-height="48"') +
    card('same-row', 230, 106, 'data-width="120" data-height="48"') +
    card('below', 100, 200, 'data-width="120" data-height="48"'));
  const doc = dom.window.document;
  doc.getElementById('first').focus();
  dom.remoteKey('ArrowDown');
  assert.equal(doc.activeElement.id, 'below');
  dom.remoteKey('ArrowUp');
  assert.equal(doc.activeElement.id, 'first');
  dom.remoteKey('ArrowRight');
  assert.equal(doc.activeElement.id, 'same-row');
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
  const dom = page('<input id="search" value="abc" data-x="20" data-y="20">' + card('next', 200, 20));
  const doc = dom.window.document;
  doc.getElementById('search').focus();
  doc.getElementById('search').setSelectionRange(1, 1);
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

test('one-line fields allow leaving at caret edges or vertically without stealing editing', () => {
  const dom = page('<input id="search" value="hello" data-x="20" data-y="20">' +
    card('right', 200, 20) + card('below', 20, 160) +
    '<input id="combo" role="combobox" data-x="400" data-y="20">' +
    '<textarea id="multi" data-x="600" data-y="20"></textarea>');
  const doc = dom.window.document;
  const input = doc.getElementById('search');
  input.focus();
  input.setSelectionRange(2, 2);
  assert.equal(dom.remoteKey('ArrowRight').defaultPrevented, false);
  assert.equal(doc.activeElement.id, 'search', 'arrow edits the text inside the value');
  input.setSelectionRange(5, 5);
  assert.equal(dom.remoteKey('ArrowRight').defaultPrevented, true);
  assert.equal(doc.activeElement.id, 'right', 'Right leaves a field at the end of the caret');
  input.focus();
  input.setSelectionRange(1, 3);
  assert.equal(dom.remoteKey('ArrowRight').defaultPrevented, false, 'selection is not stolen');
  assert.equal(doc.activeElement.id, 'search');
  dom.remoteKey('ArrowDown');
  assert.equal(doc.activeElement.id, 'below');
  doc.getElementById('combo').focus();
  assert.equal(dom.remoteKey('ArrowDown').defaultPrevented, false, 'combobox owns its arrows');
  doc.getElementById('multi').focus();
  assert.equal(dom.remoteKey('ArrowDown').defaultPrevented, false, 'multiline field owns its arrows');
  dom.window.close();
});

test('a text field with an open or accessible suggestions list keeps its arrows', () => {
  const dom = page('<input id="list" list="choices" data-x="20" data-y="20">' +
    '<input id="expanded" aria-expanded="true" data-x="20" data-y="120">' +
    '<input id="autocomplete" aria-autocomplete="list" data-x="20" data-y="220">' + card('next', 200, 20));
  const doc = dom.window.document;
  for (const id of ['list', 'expanded', 'autocomplete']) {
    doc.getElementById(id).focus();
    assert.equal(dom.remoteKey('ArrowDown').defaultPrevented, false, id + ' must keep its suggestions keys');
    assert.equal(doc.activeElement.id, id);
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

test('does not move focus a second time when a site scrolls a nested carousel', () => {
  const dom = page('<div id="carousel">' + card('current', 20, 20) + card('next', 200, 20) + '</div>');
  const doc = dom.window.document;
  doc.getElementById('current').focus();
  const event = dom.remoteKey('ArrowRight', {siteAction: () => { doc.getElementById('carousel').scrollLeft = 90; }});
  assert.equal(event.defaultPrevented, false);
  assert.equal(doc.activeElement.id, 'current');
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

test('keeps a nearby same-row or same-column item ahead of a closer diagonal', () => {
  // These diagonal cards have a lower old weighted score, but are not in the
  // row or column the user is navigating.
  const dom = page(card('center', 100, 100) + card('diagonal-right', 180, 190) +
    card('same-row', 280, 100) + card('diagonal-down', 190, 180) + card('same-column', 100, 280));
  const doc = dom.window.document;
  doc.getElementById('center').focus();
  dom.remoteKey('ArrowRight');
  assert.equal(doc.activeElement.id, 'same-row');
  doc.getElementById('center').focus();
  dom.remoteKey('ArrowDown');
  assert.equal(doc.activeElement.id, 'same-column');
  dom.window.close();
});

test('falls back to a nearby diagonal instead of a far-away aligned target', () => {
  const dom = page(card('center', 20, 20) + card('diagonal', 150, 120) + card('distant', 1500, 20));
  const doc = dom.window.document;
  doc.getElementById('center').focus();
  dom.remoteKey('ArrowRight');
  assert.equal(doc.activeElement.id, 'diagonal');
  dom.window.close();
});

function size(element, dimensions) {
  for (const [name, value] of Object.entries(dimensions)) {
    Object.defineProperty(element, name, { configurable: true, value });
  }
}

test('switches immediately between page scrolling and item focus without moving focus', () => {
  const dom = page(card('first', 20, 20) + card('below', 20, 300));
  const doc = dom.window.document;
  const root = doc.documentElement;
  size(root, { clientWidth: 1024, clientHeight: 768, scrollWidth: 1024, scrollHeight: 3000 });
  doc.getElementById('first').focus();
  assert.equal(dom.window.__tvBrowserSetNavigationMode('scroll'), 'scroll');
  assert.equal(dom.remoteKey('ArrowDown').defaultPrevented, true);
  assert.ok(root.scrollTop > 0, 'Down scrolls the page');
  assert.equal(doc.activeElement.id, 'first', 'scroll mode does not jump to a card');
  dom.remoteKey('ArrowUp');
  assert.equal(root.scrollTop, 0, 'Up scrolls back');
  assert.equal(dom.remoteKey('ArrowLeft').defaultPrevented, true, 'edges do not fall back to focus');
  // Idempotent reinjection must not reset the selection on the same page.
  dom.window.eval(script);
  dom.remoteKey('ArrowDown');
  assert.equal(doc.activeElement.id, 'first');
  assert.ok(root.scrollTop > 0);
  assert.equal(dom.window.__tvBrowserSetNavigationMode('items'), 'items');
  dom.remoteKey('ArrowDown');
  assert.equal(doc.activeElement.id, 'below', 'item mode immediately resumes spatial focus');
  dom.window.close();
});

test('scroll mode uses the nearest nested panel and horizontal carousel', () => {
  const dom = page('<div id="panel" style="overflow: auto">' + card('first', 20, 20) + card('next', 200, 20) + '</div>');
  const doc = dom.window.document;
  const panel = doc.getElementById('panel');
  size(panel, { clientWidth: 300, clientHeight: 200, scrollWidth: 1200, scrollHeight: 800 });
  size(doc.documentElement, { clientWidth: 1024, clientHeight: 768, scrollWidth: 1024, scrollHeight: 3000 });
  doc.getElementById('first').focus();
  dom.window.__tvBrowserSetNavigationMode('scroll');
  dom.remoteKey('ArrowRight');
  assert.equal(panel.scrollLeft, 210);
  dom.remoteKey('ArrowDown');
  assert.equal(panel.scrollTop, 140);
  assert.equal(doc.documentElement.scrollTop, 0, 'nested scroll has priority over the page');
  assert.equal(doc.activeElement.id, 'first');
  dom.remoteKey('ArrowLeft');
  dom.remoteKey('ArrowUp');
  assert.equal(panel.scrollLeft, 0);
  assert.equal(panel.scrollTop, 0);
  dom.window.close();
});

test('scroll mode supports right-to-left carousels', () => {
  const dom = page('<div id="panel" style="overflow-x: auto; direction: rtl">' + card('first', 20, 20) + '</div>');
  const doc = dom.window.document;
  const panel = doc.getElementById('panel');
  size(panel, { clientWidth: 300, clientHeight: 200, scrollWidth: 1200, scrollHeight: 200 });
  doc.getElementById('first').focus();
  dom.window.__tvBrowserSetNavigationMode('scroll');
  dom.remoteKey('ArrowLeft');
  assert.equal(panel.scrollLeft, -210);
  dom.remoteKey('ArrowRight');
  assert.equal(panel.scrollLeft, 0);
  dom.window.close();
});

test('scroll mode respects editing, embedded media, site-handled keys and modals', () => {
  const dom = page('<input id="input" value="abc">' + card('first', 20, 100) +
    '<div id="dialog" role="dialog" aria-modal="true">' + card('inside', 20, 200) + '</div>');
  const doc = dom.window.document;
  const root = doc.documentElement;
  size(root, { clientWidth: 1024, clientHeight: 768, scrollWidth: 1024, scrollHeight: 3000 });
  dom.window.__tvBrowserSetNavigationMode('scroll');
  doc.getElementById('input').focus();
  assert.equal(dom.remoteKey('ArrowDown').defaultPrevented, false, 'text fields keep their keys');
  assert.equal(root.scrollTop, 0);
  doc.getElementById('inside').focus();
  assert.equal(dom.remoteKey('ArrowDown').defaultPrevented, true);
  assert.equal(root.scrollTop, 0, 'a modal does not scroll the page behind it');
  doc.getElementById('dialog').remove();
  doc.getElementById('first').focus();
  assert.equal(dom.remoteKey('ArrowDown', {defaultPrevented: true}).defaultPrevented, true);
  assert.equal(root.scrollTop, 0, 'site-handled keys are not duplicated');
  assert.equal(dom.remoteKey('ArrowDown', {isTrusted: false}).defaultPrevented, false);
  assert.equal(root.scrollTop, 0, 'synthetic keys are ignored');
  dom.window.close();
});

test('restores the selected item after browser chrome temporarily takes focus', () => {
  const dom = page(card('first', 20, 20) + card('selected', 200, 20));
  const doc = dom.window.document;
  doc.getElementById('selected').focus();
  dom.window.__tvBrowserRememberFocus();
  // WebView may focus the first link as it regains native focus.
  doc.getElementById('first').focus();
  assert.equal(dom.window.__tvBrowserRestoreFocus(), true);
  assert.equal(doc.activeElement.id, 'selected');
  assert.equal(dom.window.__tvBrowserRestoreFocus(), false, 'the saved target is consumed');
  dom.window.close();
});

test('does not restore a removed item or an item behind a modal', () => {
  const dom = page(card('first', 20, 20) + card('selected', 200, 20));
  const doc = dom.window.document;
  const selected = doc.getElementById('selected');
  selected.focus();
  dom.window.__tvBrowserRememberFocus();
  selected.remove();
  doc.getElementById('first').focus();
  assert.equal(dom.window.__tvBrowserRestoreFocus(), false);
  assert.equal(doc.activeElement.id, 'first');
  dom.window.__tvBrowserRememberFocus();
  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML = card('modal', 300, 20);
  doc.body.appendChild(dialog);
  doc.getElementById('modal').focus();
  assert.equal(dom.window.__tvBrowserRestoreFocus(), false);
  assert.equal(doc.activeElement.id, 'modal');
  dom.window.close();
});

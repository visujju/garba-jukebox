const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/tv_adblock.js'), 'utf8');

function page(body) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    url: 'https://example.test/', runScripts: 'outside-only'
  });
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: Number(this.getAttribute('data-width') || 220),
      height: Number(this.getAttribute('data-height') || 90) };
  };
  dom.window.eval(script);
  return dom;
}

const hidden = (doc, id) => doc.getElementById(id).style.getPropertyValue('display') === 'none';

test('hides marked floating ads but leaves helpful, inline and large content alone', () => {
  const dom = page(`
    <div id="float" style="position:fixed"><div class="advertisement">Advert</div></div>
    <div id="sticky" style="position:sticky" data-ad-client="example">Ad</div>
    <div id="absolute" class="ad-overlay" style="position:absolute">Ad</div>
    <div id="help" style="position:fixed">Help</div>
    <div id="badge" style="position:fixed">Badge</div>
    <div id="inline" class="advertisement">Inline content</div>
    <div id="large" class="ad-overlay" data-width="1000" data-height="700" style="position:fixed">Large</div>
    <div role="dialog"><div id="consent" class="advertisement" style="position:fixed">Consent</div></div>
    <div id="player" style="position:fixed"><video></video><div class="advertisement">Player</div></div>
    <div id="account" class="ad-container" style="position:fixed"><form><input></form></div>`);
  const doc = dom.window.document;
  for (const id of ['float', 'sticky', 'absolute']) assert.equal(hidden(doc, id), true, id);
  for (const id of ['help', 'badge', 'inline', 'large', 'consent', 'player', 'account']) {
    assert.equal(hidden(doc, id), false, id);
  }
  assert.equal(doc.getElementById('float').style.getPropertyPriority('display'), 'important');
  dom.window.eval(script);
  assert.equal(doc.getElementById('float').getAttribute('data-tv-browser-hidden-ad'), 'true');
  dom.window.close();
});

test('does not hide or change a website update dialog', () => {
  const dom = page(`
    <div id="update" role="dialog" aria-modal="true" style="position:fixed">
      <h1>Update Required</h1><p>A website-supplied update message.</p>
      <button id="update-button">Update Now</button>
    </div>`);
  const doc = dom.window.document;
  assert.equal(hidden(doc, 'update'), false);
  assert.equal(doc.getElementById('update-button').textContent, 'Update Now');
  assert.equal(doc.querySelector('#update h1').textContent, 'Update Required');
  dom.window.close();
});

test('hides new or newly marked floating ads added by a dynamic website', async () => {
  const dom = page('<main id="root"></main>');
  const doc = dom.window.document;
  const floating = doc.createElement('div');
  floating.id = 'dynamic';
  floating.style.position = 'fixed';
  floating.innerHTML = '<div class="ad-container">Advertisement</div>';
  doc.getElementById('root').appendChild(floating);
  await new Promise(resolve => dom.window.setTimeout(resolve, 300));
  assert.equal(hidden(doc, 'dynamic'), true);

  const marked = doc.createElement('div');
  marked.id = 'marked-later';
  marked.style.position = 'fixed';
  doc.getElementById('root').appendChild(marked);
  await new Promise(resolve => dom.window.setTimeout(resolve, 300));
  assert.equal(hidden(doc, 'marked-later'), false);
  marked.className = 'ad-overlay';
  await new Promise(resolve => dom.window.setTimeout(resolve, 300));
  assert.equal(hidden(doc, 'marked-later'), true);
  marked.style.display = 'block';
  await new Promise(resolve => dom.window.setTimeout(resolve, 300));
  assert.equal(hidden(doc, 'marked-later'), true, 'a site cannot immediately re-show the same ad');
  dom.window.close();
});

(() => {
  'use strict';

  // Original, fictional entries for the interface demo. No streams are bundled.
  const titles = [
    { id: 'last-light', title: 'The Last Light', type: 'Movie', year: '2025', length: '2h 14m', genres: ['Sci-Fi', 'Adventure'], image: 'assets/last-light.jpg', description: 'One journey beyond the known. One last chance to find a way home.' },
    { id: 'midnight-district', title: 'Midnight District', type: 'Series', year: '2025', length: '1 season', genres: ['Crime', 'Drama'], image: 'assets/midnight-district.jpg', description: 'In a city that never sleeps, one detective follows a trail of secrets through the rain.' },
    { id: 'northbound', title: 'Northbound', type: 'Movie', year: '2024', length: '1h 52m', genres: ['Adventure', 'Drama'], image: 'assets/northbound.jpg', description: 'A solitary journey across the mountains becomes a story of courage, loss and discovery.' },
    { id: 'blue-hour', title: 'Blue Hour', type: 'Series', year: '2024', length: '2 seasons', genres: ['Drama'], image: 'assets/blue-hour.jpg', description: 'Two lives cross paths over one long summer on a coast full of second chances.' },
    { id: 'undertow', title: 'The Deep Between', type: 'Movie', year: '2025', length: '1h 46m', genres: ['Adventure', 'Drama'], image: 'assets/undertow.jpg', description: 'Far below the surface, an explorer searches for answers in the quiet of the deep.' },
    { id: 'wild-earth', title: 'Wild Earth', type: 'Series', year: '2025', length: '1 season', genres: ['Nature', 'Documentary'], image: 'assets/wild-earth.jpg', description: 'A journey into the wild places and extraordinary lives that make our planet home.' },
    { id: 'golden-miles', title: 'Golden Miles', type: 'Movie', year: '2023', length: '1h 38m', genres: ['Drama', 'Adventure'], image: 'assets/golden-miles.jpg', description: 'An unexpected road trip reminds two old friends that the best stories are the ones still ahead.' },
    { id: 'slow-burn', title: 'Slow Burn', type: 'Series', year: '2024', length: '1 season', genres: ['Food', 'Documentary'], image: 'assets/slow-burn.jpg', description: 'Inside the kitchens where passion, patience and a little fire bring people together.' }
  ];
  const byId = new Map(titles.map(title => [title.id, title]));
  const storageKeys = { saved: 'lumen-saved-v1', motion: 'lumen-reduced-motion-v1' };
  const get = selector => document.querySelector(selector);
  const getAll = selector => Array.from(document.querySelectorAll(selector));
  let currentView = 'home';
  let movieFilter = 'all';
  let openDialog = null;
  let returnFocus = null;
  let detailId = null;
  let saved = readSaved();

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) { /* The UI still works for this session. */ }
  }
  function readSaved() {
    try {
      const parsed = JSON.parse(storageGet(storageKeys.saved) || '[]');
      return Array.isArray(parsed) ? [...new Set(parsed.filter(id => byId.has(id)))] : [];
    } catch (_) { return []; }
  }
  function announce(message) {
    get('#announcement').textContent = message;
  }
  function setSaveButton(button, id) {
    const exists = saved.includes(id);
    button.setAttribute('aria-pressed', String(exists));
    button.querySelector('span').textContent = exists ? 'In My List' : 'Add to My List';
    button.querySelector('use').setAttribute('href', exists ? '#icon-check' : '#icon-plus');
  }
  function renderSavedState() {
    get('#saved-count').textContent = String(saved.length);
    get('#saved-page-count').textContent = `${saved.length} ${saved.length === 1 ? 'title' : 'titles'}`;
    setSaveButton(get('#hero-save'), 'last-light');
    if (detailId) setSaveButton(get('#detail-save'), detailId);
    const savedTitles = saved.map(id => byId.get(id)).filter(Boolean);
    renderCards(get('#saved-results'), savedTitles);
    get('#saved-empty').hidden = savedTitles.length !== 0;
  }
  function toggleSaved(id) {
    if (!byId.has(id)) return;
    const exists = saved.includes(id);
    saved = exists ? saved.filter(item => item !== id) : [...saved, id];
    storageSet(storageKeys.saved, JSON.stringify(saved));
    renderSavedState();
    announce(`${byId.get(id).title} ${exists ? 'removed from' : 'added to'} My List.`);
  }

  function createCard(title, index) {
    const button = document.createElement('button');
    button.className = 'title-card';
    button.dataset.titleId = title.id;
    button.setAttribute('aria-label', `${title.title}, ${title.type}, open details`);
    const art = document.createElement('span');
    art.className = 'card-art';
    const image = document.createElement('img');
    image.src = title.image;
    image.alt = '';
    const type = document.createElement('span');
    type.className = 'card-type';
    type.textContent = title.type.toUpperCase();
    const number = document.createElement('span');
    number.className = 'card-number';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = String(index + 1).padStart(2, '0');
    art.append(image, type, number);
    const name = document.createElement('span');
    name.className = 'card-title';
    name.textContent = title.title;
    const meta = document.createElement('span');
    meta.className = 'card-meta';
    meta.textContent = `${title.genres[0]}  ·  ${title.length}`;
    button.append(art, name, meta);
    button.addEventListener('click', () => showDetails(title.id));
    return button;
  }
  function renderCards(container, entries) {
    container.replaceChildren(...entries.map(createCard));
  }
  function renderSearch() {
    const query = get('#search-input').value.trim().toLocaleLowerCase();
    const found = titles.filter(title => `${title.title} ${title.type} ${title.genres.join(' ')} ${title.description}`.toLocaleLowerCase().includes(query));
    get('#search-heading').textContent = query ? 'Search results' : 'Explore the collection';
    get('#search-count').textContent = `${found.length} ${found.length === 1 ? 'title' : 'titles'}`;
    get('#search-empty').hidden = found.length > 0;
    renderCards(get('#search-results'), found);
  }
  function renderMovies() {
    const found = titles.filter(title => title.type === 'Movie' && (movieFilter === 'all' || title.genres.includes(movieFilter)));
    get('#movie-count').textContent = `${found.length} ${found.length === 1 ? 'title' : 'titles'}`;
    get('#movies-empty').hidden = found.length > 0;
    getAll('[data-filter]').forEach(button => {
      const selected = button.dataset.filter === movieFilter;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    renderCards(get('#movie-results'), found);
  }

  function focusElement(element) {
    if (!element) return;
    try { element.focus({ preventScroll: true }); } catch (_) { element.focus(); }
    if (typeof element.scrollIntoView === 'function') {
      try { element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }); }
      catch (_) { element.scrollIntoView(false); }
    }
  }
  function navigate(view, shouldFocus = true) {
    if (!['home', 'search', 'movies', 'live', 'saved', 'settings'].includes(view)) return;
    currentView = view;
    getAll('[data-page]').forEach(page => { page.hidden = page.dataset.page !== view; });
    getAll('.nav-item').forEach(button => {
      const active = button.dataset.nav === view;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    get('#main').scrollTop = 0;
    if (view === 'search') renderSearch();
    if (view === 'movies') renderMovies();
    if (view === 'saved') renderSavedState();
    if (shouldFocus) {
      const selectors = { home: '#hero-details', search: '#search-input', movies: '[data-filter="all"]', live: '[data-page="live"] button', saved: '#saved-results .title-card, .saved-back', settings: '#motion-switch' };
      requestAnimationFrame(() => focusElement(get(selectors[view])));
    }
    announce(`${view === 'live' ? 'Live TV' : view === 'saved' ? 'My List' : view[0].toUpperCase() + view.slice(1)} opened.`);
  }

  function showDetails(id) {
    const title = byId.get(id);
    if (!title || openDialog) return;
    returnFocus = document.activeElement;
    detailId = id;
    get('#detail-image').src = title.image;
    get('#detail-title').textContent = title.title;
    get('#detail-type').textContent = title.type.toUpperCase();
    get('#detail-meta').textContent = `${title.year}   ·   ${title.genres.join(' / ')}   ·   ${title.length}`;
    get('#detail-description').textContent = title.description;
    setSaveButton(get('#detail-save'), id);
    get('#dialog-backdrop').hidden = false;
    get('#details-dialog').hidden = false;
    openDialog = get('#details-dialog');
    requestAnimationFrame(() => focusElement(get('#detail-save')));
  }
  function showClearDialog() {
    if (openDialog) return;
    returnFocus = document.activeElement;
    get('#dialog-backdrop').hidden = false;
    get('#clear-dialog').hidden = false;
    openDialog = get('#clear-dialog');
    requestAnimationFrame(() => focusElement(get('#cancel-clear')));
  }
  function closeDialog() {
    if (!openDialog) return false;
    openDialog.hidden = true;
    get('#dialog-backdrop').hidden = true;
    openDialog = null;
    detailId = null;
    const previous = returnFocus;
    returnFocus = null;
    if (previous && previous.isConnected && !previous.closest('[hidden]')) focusElement(previous);
    else focusElement(get('[data-page="' + currentView + '"] button'));
    return true;
  }
  function back() {
    if (closeDialog()) return true;
    if (currentView !== 'home') { navigate('home'); return true; }
    return false;
  }
  window.lumenBack = back; // The Android shell calls this; no JavaScript bridge is exposed.

  function visible(element) {
    if (!element || element.disabled || element.closest('[hidden]')) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  function moveFocus(direction) {
    const scope = openDialog || document;
    const current = document.activeElement;
    const items = Array.from(scope.querySelectorAll('button, input, [tabindex="0"]')).filter(visible);
    if (!items.length) return;
    const from = visible(current) && scope.contains(current) ? current.getBoundingClientRect() : null;
    if (!from) { focusElement(items[0]); return; }
    const horizontal = direction === 'left' || direction === 'right';
    const fromX = (from.left + from.right) / 2;
    const fromY = (from.top + from.bottom) / 2;
    let best = null;
    let score = Infinity;
    for (const item of items) {
      if (item === current) continue;
      // Up/Down should stay in the navigation rail or the content area.
      // Left/Right can still move freely between those regions.
      if (!horizontal && !openDialog && Boolean(current.closest('.rail')) !== Boolean(item.closest('.rail'))) continue;
      const rect = item.getBoundingClientRect();
      const x = (rect.left + rect.right) / 2;
      const y = (rect.top + rect.bottom) / 2;
      let primary = horizontal ? x - fromX : y - fromY;
      if (direction === 'left' || direction === 'up') primary = -primary;
      // A focused control can lift a few pixels; don't treat its neighbour on
      // the same row as a Down/Up target (or a same-column item as Left/Right).
      const threshold = Math.max(3, (horizontal ? Math.min(from.width, rect.width)
                                                  : Math.min(from.height, rect.height)) * 0.18);
      if (primary <= threshold) continue;
      const gap = horizontal ? Math.max(0, from.top - rect.bottom, rect.top - from.bottom)
                             : Math.max(0, from.left - rect.right, rect.left - from.right);
      const cross = horizontal ? Math.abs(y - fromY) : Math.abs(x - fromX);
      const distance = primary + 2 * gap + 0.06 * cross;
      if (distance < score) { best = item; score = distance; }
    }
    if (best) focusElement(best);
  }

  function setup() {
    renderCards(get('#home-picks'), ['midnight-district', 'northbound', 'blue-hour', 'undertow', 'wild-earth'].map(id => byId.get(id)));
    renderCards(get('#home-series'), titles.filter(title => title.type === 'Series'));
    renderSavedState();
    renderSearch();
    renderMovies();
    const reduceMotion = storageGet(storageKeys.motion) === 'true';
    document.body.classList.toggle('reduce-motion', reduceMotion);
    get('#motion-switch').setAttribute('aria-checked', String(reduceMotion));
    getAll('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav)));
    getAll('[data-filter]').forEach(button => button.addEventListener('click', () => { movieFilter = button.dataset.filter; renderMovies(); }));
    get('#search-input').addEventListener('input', renderSearch);
    get('#hero-details').addEventListener('click', () => showDetails('last-light'));
    get('#hero-save').addEventListener('click', () => toggleSaved('last-light'));
    get('#detail-save').addEventListener('click', () => toggleSaved(detailId));
    getAll('[data-close-dialog]').forEach(button => button.addEventListener('click', closeDialog));
    get('#clear-saved').addEventListener('click', showClearDialog);
    get('#cancel-clear').addEventListener('click', closeDialog);
    get('#confirm-clear').addEventListener('click', () => {
      saved = [];
      storageSet(storageKeys.saved, '[]');
      renderSavedState();
      closeDialog();
      announce('My List cleared.');
    });
    get('#motion-switch').addEventListener('click', event => {
      const enabled = event.currentTarget.getAttribute('aria-checked') !== 'true';
      event.currentTarget.setAttribute('aria-checked', String(enabled));
      document.body.classList.toggle('reduce-motion', enabled);
      storageSet(storageKeys.motion, String(enabled));
      announce(`Reduced motion ${enabled ? 'on' : 'off'}.`);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Tab' && openDialog) {
        const controls = Array.from(openDialog.querySelectorAll('button, input, [tabindex="0"]')).filter(visible);
        const index = controls.indexOf(document.activeElement);
        if (controls.length && ((!event.shiftKey && index === controls.length - 1) || (event.shiftKey && index <= 0))) {
          event.preventDefault();
          focusElement(event.shiftKey ? controls[controls.length - 1] : controls[0]);
        }
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
      if (event.key === 'Escape' || (event.key === 'Backspace' && !event.target.matches('input, textarea'))) {
        if (back()) event.preventDefault();
        return;
      }
      const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Left: 'left', Right: 'right', Up: 'up', Down: 'down' };
      if (event.target.matches('input, textarea')) {
        if (event.key === 'ArrowDown' || event.key === 'Down' || event.key === 'Enter') {
          const first = get('#search-results .title-card');
          if (first) { event.preventDefault(); focusElement(first); }
        }
        return;
      }
      if (directions[event.key]) { event.preventDefault(); moveFocus(directions[event.key]); }
    });
    navigate('home');
  }
  document.addEventListener('DOMContentLoaded', setup);
})();

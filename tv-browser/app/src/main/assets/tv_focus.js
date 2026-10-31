/*
 * TV focus support for ordinary web pages. Runs in the page's own context; it
 * has no Android bridge and sends no data anywhere. Normal links and controls
 * keep their native activation behavior.
 */
(function () {
    'use strict';
    if (window.__tvBrowserFocusInstalled || !document.documentElement) return;
    window.__tvBrowserFocusInstalled = true;

    var addedAttribute = 'data-tv-browser-focus-added';
    var actionable = 'a[href],button,input,select,textarea,summary,[role="button"],'
        + '[role="link"],[tabindex],[onclick]';
    var style = document.createElement('style');
    style.textContent = 'a[href]:focus,button:focus,input:focus,select:focus,textarea:focus,'
        + 'summary:focus,iframe:focus,video[controls]:focus,audio[controls]:focus,'
        + '[contenteditable=""]:focus,[contenteditable="true"]:focus,'
        + '[role="button"]:focus,[role="link"]:focus,[tabindex]:focus {'
        + 'outline:4px solid #7ef0cd !important;outline-offset:-4px !important;'
        + 'box-shadow:0 0 0 2px #102036,0 0 0 6px rgba(126,240,205,.35) !important;}';
    (document.head || document.documentElement).appendChild(style);

    function visible(element) {
        if (!element || element === document.body || element === document.documentElement
                || element.closest('[aria-hidden="true"],[aria-disabled="true"],[hidden],[inert]')
                || element.matches(':disabled')) return false;
        var rect = element.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return false;
        var computed = window.getComputedStyle(element);
        return computed.display !== 'none' && computed.visibility !== 'hidden'
            && computed.visibility !== 'collapse' && computed.opacity !== '0';
    }

    function addFocus(element) {
        // Respect a website's existing tabindex, including an explicit -1.
        if (element.hasAttribute('tabindex') || !visible(element)) return;
        element.setAttribute('tabindex', '0');
        element.setAttribute(addedAttribute, 'true');
    }

    function prepare() {
        var elements = document.querySelectorAll('[role="button"],[role="link"],[onclick]');
        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];
            // Native controls already have their own keyboard activation semantics.
            if (element.matches('a[href],button,input,select,textarea,summary')) continue;
            if (element.parentElement && element.parentElement.closest(actionable)) continue;
            addFocus(element);
        }
        var images = document.querySelectorAll('img');
        for (var j = 0; j < images.length; j++) {
            var image = images[j];
            if (image.getAttribute('role') === 'presentation' || image.getAttribute('aria-hidden') === 'true') continue;
            var rect = image.getBoundingClientRect();
            if (rect.width < 64 || rect.height < 64) continue;
            // Do not create a second stop inside a link, button or focusable card.
            if (image.parentElement && image.parentElement.closest(actionable)) continue;
            addFocus(image);
        }
    }

    // For non-semantic cards/images that we made focusable, Enter needs to
    // trigger their click handler. Native links, buttons and form fields are
    // deliberately left to the WebView so forms, keyboard and video work.
    document.addEventListener('keydown', function (event) {
        var target = document.activeElement;
        if (!event.isTrusted || event.defaultPrevented || event.repeat
                || (event.key !== 'Enter' && event.keyCode !== 13)
                || !target || target.getAttribute(addedAttribute) !== 'true') return;
        if (typeof target.click === 'function') {
            event.preventDefault();
            target.click();
        }
    }, false);

    var focusable = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,'
        + 'iframe,video[controls],audio[controls],[contenteditable=""],[contenteditable="true"],[tabindex]';

    function modalScope() {
        var dialogs = document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]');
        for (var i = dialogs.length - 1; i >= 0; i--) {
            if (visible(dialogs[i])) return dialogs[i];
        }
        return document;
    }

    function nextInDirection(current, direction) {
        var scope = modalScope();
        var items = scope.querySelectorAll(focusable);
        var from = current && current !== document.body && current !== document.documentElement
            && visible(current) && (scope === document || scope.contains(current))
            ? current.getBoundingClientRect() : null;
        var best = null;
        var bestScore = Infinity;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var tabIndex = item.getAttribute('tabindex');
            if (item === current || (tabIndex !== null && Number(tabIndex) < 0)
                    || (item.tabIndex < 0 && !item.hasAttribute('contenteditable')) || !visible(item)) continue;
            if (from && current && (current.contains(item) || item.contains(current))) continue;
            var rect = item.getBoundingClientRect();
            var score;
            if (!from) {
                // Start at the first visible item, not the page's HTML/tab order.
                if (rect.right <= 0 || rect.bottom <= 0
                        || rect.left >= window.innerWidth || rect.top >= window.innerHeight) continue;
                score = Math.max(0, rect.top) * (window.innerWidth + 1) + Math.max(0, rect.left);
            } else {
                var fromX = (from.left + from.right) / 2;
                var fromY = (from.top + from.bottom) / 2;
                var itemX = (rect.left + rect.right) / 2;
                var itemY = (rect.top + rect.bottom) / 2;
                var horizontal = direction === 'left' || direction === 'right';
                var primary = horizontal ? itemX - fromX : itemY - fromY;
                if (direction === 'left' || direction === 'up') primary = -primary;
                var viewportSize = horizontal ? window.innerWidth : window.innerHeight;
                if (primary <= 1 || primary > 2 * viewportSize) continue;
                var crossGap = horizontal
                    ? Math.max(0, from.top - rect.bottom, rect.top - from.bottom)
                    : Math.max(0, from.left - rect.right, rect.left - from.right);
                var crossCenter = horizontal ? Math.abs(itemY - fromY) : Math.abs(itemX - fromX);
                // Favor a nearby item on the same row/column, but allow a
                // diagonal choice when that is the closest available option.
                score = primary + 2 * crossGap + 0.05 * crossCenter;
            }
            if (score < bestScore) {
                best = item;
                bestScore = score;
            }
        }
        return best;
    }

    // Detect sites that move focus or scroll themselves, even when they do not
    // explicitly prevent the key. Do not perform a second movement for them.
    var keyStarts = new WeakMap();
    window.addEventListener('keydown', function (event) {
        if (event.isTrusted) keyStarts.set(event, {
            focused: document.activeElement, x: window.scrollX, y: window.scrollY
        });
    }, true);

    // Run after the website's own handlers. If a page handles an arrow itself,
    // or the user is editing a field/slider, leave the key to that page.
    window.addEventListener('keydown', function (event) {
        if (!event.isTrusted || event.defaultPrevented || event.altKey || event.ctrlKey
                || event.metaKey || event.shiftKey) return;
        var start = keyStarts.get(event);
        if (start && (start.focused !== document.activeElement || start.x !== window.scrollX
                || start.y !== window.scrollY)) return;
        var keys = {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
                    Left: 'left', Right: 'right', Up: 'up', Down: 'down'};
        var codes = {37: 'left', 38: 'up', 39: 'right', 40: 'down'};
        var direction = keys[event.key] || codes[event.keyCode];
        if (!direction) return;
        var current = document.activeElement;
        if (current && current.closest('input,textarea,select,video,audio,[contenteditable=""],'
                + '[contenteditable="true"],[role="slider"],[role="spinbutton"],[role="combobox"]')) return;
        var next = nextInDirection(current, direction);
        if (!next) return; // Let WebView scroll or use its own fallback at the edge.
        try { next.focus({preventScroll: true}); } catch (ignored) { next.focus(); }
        if (document.activeElement !== next) return;
        if (typeof next.scrollIntoView === 'function') {
            try { next.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'auto'}); }
            catch (ignored) { next.scrollIntoView(false); }
        }
        event.preventDefault();
    }, false);

    var scheduled = false;
    function schedulePrepare() {
        if (scheduled) return;
        scheduled = true;
        window.setTimeout(function () {
            scheduled = false;
            prepare();
        }, 200);
    }
    prepare();
    // Many catalogues and single-page sites insert poster cards after load.
    var observer = new MutationObserver(schedulePrepare);
    observer.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'src', 'role', 'onclick']
    });
    window.addEventListener('resize', schedulePrepare, false);
    document.addEventListener('load', schedulePrepare, true);
})();

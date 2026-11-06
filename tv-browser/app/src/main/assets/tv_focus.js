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
    var navigationMode = 'items';
    // The native toolbar changes only navigation behavior; no bridge or
    // browsing data is exposed to the page.
    window.__tvBrowserSetNavigationMode = function (mode) {
        navigationMode = mode === 'scroll' ? 'scroll' : 'items';
        return navigationMode;
    };
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

    function visible(element, rect, computed) {
        if (!element || element === document.body || element === document.documentElement
                || element.closest('[aria-hidden="true"],[aria-disabled="true"],[hidden],[inert]')
                || element.matches(':disabled')) return false;
        rect = rect || element.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return false;
        computed = computed || window.getComputedStyle(element);
        return computed.display !== 'none' && computed.visibility !== 'hidden'
            && computed.visibility !== 'collapse' && computed.opacity !== '0';
    }

    function addFocus(element, rect, computed) {
        // Respect a website's existing tabindex, including an explicit -1.
        if (element.hasAttribute('tabindex') || !visible(element, rect, computed)) return;
        element.setAttribute('tabindex', '0');
        element.setAttribute(addedAttribute, 'true');
    }

    function within(scope, selector) {
        var result = [];
        if (scope.nodeType === 1 && scope.matches(selector)) result.push(scope);
        var descendants = scope.querySelectorAll(selector);
        for (var i = 0; i < descendants.length; i++) result.push(descendants[i]);
        return result;
    }

    // Many sites use JavaScript click listeners and a pointer cursor on a
    // background-image card instead of a link/button. Keep this conservative:
    // never add a second stop around real controls, large page containers or
    // cards whose image already provides a better bubbling click target.
    function preparePointerCards(scope) {
        var candidates = within(scope, 'article,div,li,span');
        var viewportWidth = Math.max(1, window.innerWidth);
        var viewportHeight = Math.max(1, window.innerHeight);
        for (var i = 0; i < candidates.length; i++) {
            var element = candidates[i];
            if (element.hasAttribute('tabindex') || element.matches(actionable)
                    || (element.parentElement && element.parentElement.closest(actionable))
                    || element.closest('textarea,select,[contenteditable=""],[contenteditable="true"]')) continue;
            var rect = element.getBoundingClientRect();
            if (rect.width < 48 || rect.height < 32
                    || rect.width * rect.height > viewportWidth * viewportHeight * 0.65
                    || rect.right < -viewportWidth || rect.left > 2 * viewportWidth
                    || rect.bottom < -viewportHeight || rect.top > 2 * viewportHeight) continue;
            var computed = window.getComputedStyle(element);
            if (computed.cursor !== 'pointer' || !visible(element, rect, computed)
                    || element.querySelector(actionable + ',iframe,video,audio,[contenteditable]')) continue;

            var images = element.querySelectorAll('img:not([aria-hidden="true"]):not([role="presentation"])');
            var hasPoster = false;
            for (var j = 0; j < images.length; j++) {
                var imageRect = images[j].getBoundingClientRect();
                if (imageRect.width >= 64 && imageRect.height >= 64 && visible(images[j], imageRect)) {
                    hasPoster = true;
                    break;
                }
            }
            if (hasPoster) continue;

            // A pointer-styled wrapper holding several cards is not one item.
            var pointerChildren = 0;
            for (var k = 0; k < element.children.length && pointerChildren < 2; k++) {
                var child = element.children[k];
                var childRect = child.getBoundingClientRect();
                if (childRect.width >= 48 && childRect.height >= 32
                        && window.getComputedStyle(child).cursor === 'pointer') pointerChildren++;
            }
            if (pointerChildren < 2) addFocus(element, rect, computed);
        }
    }

    function prepare(scope) {
        var elements = within(scope, '[role="button"],[role="link"],[onclick]');
        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];
            // Native controls already have their own keyboard activation semantics.
            if (element.matches('a[href],button,input,select,textarea,summary')) continue;
            if (element.parentElement && element.parentElement.closest(actionable)) continue;
            addFocus(element);
        }
        preparePointerCards(scope);
        var images = within(scope, 'img');
        for (var j = 0; j < images.length; j++) {
            var image = images[j];
            if (image.getAttribute('role') === 'presentation' || image.getAttribute('aria-hidden') === 'true') continue;
            var rect = image.getBoundingClientRect();
            if (rect.width < 64 || rect.height < 64) continue;
            // Do not create a second stop inside a link, button or focusable card.
            if (image.parentElement && image.parentElement.closest(actionable)) continue;
            addFocus(image, rect);
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
        var best = null, bestScore = Infinity, bestRect = null;
        var aligned = null, alignedScore = Infinity, alignedRect = null;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var tabIndex = item.getAttribute('tabindex');
            if (item === current || (tabIndex !== null && Number(tabIndex) < 0)
                    || (item.tabIndex < 0 && !item.hasAttribute('contenteditable'))) continue;
            if (from && current && (current.contains(item) || item.contains(current))) continue;
            var rect = item.getBoundingClientRect();
            var score, sameLane = false;
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
                // Ignore tiny offsets between items on the same row or column.
                var threshold = Math.max(3, 0.25 * (horizontal
                    ? Math.min(from.width, rect.width) : Math.min(from.height, rect.height)));
                if (primary <= threshold || primary > 2 * viewportSize) continue;
                var crossGap = horizontal
                    ? Math.max(0, from.top - rect.bottom, rect.top - from.bottom)
                    : Math.max(0, from.left - rect.right, rect.left - from.right);
                var crossCenter = horizontal ? Math.abs(itemY - fromY) : Math.abs(itemX - fromX);
                score = primary + 2 * crossGap + 0.05 * crossCenter;
                // Keep moving along the same row/column when a nearby target
                // exists, instead of unexpectedly jumping to a diagonal row.
                sameLane = crossGap === 0 && primary <= 1.25 * viewportSize;
            }
            // Check styles only for geometrically plausible targets; long pages
            // can contain thousands of links and this runs on every arrow.
            if (!visible(item, rect)) continue;
            if (score < bestScore || (score === bestScore && before(rect, bestRect))) {
                best = item; bestScore = score; bestRect = rect;
            }
            if (sameLane && (score < alignedScore || (score === alignedScore && before(rect, alignedRect)))) {
                aligned = item; alignedScore = score; alignedRect = rect;
            }
        }
        return aligned || best;
    }

    function before(a, b) {
        return !b || a.top < b.top || (a.top === b.top && a.left < b.left);
    }

    // Preserve caret movement and specialised native controls. An ordinary
    // one-line field can be left with Up/Down, or Left/Right at a caret edge;
    // text areas, sliders, selects and suggestion lists keep their arrow keys.
    function pageOwnsArrows(element, direction) {
        if (!element) return false;
        if (element.closest('textarea,select,video,audio,[contenteditable=""],'
                + '[contenteditable="true"],[role="slider"],[role="spinbutton"],[role="combobox"]')) return true;
        var input = element.closest('input');
        if (!input) return false;
        var type = (input.getAttribute('type') || 'text').toLowerCase();
        var textField = /^(text|search|email|url|tel|password)$/.test(type);
        var autocomplete = input.getAttribute('aria-autocomplete');
        if (!textField || input.hasAttribute('list') || input.getAttribute('aria-expanded') === 'true'
                || (autocomplete && autocomplete.toLowerCase() !== 'none')) return true;
        if (direction === 'up' || direction === 'down') return false;
        try {
            var start = input.selectionStart, end = input.selectionEnd;
            if (start === null || end === null || start !== end) return true;
            if (direction === 'left') return start !== 0;
            if (direction === 'right') return end !== input.value.length;
        } catch (ignored) { return true; }
        return true;
    }

    // In scroll mode, keep editing, media, embedded frames and specialized
    // controls in charge of their own arrows. Enter/OK still activates links.
    function pageOwnsScrollArrows(element) {
        return !!(element && element.closest('input,textarea,select,iframe,video,audio,'
            + '[contenteditable=""],[contenteditable="true"],'
            + '[role="slider"],[role="spinbutton"],[role="combobox"]'));
    }

    function canScroll(element, horizontal, sign, computed) {
        var size = horizontal ? element.clientWidth : element.clientHeight;
        var max = Math.max(0, (horizontal ? element.scrollWidth : element.scrollHeight) - size);
        var position = horizontal ? element.scrollLeft : element.scrollTop;
        if (max <= 1) return false;
        // Chromium represents an RTL horizontal scroller as 0 to -max.
        if (horizontal && computed.direction === 'rtl' && position <= 0) {
            return sign < 0 ? position > -max + 1 : position < -1;
        }
        return sign < 0 ? position > 1 : position < max - 1;
    }

    function scrollPage(current, direction) {
        var horizontal = direction === 'left' || direction === 'right';
        var sign = direction === 'left' || direction === 'up' ? -1 : 1;
        var root = document.scrollingElement || document.documentElement;
        var scope = modalScope();
        var node = current;
        if (scope !== document && (!node || !scope.contains(node))) node = scope;
        // Prefer the focused item's nearest scrollable panel or carousel.
        // If nothing is focused, a panel under the screen center is a useful
        // fallback for pages that scroll inside a full-screen container.
        if ((!node || node === document.body || node === document.documentElement)
                && document.elementFromPoint) {
            node = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) || node;
        }
        for (; node && node.nodeType === 1 && node !== root
                && node !== document.body && node !== document.documentElement
                && (scope === document || node === scope || scope.contains(node)); node = node.parentElement) {
            var computed = window.getComputedStyle(node);
            var overflow = (horizontal ? computed.overflowX : computed.overflowY) || computed.overflow;
            if (!/^(auto|scroll|overlay)$/.test(overflow) || !canScroll(node, horizontal, sign, computed)) continue;
            var panelSize = horizontal ? node.clientWidth : node.clientHeight;
            var panelStep = sign * Math.max(80, Math.round(panelSize * 0.7));
            if (horizontal) node.scrollLeft += panelStep;
            else node.scrollTop += panelStep;
            return true;
        }
        // Never scroll the page behind an open modal dialog.
        if (scope !== document) return false;
        var rootStyle = window.getComputedStyle(root);
        if (!canScroll(root, horizontal, sign, rootStyle)) return false;
        var viewportSize = horizontal ? window.innerWidth : window.innerHeight;
        var step = sign * Math.max(80, Math.round(viewportSize * 0.7));
        if (horizontal) root.scrollLeft += step;
        else root.scrollTop += step;
        return true;
    }

    // Detect sites that move focus or scroll themselves, even when they do not
    // explicitly prevent the key. Track scrollable ancestors as well as the
    // window so carousels do not get a second, unwanted movement.
    var keyStarts = new WeakMap();
    window.addEventListener('keydown', function (event) {
        if (!event.isTrusted || (!/^(Arrow)?(Left|Right|Up|Down)$/.test(event.key || '')
                && (event.keyCode < 37 || event.keyCode > 40))) return;
        var offsets = [];
        for (var node = document.activeElement; node && node.nodeType === 1; node = node.parentElement) {
            offsets.push({node: node, x: node.scrollLeft, y: node.scrollTop});
        }
        keyStarts.set(event, {
            focused: document.activeElement, x: window.scrollX, y: window.scrollY, offsets: offsets
        });
    }, true);

    function pageMoved(start) {
        if (!start) return false;
        if (start.focused !== document.activeElement || start.x !== window.scrollX
                || start.y !== window.scrollY) return true;
        for (var i = 0; i < start.offsets.length; i++) {
            var item = start.offsets[i];
            if (item.x !== item.node.scrollLeft || item.y !== item.node.scrollTop) return true;
        }
        return false;
    }

    // Run after the website's own handlers. If a page handles an arrow itself,
    // or the user is editing a field/slider, leave the key to that page.
    window.addEventListener('keydown', function (event) {
        if (!event.isTrusted || event.defaultPrevented || event.altKey || event.ctrlKey
                || event.metaKey || event.shiftKey) return;
        var start = keyStarts.get(event);
        if (pageMoved(start)) return;
        var keys = {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
                    Left: 'left', Right: 'right', Up: 'up', Down: 'down'};
        var codes = {37: 'left', 38: 'up', 39: 'right', 40: 'down'};
        var direction = keys[event.key] || codes[event.keyCode];
        if (!direction) return;
        var current = document.activeElement;
        if (navigationMode === 'scroll') {
            if (pageOwnsScrollArrows(current)) return;
            scrollPage(current, direction);
            // Do not fall back to WebView's spatial focus at the page edge.
            event.preventDefault();
            return;
        }
        if (pageOwnsArrows(current, direction)) return;
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

    var scheduled = false, wholePage = false, dirtyRoots = [];
    function schedulePrepare(root) {
        if (!window.document || !window.document.documentElement) return;
        if (!root || root === document || root === document.body || root === document.documentElement) {
            wholePage = true;
            dirtyRoots = [];
        } else if (!wholePage && root.nodeType === 1) {
            var covered = false;
            for (var i = dirtyRoots.length - 1; i >= 0; i--) {
                if (dirtyRoots[i].contains(root)) { covered = true; break; }
                if (root.contains(dirtyRoots[i])) dirtyRoots.splice(i, 1);
            }
            if (!covered) dirtyRoots.push(root);
            if (dirtyRoots.length > 40) { wholePage = true; dirtyRoots = []; }
        }
        if (scheduled) return;
        scheduled = true;
        window.setTimeout(function () {
            var full = wholePage, roots = dirtyRoots;
            scheduled = false; wholePage = false; dirtyRoots = [];
            if (full) prepare(document);
            else for (var j = 0; j < roots.length; j++) {
                if (document.documentElement.contains(roots[j])) prepare(roots[j]);
            }
        }, 200);
    }
    prepare(document);
    // Most DOM updates are local (a badge, a carousel card or an animation).
    // Re-scan just those subtrees, batching bursts, rather than the whole page.
    var observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) schedulePrepare(records[i].target);
    });
    observer.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'inert', 'aria-hidden', 'aria-disabled', 'src', 'role', 'onclick']
    });
    window.addEventListener('resize', function () { schedulePrepare(document); }, false);
    // Pointer-style cards are prepared near the viewport. A carousel scroll
    // only needs its own subtree; scrolling the page needs a viewport-wide pass.
    document.addEventListener('scroll', function (event) {
        var target = event.target;
        schedulePrepare(target && target.nodeType === 1 ? target : document);
    }, true);
    document.addEventListener('load', function (event) {
        if (event.target !== document) {
            schedulePrepare(event.target && event.target.parentElement || document);
        }
    }, true);
})();

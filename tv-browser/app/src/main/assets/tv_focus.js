/*
 * TV focus support for ordinary web pages. Runs in the page's own context; it
 * has no Android bridge and sends no data anywhere. Native WebView D-pad
 * navigation and activation remain in charge for normal links and controls.
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
        + 'summary:focus,[role="button"]:focus,[role="link"]:focus,[tabindex]:focus {'
        + 'outline:4px solid #7ef0cd !important;outline-offset:-4px !important;'
        + 'box-shadow:0 0 0 2px #102036 !important;}';
    (document.head || document.documentElement).appendChild(style);

    function visible(element) {
        if (!element || element === document.body || element === document.documentElement
                || element.closest('[aria-hidden="true"],[hidden],[inert]')) return false;
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

/* Hide clearly marked, small floating advertisements. No data leaves the page. */
(function () {
    'use strict';
    if (window.__tvBrowserAdFilterInstalled || !document.documentElement) return;
    window.__tvBrowserAdFilterInstalled = true;

    var selector = [
        '[data-ad]', '[data-ad-client]', '[data-ad-slot]', '[data-ad-unit]',
        '[aria-label="Advertisement"]', '[aria-label="advertisement"]', '[aria-label="Ad"]',
        '[aria-label="Sponsored"]', '[aria-label="sponsored"]', 'ins.adsbygoogle',
        '[id="ad"]', '[id="ads"]', '[id^="ad-"]', '[id^="ad_"]', '[id^="ads-"]', '[id^="ads_"]',
        '[id$="-ad"]', '[id$="_ad"]', '[id$="-ads"]', '[id$="_ads"]', '[class~="ad"]', '[class~="ads"]',
        '[id*="advertisement"]', '[class*="advertisement"]', '[id*="Advertisement"]', '[class*="Advertisement"]',
        '[id*="ad-container"]', '[class*="ad-container"]', '[id*="ad-slot"]', '[class*="ad-slot"]',
        '[id*="ad-overlay"]', '[class*="ad-overlay"]', '[id*="floating-ad"]', '[class*="floating-ad"]',
        '[id*="popup-ad"]', '[class*="popup-ad"]', '[id*="ad_banner"]', '[class*="ad_banner"]'
    ].join(',');
    var protectedContent = 'dialog,[role="dialog"],[aria-modal="true"],form,input,textarea,select,video,audio';
    var hiddenAttribute = 'data-tv-browser-hidden-ad';

    function safeFloatingBox(candidate) {
        if (candidate.closest(protectedContent)) return null;
        var fallback = null;
        for (var element = candidate, depth = 0; element && depth < 5;
                element = element.parentElement, depth++) {
            if (element === document.body || element === document.documentElement) break;
            if (element.matches(protectedContent) || element.querySelector(protectedContent)) break;
            var computed = window.getComputedStyle(element);
            if (computed.position !== 'fixed' && computed.position !== 'sticky'
                    && computed.position !== 'absolute') continue;
            var rect = element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0 || rect.width > window.innerWidth * 0.8
                    || rect.height > window.innerHeight * 0.5) continue;
            // Prefer a fixed/sticky wrapper over an absolutely positioned child;
            // that also removes an otherwise empty, click-blocking overlay.
            if (computed.position === 'fixed' || computed.position === 'sticky') return element;
            if (!fallback) fallback = element;
        }
        return fallback;
    }

    function hideFloatingAds() {
        var candidates = document.querySelectorAll(selector);
        for (var i = 0; i < candidates.length; i++) {
            var box = safeFloatingBox(candidates[i]);
            if (!box || (box.style.getPropertyValue('display') === 'none'
                    && box.style.getPropertyPriority('display') === 'important')) continue;
            if (!box.hasAttribute(hiddenAttribute)) box.setAttribute(hiddenAttribute, 'true');
            box.style.setProperty('display', 'none', 'important');
        }
    }

    var scheduled = false;
    function scheduleScan() {
        if (scheduled) return;
        scheduled = true;
        window.setTimeout(function () {
            scheduled = false;
            hideFloatingAds();
        }, 200);
    }
    hideFloatingAds();
    var observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            if (record.type === 'childList' && record.addedNodes.length) {
                scheduleScan();
                return;
            }
            if (record.type === 'attributes' && record.target.nodeType === 1
                    && (record.target.matches(selector) || record.target.querySelector(selector))) {
                scheduleScan();
                return;
            }
        }
    });
    observer.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ['class', 'id', 'style', 'aria-label', 'data-ad', 'data-ad-client', 'data-ad-slot', 'data-ad-unit']
    });
    window.addEventListener('resize', scheduleScan, false);
})();

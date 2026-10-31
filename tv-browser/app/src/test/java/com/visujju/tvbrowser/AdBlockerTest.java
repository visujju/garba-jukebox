package com.visujju.tvbrowser;

import org.junit.Test;
import static org.junit.Assert.*;

public class AdBlockerTest {
    @Test public void matchesKnownHostsAndTheirSubdomainsCaseInsensitively() {
        assertTrue(AdBlocker.isAdUrl("https://doubleclick.net/ad.js"));
        assertTrue(AdBlocker.isAdUrl("https://securepubads.g.doubleclick.net/gampad/ads"));
        assertTrue(AdBlocker.isAdUrl("https://PAGEAD2.GOOGLESYNDICATION.COM./pagead/js"));
        assertTrue(AdBlocker.isAdUrl("http://foo.popcash.net:8080/popup"));
        assertTrue(AdBlocker.isAdUrl("https://adservice.google.com/script.js"));
    }

    @Test public void doesNotMatchLookalikesPathsOrUnrelatedGoogleServices() {
        assertFalse(AdBlocker.isAdUrl("https://notdoubleclick.net/"));
        assertFalse(AdBlocker.isAdUrl("https://doubleclick.net.example.org/"));
        assertFalse(AdBlocker.isAdUrl("https://doubleclick.net@safe.example.org/path"));
        assertFalse(AdBlocker.isAdUrl("https://example.org/?next=https://doubleclick.net/"));
        assertFalse(AdBlocker.isAdUrl("https://www.google.com/"));
        assertFalse(AdBlocker.isAdUrl("https://m.youtube.com/"));
        assertFalse(AdBlocker.isAdUrl("https://pvrplay.fun/"));
    }

    @Test public void ignoresMalformedAndNonWebUrls() {
        assertFalse(AdBlocker.isAdUrl(null));
        assertFalse(AdBlocker.isAdUrl("not a URL"));
        assertFalse(AdBlocker.isAdUrl("file://doubleclick.net/file"));
        assertFalse(AdBlocker.isAdUrl("javascript:alert(1)"));
    }

    @Test public void onlyInterceptsAdSubresourcesInTheNetworkCallback() {
        assertTrue(AdBlocker.shouldBlockSubresource("https://ad.doubleclick.net/popup", false));
        assertFalse(AdBlocker.shouldBlockSubresource("https://ad.doubleclick.net/", true));
        assertFalse(AdBlocker.shouldBlockSubresource("https://example.org/image.png", false));
    }
}

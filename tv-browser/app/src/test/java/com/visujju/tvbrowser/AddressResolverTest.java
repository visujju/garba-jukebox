package com.visujju.tvbrowser;

import org.junit.Test;
import static org.junit.Assert.*;

public class AddressResolverTest {
    @Test public void resolvesFullAndBareWebAddresses() {
        assertEquals("https://example.com/hello?q=tv", AddressResolver.resolve("  https://example.com/hello?q=tv  "));
        assertEquals("http://example.com/", AddressResolver.resolve("http://example.com/"));
        assertEquals("https://example.com/watch", AddressResolver.resolve("example.com/watch"));
        assertEquals("https://example.com:8080/", AddressResolver.resolve("example.com:8080/"));
        assertEquals("https://localhost:1234/", AddressResolver.resolve("localhost:1234/"));
        assertEquals("http://192.168.1.1/", AddressResolver.resolve("http://192.168.1.1/"));
        assertEquals("https://[::1]:8080/", AddressResolver.resolve("[::1]:8080/"));
    }

    @Test public void acceptsTheRequestedPvrPlayAddress() {
        String url = "https://dbhnmkjasgbvsdkjbskkvnskjbfckldsnckjbckjnxkjcsknxjvkjxnvcxknvku.pvrplay.fun/";
        assertEquals(url, AddressResolver.resolve(url));
        assertTrue(AddressResolver.isWebUrl(url));
    }

    @Test public void internationalHostnamesUseIdn() {
        assertEquals("https://xn--bcher-kva.de/", AddressResolver.resolve("bücher.de/"));
    }

    @Test public void searchesTextInsteadOfSendingItToArbitrarySchemes() {
        assertEquals("https://www.google.com/search?q=live+news", AddressResolver.resolve("live news"));
        assertEquals("https://www.google.com/search?q=weather", AddressResolver.resolve("weather"));
        assertEquals("https://www.google.com/search?q=cats+%26+dogs", AddressResolver.resolve("cats & dogs"));
    }

    @Test public void rejectsUnsafeSchemesCredentialsAndMalformedAddresses() {
        assertNull(AddressResolver.resolve("file:///sdcard/private.txt"));
        assertNull(AddressResolver.resolve("content://secret/file"));
        assertNull(AddressResolver.resolve("intent://app/#Intent;end"));
        assertNull(AddressResolver.resolve("javascript:alert(1)"));
        assertNull(AddressResolver.resolve("data:text/html,hello"));
        assertNull(AddressResolver.resolve("ftp://example.com/file"));
        assertNull(AddressResolver.resolve("https://user:password@example.com/"));
        assertNull(AddressResolver.resolve("http://"));
        assertNull(AddressResolver.resolve("https://example.com:99999/"));
        assertNull(AddressResolver.resolve("https://example.com/white space"));
        assertNull(AddressResolver.resolve(""));
        assertNull(AddressResolver.resolve(null));
    }

    @Test public void onlyWebUrlsCanBeLoadedDirectly() {
        assertTrue(AddressResolver.isWebUrl("https://example.com/"));
        assertTrue(AddressResolver.isWebUrl("http://example.com/"));
        assertFalse(AddressResolver.isWebUrl("file:///secret"));
        assertFalse(AddressResolver.isWebUrl("javascript:alert(1)"));
        assertFalse(AddressResolver.isWebUrl("https://user:secret@example.com"));
        assertFalse(AddressResolver.isWebUrl("example.com"));
        assertFalse(AddressResolver.isWebUrl(null));
    }
}

package com.visujju.tvbrowser;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** A small, offline list of advertising and pop-up hosts, matched by DNS label. */
final class AdBlocker {
    private static final Set<String> HOSTS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "doubleclick.net",
            "googlesyndication.com",
            "googleadservices.com",
            "googletagservices.com",
            "adservice.google.com",
            "adnxs.com",
            "adsrvr.org",
            "adform.net",
            "adsterra.com",
            "adsterra.net",
            "a-ads.com",
            "exoclick.com",
            "exosrv.com",
            "juicyads.com",
            "trafficjunky.net",
            "popads.net",
            "popcash.net",
            "propellerads.com",
            "propellerclick.com",
            "hilltopads.com",
            "hilltopads.net",
            "highcpmgate.com",
            "highperformanceformat.com",
            "effectivegatecpm.com",
            "effectiveratecpm.com",
            "taboola.com",
            "outbrain.com",
            "mgid.com"
    )));

    private AdBlocker() {}

    static boolean isAdUrl(String rawUrl) {
        if (rawUrl == null) return false;
        try {
            URI uri = new URI(rawUrl);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                return false;
            }
            String host = uri.getHost();
            if (host == null) return false;
            host = host.toLowerCase(Locale.ROOT);
            if (host.endsWith(".")) host = host.substring(0, host.length() - 1);
            // Match exact hosts or whole subdomains, never URL substrings or suffix lookalikes.
            while (true) {
                if (HOSTS.contains(host)) return true;
                int dot = host.indexOf('.');
                if (dot < 0) return false;
                host = host.substring(dot + 1);
            }
        } catch (URISyntaxException | IllegalArgumentException ignored) {
            return false;
        }
    }

    static boolean shouldBlockSubresource(String url, boolean mainFrame) {
        // An explicitly entered main-page URL is not intercepted here. Navigations
        // and new windows from pages are checked separately by the WebView client.
        return !mainFrame && isAdUrl(url);
    }
}

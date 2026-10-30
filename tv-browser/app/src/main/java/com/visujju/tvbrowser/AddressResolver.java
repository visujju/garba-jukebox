package com.visujju.tvbrowser;

import java.net.IDN;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.io.UnsupportedEncodingException;
import java.util.Locale;
import java.util.regex.Pattern;

/** Converts user input to a web address without ever allowing an app or file URI. */
final class AddressResolver {
    private static final String SEARCH = "https://www.google.com/search?q=";
    private static final Pattern SCHEME = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.-]*:");

    private AddressResolver() {}

    /** Returns null for a blank or unsupported/malformed address. */
    static String resolve(String raw) {
        if (raw == null) return null;
        String input = raw.trim();
        if (input.isEmpty()) return null;
        String lower = input.toLowerCase(Locale.ROOT);

        if (lower.startsWith("https://") || lower.startsWith("http://")) {
            return canonicalWebUrl(input);
        }

        boolean addressWithPort = looksLikeAddress(input) && hasNumericPort(input);
        if (SCHEME.matcher(input).find() && !addressWithPort) {
            // In particular: never load file:, content:, intent:, data:, or javascript:.
            return null;
        }
        if (!containsWhitespace(input) && looksLikeAddress(input)) {
            return canonicalWebUrl("https://" + input);
        }
        try {
            return SEARCH + URLEncoder.encode(input, "UTF-8");
        } catch (UnsupportedEncodingException impossible) {
            return null; // UTF-8 is required by Android.
        }
    }

    static boolean isWebUrl(String url) {
        return canonicalWebUrl(url) != null;
    }

    private static String canonicalWebUrl(String value) {
        if (value == null || containsWhitespace(value)) return null;
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                return null;
            }
            String authority = uri.getRawAuthority();
            if (authority == null || authority.isEmpty() || authority.indexOf('@') >= 0) return null;
            if (uri.getPort() > 65535) return null;
            if (uri.getHost() != null && !uri.getHost().isEmpty()) return uri.toASCIIString();

            // java.net.URI does not recognize Unicode hostnames; convert only the host to IDN.
            int colon = authority.lastIndexOf(':');
            String host = authority;
            String port = "";
            if (colon >= 0) {
                if (authority.startsWith("[")) return null; // Valid IPv6 already has getHost().
                port = authority.substring(colon + 1);
                host = authority.substring(0, colon);
                if (!port.matches("[0-9]{1,5}") || Integer.parseInt(port) > 65535) return null;
                port = ":" + port;
            }
            if (host.isEmpty()) return null;
            String asciiHost = IDN.toASCII(host, IDN.USE_STD3_ASCII_RULES);
            StringBuilder result = new StringBuilder(scheme).append("://").append(asciiHost).append(port);
            if (uri.getRawPath() != null) result.append(uri.getRawPath());
            if (uri.getRawQuery() != null) result.append('?').append(uri.getRawQuery());
            if (uri.getRawFragment() != null) result.append('#').append(uri.getRawFragment());
            URI asciiUri = new URI(result.toString());
            return asciiUri.getHost() == null ? null : asciiUri.toASCIIString();
        } catch (IllegalArgumentException | URISyntaxException ignored) {
            return null;
        }
    }

    private static boolean containsWhitespace(String value) {
        for (int i = 0; i < value.length(); i++) {
            if (Character.isWhitespace(value.charAt(i))) return true;
        }
        return false;
    }

    private static String authorityPart(String value) {
        int end = value.length();
        for (char separator : new char[]{'/', '?', '#'}) {
            int position = value.indexOf(separator);
            if (position >= 0) end = Math.min(end, position);
        }
        return value.substring(0, end);
    }

    private static boolean hasNumericPort(String value) {
        String authority = authorityPart(value);
        int colon = authority.lastIndexOf(':');
        return colon >= 0 && authority.substring(colon + 1).matches("[0-9]{1,5}");
    }

    private static boolean looksLikeAddress(String value) {
        if (containsWhitespace(value)) return false;
        String host = authorityPart(value);
        if (host.startsWith("[")) {
            int closing = host.indexOf(']');
            return closing > 1 && (closing == host.length() - 1 ||
                    host.substring(closing + 1).matches(":\\d{1,5}"));
        }
        int colon = host.lastIndexOf(':');
        if (colon >= 0) {
            if (!host.substring(colon + 1).matches("[0-9]{1,5}")) return false;
            host = host.substring(0, colon);
        }
        return host.equalsIgnoreCase("localhost") || (host.contains(".") && !host.startsWith(".") && !host.endsWith("."));
    }
}

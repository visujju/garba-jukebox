package com.visujju.tvbrowser;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Validation and filename rules for untrusted website download requests. */
final class DownloadPolicy {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final int MAX_NAME = 100;

    private DownloadPolicy() {}

    static String webUrl(String value) {
        // Only an explicit HTTP(S) URL is allowed. Do not turn text into a search.
        return AddressResolver.isWebUrl(value) ? AddressResolver.resolve(value) : null;
    }

    static String origin(String normalizedUrl) {
        try {
            String checkedUrl = webUrl(normalizedUrl);
            if (checkedUrl == null) return null;
            URI uri = new URI(checkedUrl);
            if (uri.getRawAuthority() == null) return null;
            return uri.getScheme().toLowerCase(Locale.ROOT) + "://" + uri.getRawAuthority();
        } catch (URISyntaxException | IllegalArgumentException | NullPointerException ignored) {
            return null;
        }
    }

    static String mimeType(String value) {
        if (value == null) return null;
        String type = value.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return type.matches("[a-z0-9!#$&^_.+\\-]+/[a-z0-9!#$&^_.+\\-]+") ? type : null;
    }

    static boolean isApk(String name, String mimeType) {
        String normalizedMime = mimeType(mimeType);
        return (name != null && name.toLowerCase(Locale.ROOT).endsWith(".apk"))
                || APK_MIME.equals(normalizedMime);
    }

    static String safeFileName(String guessed, String mimeType) {
        StringBuilder result = new StringBuilder();
        if (guessed != null) {
            for (int i = 0; i < guessed.length(); i++) {
                char c = guessed.charAt(i);
                int type = Character.getType(c);
                // Remove path separators, control/bidi characters and filesystem metacharacters.
                if ("/\\:*?\"<>|".indexOf(c) >= 0 || Character.isISOControl(c)
                        || type == Character.FORMAT || type == Character.SURROGATE) {
                    result.append('_');
                } else {
                    result.append(c);
                }
            }
        }
        String name = result.toString().trim();
        while (name.startsWith(".")) name = name.substring(1);
        while (name.endsWith(".") || name.endsWith(" ")) name = name.substring(0, name.length() - 1);
        if (name.isEmpty()) name = "download";
        if (APK_MIME.equals(mimeType(mimeType)) && !name.toLowerCase(Locale.ROOT).endsWith(".apk")) {
            name += ".apk";
        }
        if (name.length() > MAX_NAME) {
            int dot = name.lastIndexOf('.');
            String extension = dot > 0 && name.length() - dot <= 20 ? name.substring(dot) : "";
            name = name.substring(0, MAX_NAME - extension.length()) + extension;
        }
        return name;
    }

    static String uniqueName(String safeName, String suffix) {
        int dot = safeName.lastIndexOf('.');
        String extension = dot > 0 && safeName.length() - dot <= 20 ? safeName.substring(dot) : "";
        String base = extension.isEmpty() ? safeName : safeName.substring(0, dot);
        return base + "-" + suffix + extension;
    }
}

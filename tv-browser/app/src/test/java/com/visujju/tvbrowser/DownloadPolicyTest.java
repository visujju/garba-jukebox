package com.visujju.tvbrowser;

import org.junit.Test;
import static org.junit.Assert.*;

public class DownloadPolicyTest {
    @Test public void downloadAddressesMustBeExplicitHttpOrHttps() {
        assertEquals("https://example.com/file.apk?token=abc", DownloadPolicy.webUrl("https://example.com/file.apk?token=abc"));
        assertEquals("http://127.0.0.1:8765/file.bin", DownloadPolicy.webUrl("http://127.0.0.1:8765/file.bin"));
        assertEquals("https://xn--bcher-kva.de/file", DownloadPolicy.webUrl("https://bücher.de/file"));
        assertNull(DownloadPolicy.webUrl("example.com/file"));
        assertNull(DownloadPolicy.webUrl("blob:https://example.com/123"));
        assertNull(DownloadPolicy.webUrl("data:text/plain,hello"));
        assertNull(DownloadPolicy.webUrl("file:///sdcard/private"));
        assertNull(DownloadPolicy.webUrl("content://downloads/private"));
        assertNull(DownloadPolicy.webUrl("javascript:alert(1)"));
        assertNull(DownloadPolicy.webUrl("https://user:password@example.com/file"));
        assertNull(DownloadPolicy.webUrl("https://example.com/file with spaces"));
        assertNull(DownloadPolicy.webUrl(null));
    }

    @Test public void originShowsTheActualInitialHostAndPortWithoutSensitivePaths() {
        assertEquals("https://example.com:8443", DownloadPolicy.origin("https://example.com:8443/file?secret=yes"));
        assertEquals("http://127.0.0.1:8765", DownloadPolicy.origin("http://127.0.0.1:8765/file"));
        assertEquals("https://xn--bcher-kva.de", DownloadPolicy.origin("https://bücher.de/file"));
        assertNull(DownloadPolicy.origin("ftp://example.com/file"));
    }

    @Test public void filenamesCannotEscapeDownloadsOrHideExtensionsWithBidi() {
        assertEquals("_.._secrets.apk", DownloadPolicy.safeFileName("/../secrets.apk", null));
        assertEquals("photo_gpj.apk", DownloadPolicy.safeFileName("photo\u202Egpj.apk", null));
        assertEquals("safe_name.txt", DownloadPolicy.safeFileName("safe\\name.txt", null));
        assertEquals("download", DownloadPolicy.safeFileName("...", null));
        assertEquals("download", DownloadPolicy.safeFileName(null, null));
        assertEquals("report.pdf.apk", DownloadPolicy.safeFileName("report.pdf", "application/vnd.android.package-archive"));
        String longName = DownloadPolicy.safeFileName("a".repeat(200) + ".apk", null);
        assertTrue(longName.length() <= 100);
        assertTrue(longName.endsWith(".apk"));
        assertEquals("report-12345678.apk", DownloadPolicy.uniqueName("report.apk", "12345678"));
    }

    @Test public void apkChecksAreCaseInsensitiveAndAccountForMimeParameters() {
        assertTrue(DownloadPolicy.isApk("update.APK", "text/plain"));
        assertTrue(DownloadPolicy.isApk("download.bin", "Application/Vnd.Android.Package-Archive; charset=UTF-8"));
        assertFalse(DownloadPolicy.isApk("report.pdf", "application/pdf"));
        assertEquals("application/pdf", DownloadPolicy.mimeType("Application/PDF; charset=UTF-8"));
        assertNull(DownloadPolicy.mimeType("text/plain\r\nX-Injected: value"));
    }
}

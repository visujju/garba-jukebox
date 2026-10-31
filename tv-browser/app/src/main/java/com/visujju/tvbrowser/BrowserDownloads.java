package com.visujju.tvbrowser;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.text.format.Formatter;
import android.webkit.URLUtil;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Downloads are user-confirmed and handled by Android, never by a JavaScript bridge. */
final class BrowserDownloads {
    private static final String IDS_KEY = "download_ids";
    private static final int MAX_TRACKED = 80;
    private static final int STORAGE_PERMISSION_REQUEST = 4203;
    private static final String APK_MIME = "application/vnd.android.package-archive";

    private final Activity activity;
    private final SharedPreferences preferences;
    private AlertDialog confirmation;
    private DownloadRequest awaitingStoragePermission;

    BrowserDownloads(Activity activity, SharedPreferences preferences) {
        this.activity = activity;
        this.preferences = preferences;
    }

    void offer(String url, String userAgent, String contentDisposition, String mimeType,
               long contentLength, boolean blockAds) {
        String normalized = DownloadPolicy.webUrl(url);
        if (normalized == null) {
            toast("Only HTTP and HTTPS downloads are supported.");
            return;
        }
        if (blockAds && AdBlocker.isAdUrl(normalized)) {
            toast("This download was blocked by the ad filter.");
            return;
        }
        if (confirmation != null && confirmation.isShowing()) return;

        String mime = DownloadPolicy.mimeType(mimeType);
        String guessed;
        try {
            guessed = URLUtil.guessFileName(normalized, contentDisposition, mime);
        } catch (RuntimeException ignored) {
            guessed = "download";
        }
        String safeName = DownloadPolicy.safeFileName(guessed, mime);
        String name = DownloadPolicy.uniqueName(safeName, UUID.randomUUID().toString().substring(0, 8));
        DownloadRequest download = new DownloadRequest(normalized, userAgent, name, mime);
        String size = contentLength >= 0 ? Formatter.formatShortFileSize(activity, contentLength) : "Unknown";
        String warning = DownloadPolicy.isApk(name, mime)
                ? "\n\nThis is an app installer (APK). Only install it if you have independently verified its source."
                : "\n\nOnly download files from sources you trust.";
        if (normalized.regionMatches(true, 0, "http://", 0, 7)) {
            warning += "\n\nThis download starts over unencrypted HTTP.";
        }
        String message = "File: " + name + "\nFrom: " + DownloadPolicy.origin(normalized)
                + "\nSize: " + size
                + "\n\nThe website may redirect the download to another source."
                + " Downloads that require sign-in may fail." + warning;
        confirmation = new AlertDialog.Builder(activity)
                .setTitle("Download file?")
                .setMessage(message)
                .setPositiveButton("Download", (dialog, which) -> requestStorageAndStart(download))
                .setNegativeButton("Cancel", null)
                .create();
        confirmation.setOnDismissListener(dialog -> confirmation = null);
        focusCancelByDefault(confirmation);
        confirmation.show();
    }

    private void requestStorageAndStart(DownloadRequest download) {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && activity.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            awaitingStoragePermission = download;
            activity.requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                    STORAGE_PERMISSION_REQUEST);
        } else {
            start(download);
        }
    }

    void onRequestPermissionsResult(int requestCode, int[] grantResults) {
        if (requestCode != STORAGE_PERMISSION_REQUEST) return;
        DownloadRequest request = awaitingStoragePermission;
        awaitingStoragePermission = null;
        if (request == null) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            start(request);
        } else {
            toast("Storage permission is needed on this Android version. Download cancelled.");
        }
    }

    private void start(DownloadRequest download) {
        DownloadManager manager = manager();
        if (manager == null) {
            toast("Android's Download Manager isn't available on this device.");
            return;
        }
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(download.url));
            request.setTitle(download.name);
            request.setDescription("TV Browser download");
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, download.name);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (download.mime != null) request.setMimeType(download.mime);
            // Do not forward cookies, referrers or other credentials to DownloadManager:
            // it can follow redirects to a different site.
            if (download.userAgent != null && download.userAgent.length() <= 512
                    && !download.userAgent.contains("\r") && !download.userAgent.contains("\n")) {
                request.addRequestHeader("User-Agent", download.userAgent);
            }
            long id = manager.enqueue(request);
            remember(id);
            toast("Download started. Hold Back and choose FILES to check it.");
        } catch (RuntimeException error) {
            // Exception messages can include a private URL, so don't log them.
            toast("Couldn't start the download. Check storage and Android's Download Manager.");
        }
    }

    void showDownloads() {
        DownloadManager manager = manager();
        if (manager == null) {
            toast("Android's Download Manager isn't available on this device.");
            return;
        }
        List<DownloadItem> items;
        try {
            items = query(manager);
        } catch (RuntimeException error) {
            toast("Couldn't read downloads on this device.");
            return;
        }
        AlertDialog.Builder builder = new AlertDialog.Builder(activity).setTitle("Downloads");
        if (items.isEmpty()) {
            builder.setMessage("No browser downloads yet. Files you download will also be in the TV's Downloads folder.");
        } else {
            String[] labels = new String[items.size()];
            for (int i = 0; i < items.size(); i++) {
                DownloadItem item = items.get(i);
                labels[i] = item.name + "\n" + status(item);
            }
            builder.setItems(labels, (dialog, which) -> showActions(items.get(which)));
            builder.setNeutralButton("Refresh", (dialog, which) -> showDownloads());
        }
        builder.setNegativeButton("Close", null).show();
    }

    private void showActions(DownloadItem item) {
        boolean complete = item.status == DownloadManager.STATUS_SUCCESSFUL;
        boolean failed = item.status == DownloadManager.STATUS_FAILED;
        String message = status(item);
        if (complete) {
            message += "\n\nSaved in the TV's Downloads folder.";
            message += DownloadPolicy.isApk(item.name, item.mime)
                    ? "\n\nOnly open this APK if you have independently verified its source."
                    : "\n\nOnly open files from sources you trust.";
        }
        AlertDialog.Builder builder = new AlertDialog.Builder(activity)
                .setTitle(item.name).setMessage(message)
                .setNegativeButton("Back", (dialog, which) -> showDownloads());
        if (complete) {
            builder.setPositiveButton("Open", (dialog, which) -> open(item));
            builder.setNeutralButton("Delete file", (dialog, which) -> confirmRemove(item, true));
        } else if (failed) {
            builder.setPositiveButton("Refresh", (dialog, which) -> showDownloads());
            builder.setNeutralButton("Remove", (dialog, which) -> confirmRemove(item, false));
        } else {
            builder.setPositiveButton("Refresh", (dialog, which) -> showDownloads());
            builder.setNeutralButton("Cancel download", (dialog, which) -> confirmRemove(item, false));
        }
        AlertDialog dialog = builder.create();
        focusCancelByDefault(dialog);
        dialog.show();
    }

    private void confirmRemove(DownloadItem item, boolean complete) {
        String message = complete
                ? "Permanently delete this file from Downloads?"
                : "Remove this download and any partially downloaded file?";
        AlertDialog dialog = new AlertDialog.Builder(activity).setTitle("Remove download?")
                .setMessage(message)
                .setPositiveButton("Remove", (ignored, which) -> {
                    try {
                        DownloadManager manager = manager();
                        if (manager == null) throw new IllegalStateException();
                        manager.remove(item.id);
                        forget(item.id);
                        toast("Download removed.");
                    } catch (RuntimeException error) {
                        toast("Couldn't remove this download.");
                    }
                    showDownloads();
                })
                .setNegativeButton("Keep", (ignored, which) -> showDownloads())
                .create();
        focusCancelByDefault(dialog);
        dialog.show();
    }

    private void open(DownloadItem item) {
        DownloadManager manager = manager();
        if (manager == null) {
            toast("Android's Download Manager isn't available on this device.");
            return;
        }
        boolean apk = DownloadPolicy.isApk(item.name, item.mime);
        if (apk && !activity.getPackageManager().canRequestPackageInstalls()) {
            AlertDialog dialog = new AlertDialog.Builder(activity).setTitle("Allow app installation?")
                    .setMessage("Android requires permission before TV Browser can open an APK. "
                            + "Only allow this for a file whose source you trust. Return to FILES "
                            + "and open the file again, then turn the permission off after installing.")
                    .setPositiveButton("Open settings", (ignored, which) -> openInstallSettings())
                    .setNegativeButton("Cancel", null).create();
            focusCancelByDefault(dialog);
            dialog.show();
            return;
        }
        try {
            Uri uri = manager.getUriForDownloadedFile(item.id);
            if (uri == null) {
                toast("This file is no longer available. Check the Downloads folder.");
                return;
            }
            String mime = DownloadPolicy.mimeType(manager.getMimeTypeForDownloadedFile(item.id));
            if (apk) mime = APK_MIME;
            if (mime == null) mime = "*/*";
            Intent intent = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, mime)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(intent);
        } catch (RuntimeException error) {
            toast("No app could open this file. Try a file manager in Downloads.");
        }
    }

    private void openInstallSettings() {
        try {
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName())));
        } catch (RuntimeException error) {
            toast("Open TV settings or use a trusted file manager to install the file.");
        }
    }

    private DownloadManager manager() {
        return (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
    }

    private String status(DownloadItem item) {
        switch (item.status) {
            case DownloadManager.STATUS_SUCCESSFUL: return "Complete";
            case DownloadManager.STATUS_FAILED:
                if (item.reason == DownloadManager.ERROR_INSUFFICIENT_SPACE) return "Failed: not enough storage";
                if (item.reason == DownloadManager.ERROR_DEVICE_NOT_FOUND) return "Failed: storage unavailable";
                if (item.reason == 401 || item.reason == 403) return "Failed: the site denied access or requires sign-in";
                return "Failed. Check the connection or try again from the website.";
            case DownloadManager.STATUS_PAUSED: return "Paused. Select Refresh to check again.";
            case DownloadManager.STATUS_RUNNING:
                if (item.totalBytes > 0) {
                    int percent = (int) Math.min(100, Math.max(0, item.bytes * 100.0 / item.totalBytes));
                    return "Downloading: " + percent + "%";
                }
                return "Downloading";
            default: return "Waiting to download";
        }
    }

    private List<DownloadItem> query(DownloadManager manager) {
        List<Long> ids = readIds();
        List<DownloadItem> result = new ArrayList<>();
        if (ids.isEmpty()) return result;
        long[] values = new long[ids.size()];
        for (int i = 0; i < ids.size(); i++) values[i] = ids.get(i);
        Map<Long, DownloadItem> byId = new HashMap<>();
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(values))) {
            if (cursor == null) return result;
            int idCol = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_ID);
            int nameCol = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TITLE);
            int statusCol = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS);
            int reasonCol = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON);
            int bytesCol = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
            int totalCol = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
            int mimeCol = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_MEDIA_TYPE);
            while (cursor.moveToNext()) {
                long id = cursor.getLong(idCol);
                String name = cursor.getString(nameCol);
                byId.put(id, new DownloadItem(id, name == null ? "Download" : name,
                        cursor.getString(mimeCol), cursor.getInt(statusCol), cursor.getInt(reasonCol),
                        cursor.getLong(bytesCol), cursor.getLong(totalCol)));
            }
        }
        for (Long id : ids) if (byId.containsKey(id)) result.add(byId.get(id));
        return result;
    }

    private List<Long> readIds() {
        List<Long> ids = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(preferences.getString(IDS_KEY, "[]"));
            for (int i = 0; i < array.length() && ids.size() < MAX_TRACKED; i++) {
                long id = array.optLong(i, -1);
                if (id >= 0 && !ids.contains(id)) ids.add(id);
            }
        } catch (JSONException ignored) {
            // Corrupt preferences must not stop the browser from opening.
        }
        return ids;
    }

    private void remember(long id) {
        List<Long> ids = readIds();
        ids.remove(id);
        ids.add(0, id);
        writeIds(ids);
    }

    private void forget(long id) {
        List<Long> ids = readIds();
        ids.remove(id);
        writeIds(ids);
    }

    private void writeIds(List<Long> ids) {
        JSONArray array = new JSONArray();
        for (int i = 0; i < ids.size() && i < MAX_TRACKED; i++) array.put(ids.get(i));
        preferences.edit().putString(IDS_KEY, array.toString()).apply();
    }

    private void focusCancelByDefault(AlertDialog dialog) {
        dialog.setOnShowListener(ignored -> {
            if (dialog.getButton(DialogInterface.BUTTON_NEGATIVE) != null) {
                dialog.getButton(DialogInterface.BUTTON_NEGATIVE).requestFocus();
            }
        });
    }

    void destroy() {
        awaitingStoragePermission = null;
        if (confirmation != null) confirmation.dismiss();
    }

    private void toast(String message) {
        Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
    }

    private static final class DownloadRequest {
        final String url;
        final String userAgent;
        final String name;
        final String mime;
        DownloadRequest(String url, String userAgent, String name, String mime) {
            this.url = url;
            this.userAgent = userAgent;
            this.name = name;
            this.mime = mime;
        }
    }

    private static final class DownloadItem {
        final long id;
        final String name;
        final String mime;
        final int status;
        final int reason;
        final long bytes;
        final long totalBytes;
        DownloadItem(long id, String name, String mime, int status, int reason, long bytes, long totalBytes) {
            this.id = id;
            this.name = name;
            this.mime = mime;
            this.status = status;
            this.reason = reason;
            this.bytes = bytes;
            this.totalBytes = totalBytes;
        }
    }
}

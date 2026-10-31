package com.visujju.tvbrowser;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.text.InputType;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebViewDatabase;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** A standalone, remote-first WebView browser. No JavaScript bridge is exposed to pages. */
public final class MainActivity extends Activity {
    private static final int INK = Color.rgb(9, 16, 31);
    private static final int PANEL = Color.rgb(17, 29, 46);
    private static final int SURFACE = Color.rgb(29, 43, 63);
    private static final int TEXT = Color.rgb(242, 248, 248);
    private static final int MUTED = Color.rgb(157, 181, 192);
    private static final int ACCENT = Color.rgb(126, 240, 205);
    private static final String PREFS = "tv_browser";
    private static final String SAVED_KEY = "saved_pages";
    private static final String HOME_URL = "about:blank";
    private static final long HOLD_BACK_MS = 650;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private LinearLayout shell;
    private LinearLayout header;
    private LinearLayout toolbar;
    private LinearLayout footer;
    private FrameLayout viewport;
    private LinearLayout.LayoutParams viewportParams;
    private WebView webView;
    private View homePanel;
    private View errorPanel;
    private TextView homeSearch;
    private TextView errorMessage;
    private TextView errorRetry;
    private TextView status;
    private TextView helper;
    private TextView backButton;
    private TextView forwardButton;
    private TextView reloadButton;
    private TextView fullScreenButton;
    private TextView insecureBadge;
    private EditText address;
    private ProgressBar progress;
    private View videoView;
    private TextView videoInsecureBadge;
    private WebChromeClient.CustomViewCallback videoCallback;
    private boolean showingHome = true;
    private boolean chromeVisible = true;
    private boolean insecurePage;
    private boolean clearHistoryWhenBlank;
    private boolean backHeld;
    private boolean upHeldForToolbar;
    private String focusSupportScript;

    private final Runnable holdBackAction = () -> {
        if (isFinishing()) return;
        backHeld = true;
        if (videoView != null) hideFullscreenVideo();
        revealToolbar(false);
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LOW_PROFILE);
        focusSupportScript = loadFocusSupportScript();
        buildInterface();
        configureWebView();
        showHomeUi(true);
    }

    private void buildInterface() {
        root = new FrameLayout(this);
        root.setBackgroundColor(INK);
        setContentView(root);

        shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setPadding(dp(30), dp(17), dp(30), dp(14));
        shell.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{Color.rgb(16, 31, 48), INK, Color.rgb(9, 20, 32)}));
        root.addView(shell, new FrameLayout.LayoutParams(-1, -1));

        header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        shell.addView(header, new LinearLayout.LayoutParams(-1, dp(38)));

        TextView mark = text("◎", 24, INK, true);
        mark.setGravity(Gravity.CENTER);
        mark.setBackground(rounded(ACCENT, 12, 0, 0));
        header.addView(mark, new LinearLayout.LayoutParams(dp(38), dp(38)));
        TextView brand = text("TV BROWSER", 18, TEXT, true);
        LinearLayout.LayoutParams brandParams = new LinearLayout.LayoutParams(-2, -1);
        brandParams.leftMargin = dp(11);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        header.addView(brand, brandParams);
        TextView byline = text("THE WEB, MADE FOR YOUR TV", 10, MUTED, true);
        byline.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        header.addView(byline, new LinearLayout.LayoutParams(0, -1, 1));

        toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams toolbarParams = new LinearLayout.LayoutParams(-1, dp(48));
        toolbarParams.topMargin = dp(14);
        shell.addView(toolbar, toolbarParams);

        backButton = toolbarButton("←", "Back", v -> goBack());
        forwardButton = toolbarButton("→", "Forward", v -> {
            if (webView.canGoForward()) webView.goForward();
        });
        reloadButton = toolbarButton("↻", "Reload page", v -> reload());
        addToolbarItem(toolbar, backButton, 44);
        addToolbarItem(toolbar, forwardButton, 44);
        addToolbarItem(toolbar, reloadButton, 44);

        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextSize(15);
        address.setTextColor(TEXT);
        address.setHintTextColor(MUTED);
        address.setHint("Search or enter a web address");
        address.setPadding(dp(14), 0, dp(14), 0);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO | EditorInfo.IME_FLAG_NO_EXTRACT_UI
                | EditorInfo.IME_FLAG_NO_FULLSCREEN);
        address.setSelectAllOnFocus(true);
        address.setBackground(addressBackground());
        address.setContentDescription("Search or enter a web address");
        address.setOnClickListener(v -> showKeyboard());
        address.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_SEARCH
                    || actionId == EditorInfo.IME_ACTION_DONE
                    || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER
                    && event.getAction() == KeyEvent.ACTION_UP)) {
                submitAddress();
                return true;
            }
            return false;
        });
        LinearLayout.LayoutParams addressParams = new LinearLayout.LayoutParams(0, -1, 1);
        addressParams.rightMargin = dp(7);
        toolbar.addView(address, addressParams);

        addToolbarItem(toolbar, toolbarButton("GO", "Open address or search", v -> submitAddress()), 50);
        fullScreenButton = toolbarButton("FULL", "Return to full-screen page", v -> returnToPage());
        addToolbarItem(toolbar, fullScreenButton, 55);
        addToolbarItem(toolbar, toolbarButton("HOME", "Browser home", v -> goHome()), 60);
        addToolbarItem(toolbar, toolbarButton("SAVE", "Save current page", v -> confirmSavePage()), 58);
        addToolbarItem(toolbar, toolbarButton("SAVED", "Open saved pages", v -> showSavedPages()), 68);
        addToolbarItem(toolbar, toolbarButton("CLEAR", "Clear browsing data", v -> confirmClearData()), 63);

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(ColorStateList.valueOf(ACCENT));
        progress.setProgressBackgroundTintList(ColorStateList.valueOf(SURFACE));
        progress.setVisibility(View.INVISIBLE);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(-1, dp(2));
        progressParams.topMargin = dp(6);
        shell.addView(progress, progressParams);

        viewport = new FrameLayout(this);
        viewport.setBackground(rounded(PANEL, 18, 0, 0));
        viewport.setClipToOutline(true);
        viewportParams = new LinearLayout.LayoutParams(-1, 0, 1);
        viewportParams.topMargin = dp(8);
        shell.addView(viewport, viewportParams);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        viewport.addView(webView, new FrameLayout.LayoutParams(-1, -1));

        // Keep the HTTP warning visible even when the normal browser bar is hidden.
        insecureBadge = createInsecureBadge();
        insecureBadge.setVisibility(View.GONE);
        viewport.addView(insecureBadge, insecureBadgeParams());

        homePanel = buildHomePanel();
        viewport.addView(homePanel, new FrameLayout.LayoutParams(-1, -1));
        errorPanel = buildErrorPanel();
        errorPanel.setVisibility(View.GONE);
        viewport.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));

        footer = new LinearLayout(this);
        footer.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams footerParams = new LinearLayout.LayoutParams(-1, dp(30));
        footerParams.topMargin = dp(3);
        shell.addView(footer, footerParams);
        status = text("READY TO EXPLORE", 10, ACCENT, true);
        footer.addView(status, new LinearLayout.LayoutParams(-2, -1));
        status.setGravity(Gravity.CENTER_VERTICAL);
        helper = text("", 10, MUTED, false);
        helper.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        footer.addView(helper, new LinearLayout.LayoutParams(0, -1, 1));
    }

    private View buildHomePanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.HORIZONTAL);
        panel.setGravity(Gravity.CENTER_VERTICAL);
        panel.setPadding(dp(36), dp(25), dp(36), dp(25));
        panel.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{Color.rgb(22, 44, 60), Color.rgb(15, 27, 43), Color.rgb(13, 24, 39)}));

        LinearLayout introduction = new LinearLayout(this);
        introduction.setOrientation(LinearLayout.VERTICAL);
        introduction.setGravity(Gravity.CENTER_VERTICAL);
        panel.addView(introduction, new LinearLayout.LayoutParams(0, -1, 1.05f));
        TextView eyebrow = text("BROWSE BIGGER", 11, ACCENT, true);
        introduction.addView(eyebrow);
        TextView headline = text("The web,\non your TV.", 35, TEXT, true);
        headline.setLineSpacing(dp(2), 1.0f);
        LinearLayout.LayoutParams headlineParams = new LinearLayout.LayoutParams(-1, -2);
        headlineParams.topMargin = dp(10);
        introduction.addView(headline, headlineParams);
        TextView description = text("Search, discover and visit your favorite sites with your remote.", 14, MUTED, false);
        description.setLineSpacing(dp(3), 1.0f);
        LinearLayout.LayoutParams descriptionParams = new LinearLayout.LayoutParams(-1, -2);
        descriptionParams.topMargin = dp(12);
        descriptionParams.rightMargin = dp(26);
        introduction.addView(description, descriptionParams);
        homeSearch = toolbarButton("SEARCH OR ENTER ADDRESS  →", "Search or enter an address", v -> focusAddress(true));
        homeSearch.setTextSize(12);
        LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(dp(230), dp(46));
        searchParams.topMargin = dp(22);
        introduction.addView(homeSearch, searchParams);

        ScrollView linksScroll = new ScrollView(this);
        linksScroll.setFillViewport(true);
        linksScroll.setVerticalScrollBarEnabled(false);
        linksScroll.setFocusable(false);
        LinearLayout.LayoutParams linksParams = new LinearLayout.LayoutParams(0, -1, 1.0f);
        linksParams.leftMargin = dp(15);
        panel.addView(linksScroll, linksParams);
        LinearLayout quickLinks = new LinearLayout(this);
        quickLinks.setOrientation(LinearLayout.VERTICAL);
        quickLinks.setGravity(Gravity.CENTER_VERTICAL);
        linksScroll.addView(quickLinks, new ScrollView.LayoutParams(-1, -2));
        TextView quickHeading = text("QUICK LINKS", 11, MUTED, true);
        LinearLayout.LayoutParams headingParams = new LinearLayout.LayoutParams(-1, -2);
        headingParams.bottomMargin = dp(10);
        quickLinks.addView(quickHeading, headingParams);
        addQuickLinkRow(quickLinks,
                quickLink("Cinejoy.pk", "Open website", "https://cinejoy.pk/"),
                quickLink("PVRPlay.in", "Open website", "https://pvrplay.in/"));
        addQuickLinkRow(quickLinks,
                quickLink("Netmirror.plus", "Open website", "https://netmirror.plus/"),
                quickLink("Arena.ai", "Open website", "https://arena.ai/"));
        addQuickLinkRow(quickLinks,
                quickLink("Google", "Search the web", "https://www.google.com/"),
                quickLink("YouTube", "Watch and explore", "https://m.youtube.com/"));
        addQuickLinkRow(quickLinks,
                quickLink("Wikipedia", "Learn something new", "https://www.wikipedia.org/"),
                quickLink("DuckDuckGo", "Search the web", "https://duckduckgo.com/"));
        return panel;
    }

    private View quickLink(String title, String subtitle, String url) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(17), dp(10), dp(12), dp(10));
        card.setBackground(cardBackground());
        card.setFocusable(true);
        card.setClickable(true);
        card.setContentDescription(title + ", " + subtitle);
        card.setOnClickListener(v -> openUrl(url));
        TextView name = text(title, 16, TEXT, true);
        card.addView(name, new LinearLayout.LayoutParams(-1, -2));
        TextView detail = text(subtitle, 11, MUTED, false);
        LinearLayout.LayoutParams detailParams = new LinearLayout.LayoutParams(-1, -2);
        detailParams.topMargin = dp(3);
        card.addView(detail, detailParams);
        return card;
    }

    private void addQuickLinkRow(LinearLayout parent, View first, View second) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, dp(65));
        rowParams.bottomMargin = dp(8);
        parent.addView(row, rowParams);
        LinearLayout.LayoutParams firstParams = new LinearLayout.LayoutParams(0, -1, 1);
        firstParams.rightMargin = dp(9);
        row.addView(first, firstParams);
        row.addView(second, new LinearLayout.LayoutParams(0, -1, 1));
    }

    private View buildErrorPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(35), dp(20), dp(35), dp(20));
        panel.setBackgroundColor(PANEL);
        TextView title = text("This page couldn't be opened", 25, TEXT, true);
        title.setGravity(Gravity.CENTER);
        panel.addView(title);
        errorMessage = text("Check the address and internet connection, then try again.", 14, MUTED, false);
        errorMessage.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(-1, -2);
        messageParams.topMargin = dp(12);
        panel.addView(errorMessage, messageParams);
        LinearLayout buttons = new LinearLayout(this);
        buttons.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams buttonRowParams = new LinearLayout.LayoutParams(-2, dp(46));
        buttonRowParams.topMargin = dp(22);
        panel.addView(buttons, buttonRowParams);
        errorRetry = toolbarButton("TRY AGAIN", "Try loading the page again", v -> reload());
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(dp(130), -1);
        retryParams.rightMargin = dp(10);
        buttons.addView(errorRetry, retryParams);
        buttons.addView(toolbarButton("HOME", "Go to browser home", v -> goHome()),
                new LinearLayout.LayoutParams(dp(110), -1));
        return panel;
    }

    private void addToolbarItem(LinearLayout parent, View item, int widthDp) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(widthDp), -1);
        params.rightMargin = dp(7);
        parent.addView(item, params);
    }

    private TextView toolbarButton(String label, String description, View.OnClickListener listener) {
        TextView view = text(label, label.length() <= 1 ? 21 : 11, TEXT, true);
        view.setGravity(Gravity.CENTER);
        view.setFocusable(true);
        view.setClickable(true);
        view.setContentDescription(description);
        view.setBackground(buttonBackground());
        view.setTextColor(new ColorStateList(new int[][]{
                new int[]{android.R.attr.state_focused}, new int[]{}
        }, new int[]{INK, TEXT}));
        view.setOnClickListener(listener);
        return view;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView result = new TextView(this);
        result.setText(value);
        result.setTextSize(size);
        result.setTextColor(color);
        result.setIncludeFontPadding(false);
        if (bold) result.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        return result;
    }

    private GradientDrawable rounded(int color, int radiusDp, int strokeColor, int strokeDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        if (strokeDp > 0) drawable.setStroke(dp(strokeDp), strokeColor);
        return drawable;
    }

    private StateListDrawable buttonBackground() {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_pressed}, rounded(ACCENT, 10, ACCENT, 2));
        states.addState(new int[]{android.R.attr.state_focused}, rounded(ACCENT, 10, Color.WHITE, 2));
        states.addState(new int[]{}, rounded(SURFACE, 10, Color.rgb(50, 68, 85), 1));
        return states;
    }

    private StateListDrawable addressBackground() {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_focused}, rounded(Color.rgb(29, 51, 66), 10, ACCENT, 2));
        states.addState(new int[]{}, rounded(Color.rgb(19, 32, 49), 10, Color.rgb(57, 76, 92), 1));
        return states;
    }

    private StateListDrawable cardBackground() {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_focused}, rounded(Color.rgb(42, 79, 86), 13, ACCENT, 2));
        states.addState(new int[]{}, rounded(Color.rgb(29, 48, 65), 13, Color.rgb(50, 72, 86), 1));
        return states;
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private String loadFocusSupportScript() {
        StringBuilder script = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                getAssets().open("tv_focus.js"), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) script.append(line).append('\n');
            return script.toString();
        } catch (IOException error) {
            Log.w("TVBrowser", "Could not load TV focus support", error);
            return null;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // Most sites require JavaScript; no native JS bridge is exposed.
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(true);
        settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                toast("Downloads aren't available in this version."));

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return blockUnsupported(request.getUrl().toString());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return blockUnsupported(url);
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (HOME_URL.equals(url)) {
                    showHomeUi(false);
                    return;
                }
                if (!AddressResolver.isWebUrl(url)) {
                    view.stopLoading();
                    showError("Only HTTP and HTTPS web addresses can be opened.");
                    return;
                }
                boolean comingFromHome = showingHome;
                showPageUi();
                // Back/forward navigation can bring a page from Home or the toolbar.
                // Don't hide the bar during a redirect if the user is editing it.
                if (comingFromHome || (chromeVisible && !address.hasFocus())) {
                    setBrowserChromeVisible(false);
                    view.requestFocus();
                }
                errorPanel.setVisibility(View.GONE);
                updateAddress(url);
                updateSecurityLabel(url);
                updateNavigation();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (clearHistoryWhenBlank && HOME_URL.equals(url) && HOME_URL.equals(view.getUrl())) {
                    view.clearHistory();
                    clearHistoryWhenBlank = false;
                }
                if (AddressResolver.isWebUrl(url) && url.equals(view.getUrl())) {
                    updateAddress(url);
                    updateSecurityLabel(url);
                    // This script only adds visible focus cues and keyboard access for
                    // non-semantic cards; it never exposes a native bridge to the page.
                    if (focusSupportScript != null) view.evaluateJavascript(focusSupportScript, null);
                }
                updateNavigation();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showError("Check the address and internet connection, then try again.");
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel(); // Never proceed past a certificate error.
                if (error.getUrl() != null && error.getUrl().equals(view.getUrl())) {
                    showError("The secure connection could not be verified. Try another website.");
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(!chromeVisible ? View.GONE
                        : !showingHome && newProgress < 100 ? View.VISIBLE : View.INVISIBLE);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (videoView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                videoView = view;
                videoCallback = callback;
                shell.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                if (insecurePage) {
                    videoInsecureBadge = createInsecureBadge();
                    root.addView(videoInsecureBadge, insecureBadgeParams());
                }
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
                view.requestFocus();
            }

            @Override
            public void onHideCustomView() {
                hideFullscreenVideo();
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny(); // Camera, microphone and protected-media requests are not supported.
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, false, false);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams fileChooserParams) {
                callback.onReceiveValue(null);
                toast("File uploads aren't available in this version.");
                return true;
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                // Open a straightforward user-clicked target=_blank link in this window. Other
                // pop-ups, scripts and separate windows are blocked rather than given a bridge.
                WebView.HitTestResult hit = view.getHitTestResult();
                if (isUserGesture && hit != null && (hit.getType() == WebView.HitTestResult.SRC_ANCHOR_TYPE
                        || hit.getType() == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE)
                        && AddressResolver.isWebUrl(hit.getExtra())) {
                    openUrl(hit.getExtra());
                } else if (isUserGesture) {
                    toast("This website needs a new window, which isn't supported yet.");
                }
                return false;
            }
        });
    }

    private boolean blockUnsupported(String url) {
        if (HOME_URL.equals(url) || AddressResolver.isWebUrl(url)) return false;
        toast("Only HTTP and HTTPS links are supported.");
        return true;
    }

    private void submitAddress() {
        String input = address.getText().toString();
        if (input.trim().isEmpty()) {
            focusAddress(true);
            return;
        }
        String url = AddressResolver.resolve(input);
        if (url == null) {
            toast("Enter a valid web address or search. App and file links aren't supported.");
            return;
        }
        openUrl(url);
    }

    private void openUrl(String url) {
        if (!AddressResolver.isWebUrl(url)) {
            toast("That web address couldn't be opened.");
            return;
        }
        hideKeyboard();
        errorPanel.setVisibility(View.GONE);
        showPageUi();
        setBrowserChromeVisible(false);
        webView.requestFocus();
        updateAddress(url);
        updateSecurityLabel(url);
        webView.loadUrl(url);
    }

    private void showPageUi() {
        showingHome = false;
        homePanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        helper.setText("ARROWS choose an item   •   OK opens   •   BACK returns   •   HOLD BACK for toolbar");
        updateInsecureBadge();
    }

    private void setBrowserChromeVisible(boolean visible) {
        chromeVisible = visible;
        header.setVisibility(visible ? View.VISIBLE : View.GONE);
        toolbar.setVisibility(visible ? View.VISIBLE : View.GONE);
        footer.setVisibility(visible ? View.VISIBLE : View.GONE);
        progress.setVisibility(!visible ? View.GONE
                : !showingHome && webView.getProgress() < 100 ? View.VISIBLE : View.INVISIBLE);
        shell.setPadding(visible ? dp(30) : 0, visible ? dp(17) : 0,
                visible ? dp(30) : 0, visible ? dp(14) : 0);
        viewportParams.topMargin = visible ? dp(8) : 0;
        viewport.setLayoutParams(viewportParams);
        viewport.setClipToOutline(visible);
        if (videoView == null) updateSystemUi();
        updateInsecureBadge();
    }

    private void updateSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(chromeVisible
                ? View.SYSTEM_UI_FLAG_LOW_PROFILE
                : View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private void revealToolbar(boolean openKeyboard) {
        setBrowserChromeVisible(true);
        focusAddress(openKeyboard);
    }

    private void returnToPage() {
        if (showingHome) return;
        hideKeyboard();
        setBrowserChromeVisible(false);
        if (errorPanel.getVisibility() == View.VISIBLE) errorRetry.requestFocus();
        else webView.requestFocus();
    }

    private TextView createInsecureBadge() {
        TextView badge = text("HTTP • NOT ENCRYPTED", 11, Color.rgb(255, 221, 187), true);
        badge.setPadding(dp(11), dp(7), dp(11), dp(7));
        badge.setBackground(rounded(Color.rgb(76, 39, 30), 8, Color.rgb(255, 196, 132), 1));
        return badge;
    }

    private FrameLayout.LayoutParams insecureBadgeParams() {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START);
        params.setMargins(dp(12), dp(12), 0, 0);
        return params;
    }

    private void updateInsecureBadge() {
        if (insecureBadge == null) return;
        boolean show = insecurePage && !showingHome && !chromeVisible
                && errorPanel.getVisibility() != View.VISIBLE;
        insecureBadge.setVisibility(show ? View.VISIBLE : View.GONE);
    }

    private void showHomeUi(boolean focusSearch) {
        showingHome = true;
        insecurePage = false;
        setBrowserChromeVisible(true);
        webView.setVisibility(View.INVISIBLE);
        homePanel.setVisibility(View.VISIBLE);
        errorPanel.setVisibility(View.GONE);
        progress.setVisibility(View.INVISIBLE);
        if (!address.hasFocus()) address.setText("");
        status.setText("READY TO EXPLORE");
        status.setTextColor(ACCENT);
        helper.setText("ON A PAGE: HOLD BACK, OR HOLD UP AT THE TOP, FOR THE TOOLBAR");
        if (focusSearch && homeSearch != null) homeSearch.requestFocus();
        updateNavigation();
    }

    private void goHome() {
        hideKeyboard();
        webView.stopLoading();
        webView.loadUrl(HOME_URL); // Stop page audio/video and make Home part of the session history.
        showHomeUi(true);
    }

    private void reload() {
        if (showingHome) return;
        errorPanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        returnToPage();
        webView.reload();
    }

    private void goBack() {
        if (videoView != null) {
            hideFullscreenVideo();
        } else if (webView.canGoBack()) {
            hideKeyboard();
            errorPanel.setVisibility(View.GONE);
            if (!showingHome) returnToPage();
            webView.goBack();
        } else if (!showingHome) {
            goHome();
        } else {
            new AlertDialog.Builder(this).setTitle("Close TV Browser?")
                    .setMessage("Your saved pages will stay on this TV.")
                    .setPositiveButton("Close", (dialog, which) -> finish())
                    .setNegativeButton("Stay", null).show();
        }
    }

    private void updateNavigation() {
        if (webView == null || backButton == null) return;
        setControlEnabled(backButton, !showingHome || webView.canGoBack());
        setControlEnabled(forwardButton, webView.canGoForward());
        setControlEnabled(reloadButton, !showingHome);
        setControlEnabled(fullScreenButton, !showingHome);
    }

    private void setControlEnabled(View view, boolean enabled) {
        view.setEnabled(enabled);
        view.setAlpha(enabled ? 1f : 0.38f);
    }

    private void updateAddress(String url) {
        if (!address.hasFocus()) address.setText(url);
    }

    private void updateSecurityLabel(String url) {
        insecurePage = url != null && url.toLowerCase(Locale.ROOT).startsWith("http://");
        if (insecurePage) {
            status.setText("HTTP • NOT ENCRYPTED");
            status.setTextColor(Color.rgb(255, 196, 132));
        } else {
            status.setText("HTTPS");
            status.setTextColor(ACCENT);
        }
        updateInsecureBadge();
    }

    private void showError(String message) {
        if (showingHome) return;
        errorMessage.setText(message);
        errorPanel.setVisibility(View.VISIBLE);
        progress.setVisibility(chromeVisible ? View.INVISIBLE : View.GONE);
        updateInsecureBadge();
        errorRetry.requestFocus();
    }

    private void focusAddress(boolean openKeyboard) {
        address.requestFocus();
        if (openKeyboard) showKeyboard();
    }

    private void showKeyboard() {
        InputMethodManager manager = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (manager != null) manager.showSoftInput(address, InputMethodManager.SHOW_IMPLICIT);
    }

    private void hideKeyboard() {
        InputMethodManager manager = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (manager != null) manager.hideSoftInputFromWindow(address.getWindowToken(), 0);
    }

    private boolean keyboardVisible() {
        if (root == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && root.getRootWindowInsets() != null) {
            return root.getRootWindowInsets().isVisible(WindowInsets.Type.ime());
        }
        Rect visible = new Rect();
        root.getWindowVisibleDisplayFrame(visible);
        return root.getRootView().getHeight() - visible.bottom > dp(150);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int key = event.getKeyCode();
        if (key == KeyEvent.KEYCODE_DPAD_UP && upHeldForToolbar) {
            if (event.getAction() == KeyEvent.ACTION_UP) upHeldForToolbar = false;
            return true;
        }
        if (keyboardVisible()) return super.dispatchKeyEvent(event);

        // A held Up at the top of a page is an alternative to holding Back,
        // without stealing ordinary Up presses used to navigate between items.
        if (key == KeyEvent.KEYCODE_DPAD_UP && event.getAction() == KeyEvent.ACTION_DOWN
                && (event.isLongPress() || event.getRepeatCount() >= 4)
                && videoView == null && !showingHome && !chromeVisible
                && errorPanel.getVisibility() != View.VISIBLE && webView.hasFocus()
                && !webView.canScrollVertically(-1)) {
            upHeldForToolbar = true;
            revealToolbar(false);
            return true;
        }

        if (key == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                backHeld = false;
                handler.removeCallbacks(holdBackAction);
                handler.postDelayed(holdBackAction, HOLD_BACK_MS);
            } else if (event.getAction() == KeyEvent.ACTION_DOWN && event.isLongPress() && !backHeld) {
                // Some remotes deliver Android's long-press event before our timer fires.
                handler.removeCallbacks(holdBackAction);
                holdBackAction.run();
            } else if (event.getAction() == KeyEvent.ACTION_UP) {
                handler.removeCallbacks(holdBackAction);
                if (!backHeld && !event.isCanceled()) {
                    if (videoView == null && chromeVisible && !showingHome) returnToPage();
                    else goBack();
                }
                backHeld = false;
            }
            return true;
        }
        if (key == KeyEvent.KEYCODE_MENU) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                if (videoView != null) hideFullscreenVideo();
                revealToolbar(false);
            }
            return true;
        }

        // When the keyboard is closed, arrows leave the address field rather than
        // getting stuck moving its text caret. The IME handles arrows when visible.
        if (address.hasFocus() && videoView == null) {
            if (key == KeyEvent.KEYCODE_DPAD_CENTER) {
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) showKeyboard();
                return true;
            }
            if (key == KeyEvent.KEYCODE_DPAD_DOWN) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    if (showingHome) homeSearch.requestFocus();
                    else returnToPage();
                }
                return true;
            }
            if (key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    View next = address.focusSearch(key == KeyEvent.KEYCODE_DPAD_LEFT
                            ? View.FOCUS_LEFT : View.FOCUS_RIGHT);
                    if (next != null) next.requestFocus();
                }
                return true;
            }
        }

        // Deliver arrows and OK to the page. The focus helper selects nearby
        // items when the website has not handled the key itself.
        return super.dispatchKeyEvent(event);
    }

    private void hideFullscreenVideo() {
        if (videoView == null) return;
        root.removeView(videoView);
        videoView = null;
        if (videoInsecureBadge != null) {
            root.removeView(videoInsecureBadge);
            videoInsecureBadge = null;
        }
        shell.setVisibility(View.VISIBLE);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        updateSystemUi();
        WebChromeClient.CustomViewCallback callback = videoCallback;
        videoCallback = null;
        if (callback != null) callback.onCustomViewHidden();
        if (!showingHome) webView.requestFocus();
    }

    private void confirmSavePage() {
        String url = webView.getUrl();
        if (showingHome || !AddressResolver.isWebUrl(url)) {
            toast("Open a page first, then choose SAVE.");
            return;
        }
        String title = webView.getTitle();
        if (title == null || title.trim().isEmpty()) title = Uri.parse(url).getHost();
        final String pageTitle = title == null ? "Saved page" : title.trim();
        new AlertDialog.Builder(this).setTitle("Save this page?")
                .setMessage("The full address is saved on this TV. Don't save a link containing a password or access code.")
                .setPositiveButton("Save", (dialog, which) -> savePage(pageTitle, url))
                .setNegativeButton("Cancel", null).show();
    }

    private void savePage(String title, String url) {
        List<SavedPage> pages = readSavedPages();
        for (SavedPage page : pages) {
            if (page.url.equals(url)) {
                toast("This page is already saved.");
                return;
            }
        }
        if (pages.size() >= 30) {
            toast("You can save up to 30 pages. Remove saved pages to add more.");
            return;
        }
        pages.add(new SavedPage(title.length() > 100 ? title.substring(0, 100) : title, url));
        JSONArray array = new JSONArray();
        try {
            for (SavedPage page : pages) {
                JSONObject item = new JSONObject();
                item.put("title", page.title);
                item.put("url", page.url);
                array.put(item);
            }
        } catch (JSONException ignored) {
            toast("Couldn't save this page.");
            return;
        }
        getPreferencesFile().edit().putString(SAVED_KEY, array.toString()).apply();
        toast("Page saved on this TV.");
    }

    private List<SavedPage> readSavedPages() {
        List<SavedPage> pages = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(getPreferencesFile().getString(SAVED_KEY, "[]"));
            for (int i = 0; i < array.length() && pages.size() < 30; i++) {
                JSONObject item = array.optJSONObject(i);
                if (item == null) continue;
                String url = item.optString("url", "");
                if (AddressResolver.isWebUrl(url)) {
                    pages.add(new SavedPage(item.optString("title", "Saved page"), url));
                }
            }
        } catch (JSONException ignored) {
            // Corrupt local preferences should not prevent the browser from starting.
        }
        return pages;
    }

    private void showSavedPages() {
        List<SavedPage> pages = readSavedPages();
        if (pages.isEmpty()) {
            new AlertDialog.Builder(this).setTitle("Saved pages")
                    .setMessage("Open a website and choose SAVE to keep it here.")
                    .setPositiveButton("OK", null).show();
            return;
        }
        String[] labels = new String[pages.size()];
        for (int i = 0; i < pages.size(); i++) {
            SavedPage page = pages.get(i);
            String host = Uri.parse(page.url).getHost();
            labels[i] = page.title + "\n" + (host == null ? "Website" : host);
        }
        new AlertDialog.Builder(this).setTitle("Saved pages")
                .setItems(labels, (dialog, which) -> openUrl(pages.get(which).url))
                .setNeutralButton("Remove all", (dialog, which) -> confirmRemoveSavedPages())
                .setNegativeButton("Close", null).show();
    }

    private void confirmRemoveSavedPages() {
        new AlertDialog.Builder(this).setTitle("Remove all saved pages?")
                .setMessage("This cannot be undone.")
                .setPositiveButton("Remove all", (dialog, which) -> {
                    getPreferencesFile().edit().remove(SAVED_KEY).apply();
                    toast("Saved pages removed.");
                }).setNegativeButton("Cancel", null).show();
    }

    private void confirmClearData() {
        new AlertDialog.Builder(this).setTitle("Clear browsing data?")
                .setMessage("Clears cookies, site storage, cache and this session's history. You may be signed out. Saved pages stay on this TV.")
                .setPositiveButton("Clear", (dialog, which) -> clearBrowsingData())
                .setNegativeButton("Cancel", null).show();
    }

    @SuppressWarnings("deprecation")
    private void clearBrowsingData() {
        webView.stopLoading();
        webView.clearCache(true);
        webView.clearFormData();
        webView.clearSslPreferences();
        WebStorage.getInstance().deleteAllData();
        WebViewDatabase.getInstance(this).clearHttpAuthUsernamePassword();
        WebViewDatabase.getInstance(this).clearFormData();
        CookieManager.getInstance().removeAllCookies(value -> {
            CookieManager.getInstance().flush();
            toast("Cookies and browsing data cleared. Saved pages were kept.");
        });
        clearHistoryWhenBlank = true;
        goHome();
        webView.clearHistory();
    }

    private SharedPreferences getPreferencesFile() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private static final class SavedPage {
        final String title;
        final String url;
        SavedPage(String title, String url) {
            this.title = title;
            this.url = url;
        }
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(holdBackAction);
        if (videoView != null) hideFullscreenVideo();
        if (webView != null) {
            webView.stopLoading();
            viewport.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

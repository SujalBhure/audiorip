package com.sujalbhure.audiorip;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.FFmpegSession;
import com.arthenica.ffmpegkit.ReturnCode;

import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {

    private WebView webView;
    private String sharedUrl = null;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!Python.isStarted()) {
            Python.start(new AndroidPlatform(this));
        }
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, 1001);
        }

        // Edge-to-Edge immersive Dark Theme
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(0xFF050608);
        window.setNavigationBarColor(0xFF050608);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setBackgroundColor(0xFF090A0D);
        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("https://www.instagram.com") || url.startsWith("https://instagram.com")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(intent);
                        return true;
                    } catch (Exception ignored) {}
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (sharedUrl != null) {
                    injectSharedUrl(sharedUrl);
                    sharedUrl = null;
                }
            }
        });

        // Register Native JavaScript Bridge
        webView.addJavascriptInterface(new AndroidBridge(this), "Android");

        // Handle incoming share intents (e.g. from YouTube app)
        handleIntent(getIntent());

        // Load local embedded offline UI
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && !text.trim().isEmpty()) {
                sharedUrl = text.trim();
                if (webView != null) {
                    injectSharedUrl(sharedUrl);
                    sharedUrl = null;
                }
            }
        }
    }

    private void injectSharedUrl(final String url) {
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (webView != null) {
                String script = "if (window.handleSharedUrl) { window.handleSharedUrl('" + url.replace("'", "\\'") + "'); }";
                webView.evaluateJavascript(script, null);
            }
        }, 500);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    public class AndroidBridge {
        private final Context context;

        public AndroidBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean isAndroidApp() {
            return true;
        }

        @JavascriptInterface
        public void showToast(final String message) {
            new Handler(Looper.getMainLooper()).post(() ->
                Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
            );
        }

        @JavascriptInterface
        public void vibrate(long ms) {
            try {
                Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createOneShot(Math.min(ms, 150), VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        v.vibrate(Math.min(ms, 150));
                    }
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void copyToClipboard(final String text) {
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) {
                        ClipData clip = ClipData.newPlainText("AudioRip", text);
                        cm.setPrimaryClip(clip);
                        Toast.makeText(context, "Copied to clipboard", Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public String getClipboardText() {
            try {
                ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null && cm.hasPrimaryClip()) {
                    ClipData.Item item = cm.getPrimaryClip().getItemAt(0);
                    CharSequence text = item.getText();
                    return text != null ? text.toString() : "";
                }
            } catch (Exception ignored) {}
            return "";
        }

        @JavascriptInterface
        public void openExternalUrl(final String url) {
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                } catch (Exception e) {
                    Toast.makeText(context, "Could not open link", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void inspectOnDevice(final String url) {
            worker.execute(() -> {
                try {
                    String data = Python.getInstance().getModule("audiorip_native")
                        .callAttr("inspect", url).toString();
                    emit("info", new JSONObject(data));
                } catch (Exception e) {
                    emitError("Could not inspect this link: " + friendlyError(e));
                }
            });
        }

        @JavascriptInterface
        public void inspectManyOnDevice(final String urlsJson) {
            worker.execute(() -> {
                try {
                    String data = Python.getInstance().getModule("audiorip_native")
                        .callAttr("inspect_many", urlsJson).toString();
                    emit("multiInfo", new JSONObject(data));
                } catch (Exception e) {
                    emitError("Could not inspect these links: " + friendlyError(e));
                }
            });
        }

        @JavascriptInterface
        public void convertOnDevice(final String urlsJson, final String bitrate) {
            worker.execute(() -> {
                File workDir = new File(getCacheDir(), "audiorip-downloads");
                try {
                    emitProgress("Extracting & downloading audio streams…", 10);
                    String response = Python.getInstance().getModule("audiorip_native")
                        .callAttr("download", urlsJson, workDir.getAbsolutePath()).toString();
                    JSONArray files = new JSONObject(response).getJSONArray("files");
                    int total = files.length();
                    for (int i = 0; i < total; i++) {
                        JSONObject item = files.getJSONObject(i);
                        String title = item.optString("title", "audio");
                        File input = new File(item.getString("path"));
                        File output = new File(workDir, "converted-" + System.nanoTime() + ".mp3");
                        emitProgress("Encoding " + (i + 1) + "/" + total + " (" + safeBitrate(bitrate) + "kbps MP3)…", 25 + (int) (70.0 * i / total));
                        String command = "-y -i " + quote(input.getAbsolutePath())
                            + " -vn -c:a libmp3lame -b:a " + safeBitrate(bitrate)
                            + "k -map_metadata 0 " + quote(output.getAbsolutePath());
                        FFmpegSession session = FFmpegKit.execute(command);
                        if (!ReturnCode.isSuccess(session.getReturnCode()) || !output.isFile()) {
                            // Fallback in case metadata copying fails on some unusual stream
                            String fallbackCmd = "-y -i " + quote(input.getAbsolutePath())
                                + " -vn -c:a libmp3lame -b:a " + safeBitrate(bitrate)
                                + "k " + quote(output.getAbsolutePath());
                            session = FFmpegKit.execute(fallbackCmd);
                            if (!ReturnCode.isSuccess(session.getReturnCode()) || !output.isFile()) {
                                throw new IllegalStateException("MP3 conversion failed for: " + title);
                            }
                        }
                        saveMp3(output, title + ".mp3");
                        if (input.exists()) input.delete();
                        if (output.exists()) output.delete();
                    }
                    emitProgress("Saved to Music/AudioRip", 100);
                    emit("complete", new JSONObject().put("count", total));
                } catch (Exception e) {
                    emitError("Conversion failed: " + friendlyError(e));
                } finally {
                    File[] remaining = workDir.listFiles();
                    if (remaining != null) for (File file : remaining) file.delete();
                }
            });
        }

        private void saveMp3(File source, String filename) throws Exception {
            filename = filename.replaceAll("[\\\\/:*?\"<>|]", "_");
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                File musicDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "AudioRip");
                if (!musicDir.exists() && !musicDir.mkdirs()) throw new IllegalStateException("Could not create Music/AudioRip");
                File destination = new File(musicDir, filename);
                try (InputStream in = new FileInputStream(source); OutputStream out = new FileOutputStream(destination)) {
                    byte[] buffer = new byte[64 * 1024];
                    for (int read; (read = in.read(buffer)) != -1;) out.write(buffer, 0, read);
                }
                MediaScannerConnection.scanFile(context, new String[]{destination.getAbsolutePath()}, new String[]{"audio/mpeg"}, null);
                return;
            }
            ContentValues values = new ContentValues();
            values.put(MediaStore.Audio.Media.DISPLAY_NAME, filename);
            values.put(MediaStore.Audio.Media.MIME_TYPE, "audio/mpeg");
            values.put(MediaStore.Audio.Media.RELATIVE_PATH, "Music/AudioRip");
            values.put(MediaStore.Audio.Media.IS_PENDING, 1);
            Uri uri = getContentResolver().insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("Could not create the music file");
            try (InputStream in = new FileInputStream(source); OutputStream out = getContentResolver().openOutputStream(uri)) {
                byte[] buffer = new byte[64 * 1024];
                for (int read; (read = in.read(buffer)) != -1;) out.write(buffer, 0, read);
            } catch (Exception e) {
                getContentResolver().delete(uri, null, null);
                throw e;
            }
            values.clear();
            values.put(MediaStore.Audio.Media.IS_PENDING, 0);
            getContentResolver().update(uri, values, null, null);
        }

        private String safeBitrate(String value) { return ("128".equals(value) || "192".equals(value) || "320".equals(value)) ? value : "192"; }
        private String quote(String value) { return "'" + value.replace("'", "\\\\'") + "'"; }
        private String friendlyError(Exception e) { String text = e.getMessage(); return (text == null || text.isEmpty()) ? "Please check the link and connection." : text.substring(0, Math.min(220, text.length())); }
        private void emitProgress(String message, int percent) {
            try { emit("progress", new JSONObject().put("message", message).put("percent", percent)); }
            catch (Exception ignored) {}
        }
        private void emitError(String message) {
            try { emit("error", new JSONObject().put("message", message)); }
            catch (Exception ignored) {}
        }
        private void emit(String kind, JSONObject data) {
            try {
                data.put("kind", kind);
                String script = "window.onNativeEvent && window.onNativeEvent(" + JSONObject.quote(data.toString()) + ");";
                new Handler(Looper.getMainLooper()).post(() -> webView.evaluateJavascript(script, null));
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public boolean saveFile(String base64Data, String filename, String subfolder) {
            try {
                byte[] data = Base64.decode(base64Data, Base64.DEFAULT);
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File targetDir = new File(downloadsDir, "AudioRip" + (subfolder != null && !subfolder.isEmpty() ? "/" + subfolder : ""));
                if (!targetDir.exists()) {
                    targetDir.mkdirs();
                }

                File outFile = new File(targetDir, filename);
                FileOutputStream fos = new FileOutputStream(outFile);
                fos.write(data);
                fos.flush();
                fos.close();

                // Broadcast to Android MediaScanner so music apps discover it immediately
                MediaScannerConnection.scanFile(context, new String[]{outFile.getAbsolutePath()}, null, null);

                new Handler(Looper.getMainLooper()).post(() ->
                    Toast.makeText(context, "Saved to Downloads/AudioRip: " + filename, Toast.LENGTH_LONG).show()
                );
                return true;
            } catch (Exception e) {
                new Handler(Looper.getMainLooper()).post(() ->
                    Toast.makeText(context, "Failed to save file: " + e.getMessage(), Toast.LENGTH_LONG).show()
                );
                return false;
            }
        }
    }
}

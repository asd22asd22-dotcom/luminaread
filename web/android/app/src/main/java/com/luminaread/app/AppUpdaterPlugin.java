package com.luminaread.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private void emitProgress(String stage, int percent, String message) {
        JSObject data = new JSObject();
        data.put("stage", stage);
        data.put("percent", percent);
        data.put("message", message);
        notifyListeners("updateProgress", data);
    }

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageManager pm = ctx.getPackageManager();
            PackageInfo pInfo = pm.getPackageInfo(ctx.getPackageName(), 0);
            JSObject ret = new JSObject();
            ret.put("versionName", pInfo.versionName != null ? pInfo.versionName : "1.2.0");
            long vCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? pInfo.getLongVersionCode()
                : pInfo.versionCode;
            ret.put("versionCode", vCode);
            ret.put("packageName", ctx.getPackageName());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("读取应用版本信息失败: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String rawUrl = call.getString("url", "");
        String expectedSha256 = call.getString("sha256", "");
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            call.reject("缺少 APK 下载地址");
            return;
        }
        final String downloadUrl = rawUrl.trim();
        final String cleanExpectedHash = expectedSha256 != null ? expectedSha256.trim().toLowerCase(Locale.ROOT) : "";

        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                emitProgress("downloading", 2, "正在连接更新服务器…");

                URL currentUrl = new URL(downloadUrl);
                int redirects = 0;
                while (redirects < 5) {
                    conn = (HttpURLConnection) currentUrl.openConnection();
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(60000);
                    conn.setInstanceFollowRedirects(false);
                    conn.setRequestProperty("User-Agent", "LuminaRead-Android-Updater/1.2.0");
                    int code = conn.getResponseCode();
                    if (code == HttpURLConnection.HTTP_MOVED_TEMP
                        || code == HttpURLConnection.HTTP_MOVED_PERM
                        || code == 307
                        || code == 308) {
                        String location = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (location == null || location.isEmpty()) {
                            throw new RuntimeException("重定向地址为空");
                        }
                        currentUrl = new URL(currentUrl, location);
                        redirects++;
                        continue;
                    }
                    if (code < 200 || code >= 300) {
                        throw new RuntimeException("下载失败 HTTP " + code);
                    }
                    break;
                }

                long totalBytes = conn.getContentLengthLong();
                File updatesDir = new File(getContext().getCacheDir(), "updates");
                if (!updatesDir.exists() && !updatesDir.mkdirs()) {
                    throw new RuntimeException("无法创建缓存目录");
                }
                File apkFile = new File(updatesDir, "LuminaRead-update.apk");
                if (apkFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    apkFile.delete();
                }

                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                try (InputStream in = new BufferedInputStream(conn.getInputStream());
                     FileOutputStream out = new FileOutputStream(apkFile)) {
                    byte[] buf = new byte[16384];
                    long downloaded = 0;
                    int lastPct = -1;
                    int len;
                    while ((len = in.read(buf)) != -1) {
                        out.write(buf, 0, len);
                        digest.update(buf, 0, len);
                        downloaded += len;
                        if (totalBytes > 0) {
                            int pct = (int) Math.min(92, (downloaded * 90) / totalBytes + 2);
                            if (pct != lastPct) {
                                lastPct = pct;
                                emitProgress("downloading", pct, "正在下载安装包 (" + pct + "%)…");
                            }
                        }
                    }
                    out.flush();
                } finally {
                    conn.disconnect();
                }

                emitProgress("verifying", 95, "正在校验安装包完整性 (SHA-256)…");
                byte[] hashBytes = digest.digest();
                StringBuilder hex = new StringBuilder();
                for (byte b : hashBytes) {
                    hex.append(String.format("%02x", b));
                }
                String actualSha256 = hex.toString();
                if (!cleanExpectedHash.isEmpty() && !cleanExpectedHash.equals(actualSha256)) {
                    throw new RuntimeException("安装包校验失败，SHA-256 不匹配");
                }

                Context ctx = getContext();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !ctx.getPackageManager().canRequestPackageInstalls()) {
                    emitProgress("installing", 98, "请在系统设置中允许安装未知来源应用…");
                    Intent permIntent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + ctx.getPackageName())
                    );
                    permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(permIntent);
                    call.reject("请先在打开的系统页面中开启「允许来自此来源的应用」，完成后返回再次点击「立即更新」");
                    return;
                }

                emitProgress("installing", 100, "正在调起系统安装程序…");
                Uri apkUri = FileProvider.getUriForFile(
                    ctx,
                    ctx.getPackageName() + ".fileprovider",
                    apkFile
                );
                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(installIntent);

                JSObject res = new JSObject();
                res.put("ok", true);
                call.resolve(res);
            } catch (Exception e) {
                emitProgress("error", 0, "更新失败: " + e.getMessage());
                call.reject(e.getMessage(), e);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }

    @PluginMethod
    public void fetchText(PluginCall call) {
        String rawUrl = call.getString("url", "");
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            call.reject("缺少请求地址");
            return;
        }
        final String targetUrl = rawUrl.trim();
        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL currentUrl = new URL(targetUrl);
                int redirects = 0;
                int code = 0;
                while (redirects < 5) {
                    conn = (HttpURLConnection) currentUrl.openConnection();
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(20000);
                    conn.setInstanceFollowRedirects(false);
                    conn.setRequestProperty("User-Agent", "LuminaRead-Android-Updater/1.2.0");
                    conn.setRequestProperty("Accept", "application/json, text/plain, */*");
                    code = conn.getResponseCode();
                    if (code == HttpURLConnection.HTTP_MOVED_TEMP
                        || code == HttpURLConnection.HTTP_MOVED_PERM
                        || code == 307
                        || code == 308) {
                        String location = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (location == null || location.isEmpty()) {
                            throw new RuntimeException("重定向地址为空");
                        }
                        currentUrl = new URL(currentUrl, location);
                        redirects++;
                        continue;
                    }
                    break;
                }

                InputStream stream = (code >= 200 && code < 400)
                    ? conn.getInputStream()
                    : conn.getErrorStream();
                String body = "";
                if (stream != null) {
                    try (InputStream in = new BufferedInputStream(stream);
                         ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) != -1) {
                            baos.write(buf, 0, n);
                        }
                        body = baos.toString(StandardCharsets.UTF_8.name());
                    }
                }
                JSObject res = new JSObject();
                res.put("status", code);
                res.put("body", body);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("网络请求失败: " + e.getMessage(), e);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }
}

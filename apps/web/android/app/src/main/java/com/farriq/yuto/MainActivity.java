package com.farriq.yuto;

import android.os.Bundle;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "YutoRendererGuard";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // why: WebView di perangkat ini berulang mati sendiri (renderer
        // SIGTRAP di libwebviewchromium, tanpa JS error, ~2 menit setelah
        // dibuka, bahkan saat idle). Default Capacitor mengembalikan false
        // dari onRenderProcessGone sehingga crash renderer ikut membunuh
        // seluruh aplikasi (terlempar ke launcher — terlihat seperti
        // "freeze / tidak bisa gerak"). Tangani di sini: muat ulang WebView
        // agar aplikasi pulih sendiri. Aman karena seluruh state persisten
        // (SQLite + localStorage) dan query di-fetch ulang saat mount.
        if (getBridge() != null) {
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(
                        WebView view, RenderProcessGoneDetail detail) {
                    Log.w(TAG, "renderer gone (crashed=" + detail.didCrash()
                            + "), reloading WebView instead of dying");
                    view.post(view::reload);
                    return true;
                }
            });
        }
    }
}

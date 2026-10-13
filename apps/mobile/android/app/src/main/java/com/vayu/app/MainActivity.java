package com.vayu.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The phone's font-size setting would otherwise enlarge every word on top of the app's own sizes and break the
        // layout; the app's text sizes are already set for reading on a phone.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}

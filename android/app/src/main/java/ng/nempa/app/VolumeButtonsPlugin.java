package ng.nempa.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges hardware volume-key presses (captured in MainActivity's
 * dispatchKeyEvent) to the WebView as `volumePress` events:
 *   { direction: "up" | "down", longPress: boolean }
 *
 * The JS side (src/lib/volumeTriggers.ts) turns these into the two
 * emergency gestures: volume-down x5 -> SOS, volume-up long-press -> danger.
 */
@CapacitorPlugin(name = "VolumeButtons")
public class VolumeButtonsPlugin extends Plugin {

    private static VolumeButtonsPlugin instance;
    private boolean enabled = false;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void enable(PluginCall call) {
        enabled = true;
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        enabled = false;
        call.resolve();
    }

    static void emit(String direction, boolean longPress) {
        VolumeButtonsPlugin p = instance;
        if (p == null || !p.enabled) return;
        JSObject data = new JSObject();
        data.put("direction", direction);
        data.put("longPress", longPress);
        p.notifyListeners("volumePress", data);
    }
}

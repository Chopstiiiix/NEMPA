package ng.nempa.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android half of the "SOS was triggered from outside the app" bridge. Mirrors
 * ios/App/App/SosLaunchPlugin.swift and registers under the same JS name, so
 * src/lib/sosLaunch.ts is one implementation across both platforms.
 *
 * The pending trigger lives in SharedPreferences rather than a static field:
 * the trigger frequently arrives while the WebView does not exist yet (screen
 * off, activity destroyed, service still running), and an in-memory flag would
 * be lost exactly when it mattered.
 */
@CapacitorPlugin(name = "SosLaunch")
public class SosLaunchPlugin extends Plugin {

    static final String PREFS = "sparrowtell";
    static final String KEY_PENDING = "pendingSosKind";
    static final String KEY_BG_ENABLED = "backgroundTriggers";

    private static SosLaunchPlugin live;

    @Override
    public void load() {
        live = this;
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Called by the foreground service and the Quick Settings tile. */
    static void deliver(Context ctx, String kind) {
        prefs(ctx).edit().putString(KEY_PENDING, kind).apply();
        if (live != null) {
            JSObject data = new JSObject();
            live.notifyListeners("sosLaunch", data);
        }
    }

    /**
     * Read and clear in one call — the single point of consumption. See the
     * note in sosLaunch.ts: the event carries no payload precisely so that a
     * trigger cannot fire once from the event and again from the next drain.
     */
    @PluginMethod
    public void consumePending(PluginCall call) {
        SharedPreferences p = prefs(getContext());
        String kind = p.getString(KEY_PENDING, "");
        p.edit().remove(KEY_PENDING).apply();
        JSObject ret = new JSObject();
        ret.put("kind", kind == null ? "" : kind);
        call.resolve(ret);
    }

    /**
     * Opt-in background listening. Off by default and deliberately so: the
     * foreground service Android requires means a permanent notification, and
     * on the phone of someone at risk a visible "Sparrowtell is running" is
     * itself a hazard — which is the whole reason the danger flow is silent.
     */
    @PluginMethod
    public void setBackgroundTriggers(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        prefs(getContext()).edit().putBoolean(KEY_BG_ENABLED, enabled).apply();

        Intent intent = new Intent(getContext(), SosForegroundService.class);
        if (enabled) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
        } else {
            getContext().stopService(intent);
        }

        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void isBackgroundEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", prefs(getContext()).getBoolean(KEY_BG_ENABLED, false));
        ret.put("supported", true);
        call.resolve(ret);
    }
}

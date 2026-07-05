package ng.nempa.app;

import android.os.Bundle;
import android.view.KeyEvent;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Volume-up held at least this long counts as the danger long-press. */
    private static final long LONG_PRESS_MS = 1200;

    private boolean upLongFired = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VolumeButtonsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Watch hardware volume keys for the emergency gestures. Events are
     * NOT consumed — normal volume behaviour is preserved; we only observe.
     * Long-press detection uses the repeated ACTION_DOWNs Android delivers
     * while a key is held (eventTime - downTime = hold duration).
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_UP) {
            long held = event.getEventTime() - event.getDownTime();
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (code == KeyEvent.KEYCODE_VOLUME_UP && !upLongFired && held >= LONG_PRESS_MS) {
                    upLongFired = true;
                    VolumeButtonsPlugin.emit("up", true);
                }
            } else if (event.getAction() == KeyEvent.ACTION_UP) {
                if (code == KeyEvent.KEYCODE_VOLUME_UP) {
                    if (!upLongFired && held < LONG_PRESS_MS) {
                        VolumeButtonsPlugin.emit("up", false);
                    }
                    upLongFired = false;
                } else {
                    VolumeButtonsPlugin.emit("down", false);
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }
}

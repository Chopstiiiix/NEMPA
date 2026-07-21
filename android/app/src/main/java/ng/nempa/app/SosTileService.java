package ng.nempa.app;

import android.annotation.TargetApi;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.TileService;

/**
 * Quick Settings tile: one swipe down and a tap raises an SOS, without
 * unlocking or finding the app. Works from the lock screen shade, which is the
 * point — the phone may already be in someone's hand.
 *
 * Still routed through armSos(), so the 5-second cancellable countdown applies
 * exactly as it does everywhere else.
 */
@TargetApi(Build.VERSION_CODES.N)
public class SosTileService extends TileService {

    @Override
    public void onClick() {
        super.onClick();
        SosLaunchPlugin.deliver(this, "sos");

        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        // Unlike the foreground service, a tile tap IS a user interaction, so
        // the platform allows the launch. startActivityAndCollapse also closes
        // the shade; it throws on some OEM builds, hence the fallback.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startActivityAndCollapse(
                        android.app.PendingIntent.getActivity(
                                this, 0, open,
                                android.app.PendingIntent.FLAG_IMMUTABLE
                                        | android.app.PendingIntent.FLAG_UPDATE_CURRENT));
            } else {
                startActivityAndCollapse(open);
            }
        } catch (Exception e) {
            startActivity(open);
        }
    }
}

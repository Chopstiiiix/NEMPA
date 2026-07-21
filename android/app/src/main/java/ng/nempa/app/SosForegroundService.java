package ng.nempa.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.database.ContentObserver;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;

/**
 * Keeps the volume-button emergency gestures working while the app is closed
 * or the screen is off.
 *
 * ⚠️ Why a ContentObserver rather than key events: dispatchKeyEvent in
 * MainActivity only sees keys while that activity is in the foreground. A
 * service cannot intercept hardware keys at all. What it CAN observe is the
 * system volume setting changing, which is what a hardware press does — and
 * that fires with the screen off.
 *
 * ⚠️ The re-centre. At minimum or maximum volume a further press changes
 * nothing, so no notification arrives and the gesture dies exactly when
 * someone is jabbing the button in a panic. After each detected press the
 * volume is nudged back to mid-range, the same trick VolumeButtonsPlugin.swift
 * uses with MPVolumeView on iOS.
 */
public class SosForegroundService extends Service {

    private static final String CHANNEL_ID = "sparrowtell_guard";
    private static final int NOTIFICATION_ID = 4801;

    private static final int RAPID_COUNT = 5;
    private static final long RAPID_WINDOW_MS = 4000;

    private AudioManager audio;
    private ContentObserver observer;
    private int lastVolume = -1;
    private final long[] downTimes = new long[RAPID_COUNT];
    private final long[] upTimes = new long[RAPID_COUNT];
    private int downCount = 0;
    private int upCount = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        lastVolume = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
        startForeground(NOTIFICATION_ID, buildNotification());
        registerObserver();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Restart if the system kills us — the whole point is to still be
        // listening hours after the user last opened the app.
        return START_STICKY;
    }

    private void registerObserver() {
        observer = new ContentObserver(new Handler(Looper.getMainLooper())) {
            @Override
            public void onChange(boolean selfChange) {
                int now = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
                if (now == lastVolume) return;
                boolean down = now < lastVolume;
                lastVolume = now;
                onPress(down);
            }
        };
        getContentResolver().registerContentObserver(
                Settings.System.CONTENT_URI, true, observer);
    }

    private void onPress(boolean isDown) {
        long now = System.currentTimeMillis();
        if (isDown) {
            downCount = record(downTimes, downCount, now);
            if (downCount >= RAPID_COUNT) { downCount = 0; trigger("sos"); }
        } else {
            upCount = record(upTimes, upCount, now);
            if (upCount >= RAPID_COUNT) { upCount = 0; trigger("danger"); }
        }
        recentre();
    }

    /** Sliding window of press timestamps; returns the new count. */
    private int record(long[] times, int count, long now) {
        if (count == times.length) {
            System.arraycopy(times, 1, times, 0, times.length - 1);
            count--;
        }
        times[count++] = now;
        int fresh = 0;
        for (int i = 0; i < count; i++) if (now - times[i] <= RAPID_WINDOW_MS) fresh++;
        if (fresh < count) {
            System.arraycopy(times, count - fresh, times, 0, fresh);
            count = fresh;
        }
        return count;
    }

    /** Keep headroom in both directions so the next press still registers. */
    private void recentre() {
        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        if (lastVolume == 0 || lastVolume == max) {
            int mid = Math.max(1, max / 2);
            try {
                audio.setStreamVolume(AudioManager.STREAM_MUSIC, mid, 0);
                lastVolume = mid;
            } catch (SecurityException ignored) {
                // Do Not Disturb can block volume changes; the gesture still
                // works everywhere except at the extremes.
            }
        }
    }

    private void trigger(String kind) {
        SosLaunchPlugin.deliver(this, kind);

        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        // Android 10+ restricts starting an activity from the background, and
        // there is no exemption for an ordinary foreground service. The launch
        // is attempted because it succeeds on plenty of devices and states,
        // but it CANNOT be relied on — so a high-priority notification is
        // posted alongside it. If the system blocks the launch the user taps
        // that and the pending trigger is drained on start-up. Failing loudly
        // beats an SOS that silently does nothing.
        try {
            startActivity(open);
        } catch (Exception ignored) {
            // Blocked by background-launch policy; the notification covers it.
        }
        notifyTriggered(kind, open);
    }

    private void notifyTriggered(String kind, Intent open) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, flags);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        Notification n = b
                .setContentTitle("danger".equals(kind) ? "Danger alert starting" : "SOS starting")
                .setContentText("Tap to open Sparrowtell and confirm.")
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID + 1, n);
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Emergency triggers", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Keeps the volume-button SOS working while the app is closed.");
            ch.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, flags);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        return b
                .setContentTitle("Emergency triggers active")
                .setContentText("Volume down ×5 for SOS, volume up ×5 for a danger alert.")
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
    }

    @Override
    public void onDestroy() {
        if (observer != null) getContentResolver().unregisterContentObserver(observer);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}

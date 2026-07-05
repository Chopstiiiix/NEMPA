import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ng.nempa.app', // bundle id is frozen (store identity) — brand is Sparrowtell
  appName: 'Sparrowtell',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // FCM via @capacitor-firebase/messaging. presentationOptions controls how
    // notifications appear while the app is in the foreground (iOS + Android 13+).
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_alert',
      iconColor: '#294922',
    },
  },
};

export default config;

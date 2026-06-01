import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ng.nempa.app',
  appName: 'NEMPA',
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
      iconColor: '#E8511A',
    },
  },
};

export default config;

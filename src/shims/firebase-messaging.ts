// Shim for the optional `firebase/messaging` web peer of
// @capacitor-firebase/messaging. Sparrowtell uses push on native only
// (registerPush() no-ops on web), so the Firebase JS SDK is never needed
// on the web build. These exports exist purely to satisfy the plugin's
// web bundle; calling them would only happen on web, which we never do.
const unsupported = (name: string) => () => {
  throw new Error(`firebase/messaging.${name} is not available: Sparrowtell web build does not use FCM web push.`);
};

export const isSupported = async () => false;
export const getMessaging = unsupported('getMessaging');
export const getToken = unsupported('getToken');
export const deleteToken = unsupported('deleteToken');
export const onMessage = unsupported('onMessage');

#import <Capacitor/Capacitor.h>

// Registers the Swift SosLaunchPlugin with the Capacitor runtime under the JS
// name "SosLaunch" (see src/lib/sosLaunch.ts). addListener/removeAllListeners
// come from CAPPlugin itself and need no declaration here.
CAP_PLUGIN(SosLaunchPlugin, "SosLaunch",
  CAP_PLUGIN_METHOD(consumePending, CAPPluginReturnPromise);
)

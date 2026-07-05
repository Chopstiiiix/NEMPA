#import <Capacitor/Capacitor.h>

// Registers the Swift VolumeButtonsPlugin with the Capacitor runtime
// under the JS name "VolumeButtons" (see src/lib/volumeTriggers.ts).
CAP_PLUGIN(VolumeButtonsPlugin, "VolumeButtons",
  CAP_PLUGIN_METHOD(enable, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(disable, CAPPluginReturnPromise);
)

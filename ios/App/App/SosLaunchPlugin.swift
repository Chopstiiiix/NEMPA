import Foundation
import Capacitor

/**
 * Delivers an "SOS was triggered from outside the app" signal into the WebView.
 *
 * Three things feed it: a home-screen quick action, the Siri / Back Tap /
 * Action Button App Intent, and (later) a Control Centre control. All of them
 * can fire while the app is cold, so the trigger has to survive the gap
 * between the app process starting and the WebView being ready to hear about
 * it — hence a stored pending value that JS drains on boot, as well as a live
 * event for when the app is already running.
 *
 * UserDefaults rather than a bare static: if the OS kills us between the
 * trigger and the WebView loading, an in-memory flag is lost and the user's
 * SOS silently does nothing. In an emergency that failure is unacceptable, and
 * the cost of persisting is one small write.
 */
@objc(SosLaunchPlugin)
public class SosLaunchPlugin: CAPPlugin {

    private static let key = "sparrowtell.pendingSosKind"
    private static weak var live: SosLaunchPlugin?

    override public func load() {
        SosLaunchPlugin.live = self
    }

    /// Called by AppDelegate (quick action) and by the App Intent.
    /// `kind` is "sos" or "danger".
    public static func deliver(kind: String) {
        UserDefaults.standard.set(kind, forKey: key)
        // If the WebView is already up, fire immediately — no need to wait for
        // the next consume().
        DispatchQueue.main.async {
            live?.notifyListeners("sosLaunch", data: ["kind": kind])
        }
    }

    /// JS drains this once on boot and on resume. Returns "" when nothing is
    /// pending, and clears the value so a trigger can never fire twice.
    @objc func consumePending(_ call: CAPPluginCall) {
        let kind = UserDefaults.standard.string(forKey: SosLaunchPlugin.key) ?? ""
        UserDefaults.standard.removeObject(forKey: SosLaunchPlugin.key)
        call.resolve(["kind": kind])
    }
}

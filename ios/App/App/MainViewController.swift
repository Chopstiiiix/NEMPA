import UIKit
import WebKit
import Capacitor

/**
 * Grants the WebView permission to capture the microphone.
 *
 * ⚠️ Without this, SOS audio silently records NOTHING on iOS.
 *
 * From iOS 15, WKWebView asks its `WKUIDelegate` before letting page JS reach
 * a camera or microphone. If the delegate does not implement
 * `requestMediaCapturePermissionFor`, WebKit's default is to DENY — and it
 * denies without a prompt, without an error the JS can distinguish, and
 * without anything in the console. `getUserMedia` just rejects.
 *
 * Capacitor 6 does not implement this method, so out of the box every
 * `getUserMedia` call in a Capacitor iOS app fails. That is exactly what
 * happened on the first live SOS test: the location trail logged 13 pings
 * while `sos_audio_segments` stayed empty and `audio_path` stayed null.
 *
 * Granting here is NOT a bypass of the user's consent. It only tells WebKit
 * "this app vouches for its own bundled page". iOS still applies the real
 * microphone permission on top, prompting with NSMicrophoneUsageDescription
 * the first time, and refusing if the user has denied it. The only content
 * that ever loads here is the app's own bundle.
 */
class MainViewController: CAPBridgeViewController {

    // NOT `override`: CAPBridgeViewController conforms to WKUIDelegate but
    // never implements this method, so there is nothing to override. It is a
    // plain conformance method — the controller is already the web view's
    // UIDelegate, so Objective-C dispatch finds this on the subclass.
    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
    }
}

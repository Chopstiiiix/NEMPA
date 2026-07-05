import Foundation
import Capacitor
import AVFoundation
import MediaPlayer
import UIKit

/**
 * Emergency volume-button observer.
 *
 * iOS gives no public API for raw volume-key events, so this watches
 * AVAudioSession.outputVolume (foreground only). Each observed change is
 * emitted to JS as a `volumePress` { direction, longPress:false } event;
 * the JS side (src/lib/volumeTriggers.ts) turns 5 rapid DOWNs into an SOS
 * and 5 rapid UPs into a danger alert (long-press is not observable here —
 * Android handles that gesture natively).
 *
 * After a press lands at the 0.0/1.0 rails the system volume is nudged
 * back to mid-range via a hidden MPVolumeView so further presses keep
 * producing observable changes.
 */
@objc(VolumeButtonsPlugin)
public class VolumeButtonsPlugin: CAPPlugin {

    private var observation: NSKeyValueObservation?
    private var volumeView: MPVolumeView?
    private var resetting = false

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("plugin deallocated"); return }
            let session = AVAudioSession.sharedInstance()
            do {
                try session.setCategory(.ambient, options: .mixWithOthers)
                try session.setActive(true, options: [])
            } catch {
                call.reject("Audio session unavailable: \(error.localizedDescription)")
                return
            }
            if self.volumeView == nil, let host = self.bridge?.viewController?.view {
                let vv = MPVolumeView(frame: CGRect(x: -2000, y: -2000, width: 1, height: 1))
                vv.alpha = 0.0001
                vv.isUserInteractionEnabled = false
                host.addSubview(vv)
                self.volumeView = vv
            }
            self.observation = session.observe(\.outputVolume, options: [.old, .new]) { [weak self] _, change in
                guard let self = self, !self.resetting,
                      let old = change.oldValue, let new = change.newValue, old != new else { return }
                self.notifyListeners("volumePress", data: [
                    "direction": new < old ? "down" : "up",
                    "longPress": false,
                ])
                self.recentre(new)
            }
            call.resolve()
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        observation?.invalidate()
        observation = nil
        call.resolve()
    }

    private func recentre(_ current: Float) {
        guard current <= 0.05 || current >= 0.95 else { return }
        resetting = true
        DispatchQueue.main.async { [weak self] in
            if let slider = self?.volumeView?.subviews.compactMap({ $0 as? UISlider }).first {
                slider.value = 0.5
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self?.resetting = false }
        }
    }
}

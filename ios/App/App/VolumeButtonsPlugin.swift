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
    private var silence: AVAudioPlayer?

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
            // ⚠️ Without this the whole plugin is inert on iOS.
            //
            // outputVolume tracks the MEDIA volume. When no audio is playing,
            // the hardware buttons adjust the RINGER instead — the user sees a
            // volume HUD, media volume never moves, the KVO observer never
            // fires and not one event reaches JS. That is exactly how this
            // shipped: pressing volume-down five times did nothing at all.
            //
            // Playing silence on a loop makes iOS treat the app as an audio
            // client, which routes the buttons to media volume. .ambient with
            // .mixWithOthers keeps it polite: it does not interrupt or duck
            // whatever the user is already listening to, and it does not fight
            // WebKit when getUserMedia later switches the session to record.
            self.startSilence()

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
        silence?.stop()
        silence = nil
        call.resolve()
    }

    /// Loop a silent buffer so the volume keys address media, not the ringer.
    private func startSilence() {
        guard silence == nil else { return }
        do {
            let player = try AVAudioPlayer(data: VolumeButtonsPlugin.silentWav())
            player.numberOfLoops = -1
            player.volume = 0
            player.prepareToPlay()
            player.play()
            silence = player
        } catch {
            // Non-fatal: the observer is still installed, so the gesture keeps
            // working whenever something else happens to be playing audio.
            print("VolumeButtons: silent track failed — \(error.localizedDescription)")
        }
    }

    /// A one-second 8kHz mono PCM WAV of pure zeroes, built in memory so there
    /// is no audio asset to add to the bundle and keep in sync.
    private static func silentWav(seconds: Double = 1.0, sampleRate: Int = 8000) -> Data {
        let samples = Int(Double(sampleRate) * seconds)
        let dataSize = samples * 2                     // 16-bit mono
        func le32(_ v: UInt32) -> Data { withUnsafeBytes(of: v.littleEndian) { Data($0) } }
        func le16(_ v: UInt16) -> Data { withUnsafeBytes(of: v.littleEndian) { Data($0) } }

        var d = Data()
        d.append(contentsOf: Array("RIFF".utf8))
        d.append(le32(UInt32(36 + dataSize)))
        d.append(contentsOf: Array("WAVE".utf8))
        d.append(contentsOf: Array("fmt ".utf8))
        d.append(le32(16))                              // PCM chunk size
        d.append(le16(1))                               // format: PCM
        d.append(le16(1))                               // channels: mono
        d.append(le32(UInt32(sampleRate)))
        d.append(le32(UInt32(sampleRate * 2)))          // byte rate
        d.append(le16(2))                               // block align
        d.append(le16(16))                              // bits per sample
        d.append(contentsOf: Array("data".utf8))
        d.append(le32(UInt32(dataSize)))
        d.append(Data(count: dataSize))                 // silence
        return d
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

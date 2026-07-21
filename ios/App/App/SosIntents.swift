import Foundation
import AppIntents

/**
 * App Intents — one piece of work that unlocks three trigger paths:
 *
 *   · Siri:          "Hey Siri, Sparrowtell SOS"
 *   · Back Tap:      Settings › Accessibility › Touch › Back Tap › Send SOS
 *   · Action Button: iPhone 15 Pro and later, Settings › Action Button › Shortcut
 *
 * All three run the same intent, so there is one behaviour to reason about.
 *
 * Availability: the app's deployment target is iOS 13, AppIntents is iOS 16+.
 * Everything here is gated; on iOS 13–15 the intents simply do not exist and
 * the volume-button triggers remain the only hardware path.
 *
 * ⚠️ `openAppWhenRun = true` is deliberate. Firing an SOS without opening the
 * app would mean re-implementing location capture, contact SMS, audio and the
 * dispatch call in Swift — the whole of sos.ts. Opening the app costs about a
 * second of cold start and keeps one implementation of the emergency flow.
 * Note that on a locked phone iOS may require Face ID before it will open the
 * app, which is an OS rule and not something the app can waive.
 *
 * The 5-second cancellable countdown in sos.ts still applies. That matters
 * most here: Back Tap in particular can fire from a knock against a table, and
 * an un-cancellable trigger would send false alarms to emergency contacts.
 */

@available(iOS 16.0, *)
struct SendSosIntent: AppIntent {
    static var title: LocalizedStringResource = "Send SOS"
    static var description = IntentDescription(
        "Raises a Sparrowtell SOS: notifies responders with your live location, alerts your emergency contacts, and records audio. A five-second countdown lets you cancel."
    )
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        SosLaunchPlugin.deliver(kind: "sos")
        return .result()
    }
}

@available(iOS 16.0, *)
struct SendDangerIntent: AppIntent {
    static var title: LocalizedStringResource = "Send danger alert"
    static var description = IntentDescription(
        "Raises a silent Sparrowtell danger alert: high-priority report to responders with live location and background audio, without the contact SMS."
    )
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        SosLaunchPlugin.deliver(kind: "danger")
        return .result()
    }
}

@available(iOS 16.0, *)
struct SparrowtellShortcuts: AppShortcutsProvider {
    // Every phrase must contain the .applicationName token — Siri rejects the
    // whole provider at build time otherwise. Several phrasings are supplied
    // because someone in trouble will not remember one exact form of words.
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SendSosIntent(),
            phrases: [
                "\(.applicationName) SOS",
                "Send \(.applicationName) SOS",
                "Start \(.applicationName) SOS",
                "\(.applicationName) emergency",
                "Help me \(.applicationName)",
            ],
            shortTitle: "Send SOS",
            systemImageName: "exclamationmark.bubble.fill"
        )
        AppShortcut(
            intent: SendDangerIntent(),
            phrases: [
                "\(.applicationName) danger alert",
                "Send \(.applicationName) danger alert",
                "\(.applicationName) danger",
            ],
            shortTitle: "Danger alert",
            systemImageName: "exclamationmark.triangle.fill"
        )
    }
}

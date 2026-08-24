// FuelCompanionApp.swift — the @main entry point and the object graph it wires.
//
// Responsibilities gathered here:
//   • AppServices — the single container owning AppConfig, HealthKitManager, the
//     WatchConnectivity manager, the network clients, and the sync coordinator.
//     A shared instance exists so the app delegate can register the BGTask at the
//     precise launch moment BGTaskScheduler requires (before the SwiftUI view
//     tree, and thus @StateObjects, exist).
//   • AppDelegate — registers the background task, activates WatchConnectivity,
//     requests notification permission, and routes the watch "log later" handoff
//     to a local notification + a web-app deep link.
//   • FuelCompanionApp — injects the services into the environment and drives a
//     sync on foreground / schedules a background refresh on backgrounding.
//
// The PWA remains the main experience; everything here exists to host it and to
// bridge Apple Health as a third provider alongside Oura and Garmin.

import SwiftUI
import UserNotifications

// MARK: - Service container

@MainActor
final class AppServices: ObservableObject {
    static let shared = AppServices()

    let config = AppConfig()
    let health = HealthKitManager()
    let session = PhoneSessionManager()
    let ingest = IngestClient()
    let today: TodayClient
    let coordinator: HealthSyncCoordinator

    private var didBootstrap = false

    private init() {
        today = TodayClient(watch: session)
        coordinator = HealthSyncCoordinator(health: health, config: config, ingest: ingest, today: today)
    }

    /// One-time wiring: activate WatchConnectivity, install the "log later"
    /// handoff handler, and arm HealthKit auth + background delivery.
    func bootstrap() {
        guard !didBootstrap else { return }
        didBootstrap = true

        session.activate()
        session.onLogLater = { note in
            // Surface the handoff as a local notification and deep-link the PWA.
            LocalNotifications.postLogLater(note: note)
            NotificationCenter.default.post(name: .fuelDeepLinkLogFood, object: nil,
                                            userInfo: note.map { ["note": $0] })
        }

        Task { await coordinator.start() }
    }

    /// Kick a foreground sync (called when the app becomes active).
    func syncForeground() {
        Task { await coordinator.sync(reason: .foreground) }
    }
}

// MARK: - App delegate (launch-time registration)

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Register the background task BEFORE launch completes. The handler runs
        // a full sync cycle via the shared coordinator.
        BackgroundSync.register {
            await AppServices.shared.coordinator.sync(reason: .background)
        }

        UNUserNotificationCenter.current().delegate = self
        LocalNotifications.requestAuthorization()

        // Wire WatchConnectivity + HealthKit on the main actor.
        Task { @MainActor in AppServices.shared.bootstrap() }
        return true
    }

    // Show the "log later" notification even when the app is foregrounded.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    // Tapping the notification deep-links the PWA to the add-food flow.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let note = response.notification.request.content.userInfo["note"] as? String
        NotificationCenter.default.post(name: .fuelDeepLinkLogFood, object: nil,
                                        userInfo: note.map { ["note": $0] })
        completionHandler()
    }
}

// MARK: - Local notifications (the watch "log later" handoff surface)

enum LocalNotifications {
    static func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in
            // A declined prompt is fine; the deep link still works in-app.
        }
    }

    static func postLogLater(note: String?) {
        let content = UNMutableNotificationContent()
        content.title = "Log this later"
        content.body = note?.isEmpty == false ? note! : "Tap to add it to today's log."
        content.sound = .default
        if let note { content.userInfo = ["note": note] }
        let request = UNNotificationRequest(identifier: "logLater-\(UUID().uuidString)",
                                            content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}

// MARK: - @main

@main
struct FuelCompanionApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var services = AppServices.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(services.config)
                .environmentObject(services.health)
                .environmentObject(services.coordinator)
                .environmentObject(services.session)
        }
        .onChange(of: scenePhase) { phase in
            switch phase {
            case .active:
                services.bootstrap()
                services.syncForeground()
            case .background:
                BackgroundSync.schedule()
            default:
                break
            }
        }
    }
}

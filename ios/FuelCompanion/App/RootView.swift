// RootView.swift — the app's top-level shell: a two-tab layout where the PWA is
// primary. "Fuel" hosts the WKWebView (the whole nutrition experience) and
// "Health" is the native Apple Health connection status/settings screen. The
// native side is deliberately the SECOND tab — it bridges Health, it does not
// replace the app.

import SwiftUI

struct RootView: View {
    @EnvironmentObject private var config: AppConfig

    enum Tab: Hashable { case fuel, health }
    @State private var selection: Tab = .fuel

    var body: some View {
        TabView(selection: $selection) {
            WebAppScreen(onOpenSettings: { selection = .health })
                .tabItem { Label("Body Current", systemImage: "fork.knife") }
                .tag(Tab.fuel)

            ConnectionStatusView()
                .tabItem { Label("Health", systemImage: "heart.fill") }
                .tag(Tab.health)
        }
        // A watch "log later" handoff should bring the user to the food-logging
        // flow, which lives in the PWA — switch to the Fuel tab; WebAppScreen
        // handles the actual in-app navigation from the same notification.
        .onReceive(NotificationCenter.default.publisher(for: .fuelDeepLinkLogFood)) { _ in
            selection = .fuel
        }
    }
}

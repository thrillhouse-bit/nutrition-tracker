// WebAppView.swift — hosts the existing React/Vite PWA in a WKWebView. The PWA
// is the MAIN experience; this native target only wraps it and adds the Health
// bridge. We do not reimplement any nutrition UI here.
//
// This file provides three pieces:
//   • `WebViewModel`   — observable load state + a reload/deep-link trigger.
//   • `WebAppView`     — the UIViewRepresentable wrapping WKWebView.
//   • `WebAppScreen`   — a SwiftUI container that renders the web view and, over
//                        it, the graceful "not configured" and "load failed"
//                        states. RootView's Fuel tab shows this.

import SwiftUI
import WebKit

extension Notification.Name {
    /// Posted (by the watch "log later" handoff) to deep-link the web app to the
    /// add-food flow. userInfo may carry a "note" string.
    static let fuelDeepLinkLogFood = Notification.Name("fuelDeepLinkLogFood")
}

@MainActor
final class WebViewModel: ObservableObject {
    @Published var isLoading: Bool = false
    @Published var loadError: String?

    /// Bumped to force the representable to reload (used by the Retry button).
    @Published var reloadToken: Int = 0

    /// A one-shot deep-link fragment the web view should navigate to next
    /// (e.g. "log"); cleared once consumed by the coordinator.
    @Published var pendingFragment: String?

    func reload() {
        loadError = nil
        reloadToken &+= 1
    }

    /// TODO: confirm the PWA's actual add-food route. Many hash-routed SPAs use
    /// something like "#/log" or "#/add"; adjust to match the real app.
    func requestLogFood() {
        pendingFragment = "log"
    }
}

struct WebAppView: UIViewRepresentable {
    let baseURL: URL
    @ObservedObject var model: WebViewModel

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        // A persistent data store keeps the PWA's service worker + localStorage,
        // so it behaves like an installed web app across launches.
        config.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        context.coordinator.webView = webView

        webView.load(URLRequest(url: baseURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Handle an explicit reload request.
        if context.coordinator.lastReloadToken != model.reloadToken {
            context.coordinator.lastReloadToken = model.reloadToken
            webView.load(URLRequest(url: baseURL))
        }
        // Handle a pending deep-link fragment (from the watch handoff). Clear the
        // published flag asynchronously so we never mutate observable state in
        // the middle of a SwiftUI view update.
        if let fragment = model.pendingFragment {
            navigate(webView, to: fragment)
            DispatchQueue.main.async { model.pendingFragment = nil }
        }
    }

    /// Navigate to `baseURL#fragment`. If the SPA is already loaded we set the
    /// hash via JS so client-side routing handles it without a full reload;
    /// otherwise we load the URL directly.
    private func navigate(_ webView: WKWebView, to fragment: String) {
        if webView.url != nil, !webView.isLoading {
            let js = "window.location.hash = '\(fragment)';"
            webView.evaluateJavaScript(js, completionHandler: nil)
        } else {
            var comps = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
            comps?.fragment = fragment
            if let url = comps?.url { webView.load(URLRequest(url: url)) }
        }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        let model: WebViewModel
        weak var webView: WKWebView?
        var lastReloadToken: Int = 0

        init(model: WebViewModel) { self.model = model }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.isLoading = true
            model.loadError = nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.isLoading = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            model.isLoading = false
            model.loadError = error.localizedDescription
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            model.isLoading = false
            // Ignore "Frame load interrupted" style cancellations that happen on
            // rapid re-navigation; surface only real failures.
            let nsError = error as NSError
            if nsError.code == NSURLErrorCancelled { return }
            model.loadError = error.localizedDescription
        }
    }
}

/// The Fuel tab's content: the web app, plus graceful overlays for the two
/// states a bare WKWebView handles poorly — no server configured, and a failed
/// load with a Retry.
struct WebAppScreen: View {
    @EnvironmentObject private var config: AppConfig
    @StateObject private var model = WebViewModel()

    /// Called when the user taps "Open Settings" in the not-configured state, so
    /// RootView can switch to the Health tab where the URL field lives.
    var onOpenSettings: () -> Void = {}

    var body: some View {
        Group {
            if let baseURL = config.baseURL {
                ZStack {
                    WebAppView(baseURL: baseURL, model: model)
                        .ignoresSafeArea(edges: .bottom)

                    if model.isLoading {
                        ProgressView().controlSize(.large)
                    }
                    if let error = model.loadError {
                        loadErrorOverlay(error)
                    }
                }
            } else {
                notConfigured
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .fuelDeepLinkLogFood)) { _ in
            // A watch "log later" handoff arrived: route the web app to add-food.
            model.requestLogFood()
        }
    }

    private func loadErrorOverlay(_ error: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("Couldn't load the app")
                .font(.headline)
            Text(error)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Retry") { model.reload() }
                .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(maxWidth: 320)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .padding()
    }

    private var notConfigured: some View {
        VStack(spacing: 16) {
            Image(systemName: "link")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("No server set")
                .font(.headline)
            Text("Add your app's server URL to load your fueling dashboard.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Open Settings", action: onOpenSettings)
                .buttonStyle(.borderedProminent)
        }
        .padding(24)
    }
}

// AppConfig.swift — the app's small settings surface: WHERE to talk to the
// backend (`baseURL`) and the optional shared `ingestToken`. The URL is a plain
// preference (UserDefaults); the token is a secret (Keychain) and is never
// mirrored into UserDefaults, a plist, or a log.
//
// This is the one place the PWA origin and the API origin are defined — the
// WKWebView loads `baseURL`, and the ingest/today clients POST/GET under it, so
// they can never drift apart.

import Foundation
import Combine

@MainActor
final class AppConfig: ObservableObject {
    /// Base origin of the deployed app: the PWA is loaded from here and every
    /// API path (`/api/apple/ingest`, `/api/today`) is resolved against it.
    @Published private(set) var baseURL: URL?

    /// Whether an ingest token is currently stored. Published so the status UI
    /// can show "token set / not set" WITHOUT ever reading the secret into view
    /// state. The token value itself is fetched on demand via `ingestToken`.
    @Published private(set) var hasToken: Bool = false

    /// Whether the user has opted into writing logged nutrition to Apple
    /// Health (see Health/NutritionWriteBack.swift). Off by default — this is
    /// a plain preference, not a secret, so it lives in UserDefaults like
    /// `baseURL` rather than the keychain.
    @Published var writeBackEnabled: Bool {
        didSet { defaults.set(writeBackEnabled, forKey: Self.writeBackKey) }
    }

    private let defaults: UserDefaults
    private let keychain: Keychain
    private static let baseURLKey = "fuel.baseURL"
    private static let tokenAccount = "ingestToken"
    private static let writeBackKey = "fuel.writeBackEnabled"

    /// A clearly-marked placeholder so the field is never empty in the UI.
    /// TODO: replace with your deployed origin (e.g. https://fuel.yourdomain.com)
    ///       or set it at runtime from the Health tab's Settings section.
    static let placeholderBaseURL = "https://fuel.example.com"

    init(defaults: UserDefaults = .standard, keychain: Keychain = Keychain()) {
        self.defaults = defaults
        self.keychain = keychain
        self.writeBackEnabled = defaults.bool(forKey: Self.writeBackKey)
        if let s = defaults.string(forKey: Self.baseURLKey), let u = URL(string: s) {
            self.baseURL = u
        } else {
            // No stored URL yet: leave nil so the app honestly renders a
            // "not configured" state rather than pretending it can reach a host.
            self.baseURL = nil
        }
        self.hasToken = keychain.get(account: Self.tokenAccount) != nil
    }

    /// The ingest token, read straight from the keychain on demand. Callers pass
    /// it into a request and drop it — it is never held in a published property.
    var ingestToken: String? {
        keychain.get(account: Self.tokenAccount)
    }

    /// Set (or clear, with nil/"") the base origin. Trailing slashes are fine —
    /// paths are appended with URL components, not string concatenation.
    func setBaseURL(_ raw: String?) {
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let trimmed, !trimmed.isEmpty, let url = normalizedURL(trimmed) else {
            baseURL = nil
            defaults.removeObject(forKey: Self.baseURLKey)
            return
        }
        baseURL = url
        defaults.set(url.absoluteString, forKey: Self.baseURLKey)
    }

    /// Store or clear the ingest token. Empty string clears it. Updates
    /// `hasToken` so the UI reflects the change without seeing the value.
    func setIngestToken(_ token: String?) {
        let trimmed = token?.trimmingCharacters(in: .whitespacesAndNewlines)
        keychain.set(trimmed, account: Self.tokenAccount)
        hasToken = (trimmed?.isEmpty == false)
    }

    /// Accept a bare host ("fuel.example.com") by defaulting to https, and
    /// reject anything without a host so we never build requests to nowhere.
    private func normalizedURL(_ raw: String) -> URL? {
        if let u = URL(string: raw), u.scheme != nil, u.host != nil { return u }
        if let u = URL(string: "https://\(raw)"), u.host != nil { return u }
        return nil
    }
}

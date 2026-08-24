// ConnectionStatusView.swift — the native "Apple Health" status screen (the
// Health tab). Its whole job is to be HONEST about the connection:
//
//   • UNAVAILABLE — HealthKit doesn't exist here (iPad / simulator).
//   • GRANTED     — every requested category returned data.
//   • PARTIAL     — some categories present, others "No data — not shared".
//   • NO DATA     — asked, but nothing came back yet.
//   • STALE       — last successful sync > 24h ago.
//   • FAILURE     — the last sync errored; show it and a Retry.
//
// Copy rule (matches HealthKit's privacy model and the backend): we NEVER say a
// category was "denied". Missing data is "No data — not shared". HealthKit hides
// read-authorization, so absence is not refusal.
//
// It also carries the server URL + ingest-token config fields, a "Sync now"
// button, and a "Manage in the Health app" button that hands off to the SYSTEM
// permission UI (we never imitate Apple's permission sheet).

import SwiftUI

struct ConnectionStatusView: View {
    @EnvironmentObject private var health: HealthKitManager
    @EnvironmentObject private var coordinator: HealthSyncCoordinator
    @EnvironmentObject private var config: AppConfig

    @State private var baseURLField: String = ""
    @State private var tokenField: String = ""
    @State private var showTokenSaved = false

    // MARK: - Derived status

    enum Status {
        case unavailable, failure, stale, granted, partial, noData, notConfigured
    }

    private var status: Status {
        if !health.isHealthDataAvailable { return .unavailable }
        if config.baseURL == nil { return .notConfigured }
        if coordinator.lastError != nil { return .failure }
        if coordinator.isStale() { return .stale }
        let available = coordinator.permissions?.available ?? []
        let requested = coordinator.permissions?.requested ?? health.requestedCategories
        if available.isEmpty { return .noData }
        if available.count < requested.count { return .partial }
        return .granted
    }

    var body: some View {
        NavigationStack {
            Form {
                statusSection
                categoriesSection
                actionsSection
                serverSection
                aboutSection
            }
            .navigationTitle("Apple Health")
            .onAppear { baseURLField = config.baseURL?.absoluteString ?? "" }
        }
    }

    // MARK: - Status banner

    private var statusSection: some View {
        Section {
            HStack(spacing: 14) {
                Image(systemName: statusIcon)
                    .font(.system(size: 28))
                    .foregroundStyle(statusTint)
                    .frame(width: 34)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Apple Health")
                        .font(.headline)
                    Text(statusHeadline)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if let sub = statusDetail {
                        Text(sub)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
                if coordinator.isSyncing { ProgressView() }
            }
            .padding(.vertical, 4)

            if status == .failure, let err = coordinator.lastError {
                Label(err, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
        } header: {
            Text("Connection")
        } footer: {
            Text("Last successful refresh: \(lastRefreshText)")
        }
    }

    // MARK: - Per-category list (available vs. "No data — not shared")

    private var categoriesSection: some View {
        Section("Data") {
            if status == .unavailable {
                Text("Apple Health is not available on this device.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(health.requestedCategories, id: \.self) { category in
                    HStack {
                        Text(displayName(category))
                        Spacer()
                        if isAvailable(category) {
                            Label("Shared", systemImage: "checkmark.circle.fill")
                                .labelStyle(.titleAndIcon)
                                .foregroundStyle(.green)
                                .font(.subheadline)
                        } else {
                            // NEVER "denied" — HealthKit hides read-auth, so this
                            // is honestly "no data / not shared", not a refusal.
                            Text("No data — not shared")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                if isContextCategoryPresent {
                    Text("Heart-rate variability and resting heart rate are sent as context to explain and time fueling. They never change your targets.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Actions

    private var actionsSection: some View {
        Section {
            Button {
                Task { await coordinator.sync(reason: .manual) }
            } label: {
                Label("Sync now", systemImage: "arrow.clockwise")
            }
            .disabled(coordinator.isSyncing || status == .unavailable || status == .notConfigured)

            Button {
                openHealthApp()
            } label: {
                Label("Manage in the Health app", systemImage: "heart.text.square")
            }
        } footer: {
            Text("Sharing is managed in Apple's Health app under Sharing → Apps. This app never changes those settings for you.")
        }
    }

    // MARK: - Server configuration

    private var serverSection: some View {
        Section {
            TextField(AppConfig.placeholderBaseURL, text: $baseURLField)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .onSubmit { config.setBaseURL(baseURLField) }

            SecureField(config.hasToken ? "•••••• (token set)" : "Ingest token (optional)",
                        text: $tokenField)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

            Button("Save") {
                config.setBaseURL(baseURLField)
                if !tokenField.isEmpty {
                    config.setIngestToken(tokenField)
                    tokenField = ""
                    showTokenSaved = true
                }
            }

            if config.hasToken {
                Button(role: .destructive) {
                    config.setIngestToken(nil)
                } label: {
                    Text("Clear token")
                }
            }
        } header: {
            Text("Server")
        } footer: {
            Text(config.hasToken
                 ? "A token is stored securely in the keychain and sent only as the x-ingest-token header."
                 : "Leave the token empty if your server runs without APPLE_INGEST_TOKEN.")
        }
    }

    private var aboutSection: some View {
        Section {
            Text("This app reads your workouts, active energy, exercise, sleep, and optional heart-rate context on-device and sends them to your fueling dashboard alongside Oura and Garmin. It reads only — it never writes to Health, records workouts, or reads medical data.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Helpers

    private func isAvailable(_ category: HealthCategory) -> Bool {
        coordinator.permissions?.available.contains(category) ?? false
    }

    private var isContextCategoryPresent: Bool {
        isAvailable(.hrv) || isAvailable(.restingHR)
    }

    private func displayName(_ category: HealthCategory) -> String {
        switch category {
        case .workouts:    return "Workouts"
        case .activeEnergy: return "Active energy"
        case .exercise:    return "Exercise minutes"
        case .sleep:       return "Sleep"
        case .hrv:         return "Heart-rate variability (context)"
        case .restingHR:   return "Resting heart rate (context)"
        case .steps:       return "Steps"
        }
    }

    private var lastRefreshText: String {
        guard let at = coordinator.lastSyncAt else { return "Never" }
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .full
        return f.localizedString(for: at, relativeTo: Date())
    }

    // Status → copy / icon / tint

    private var statusHeadline: String {
        switch status {
        case .unavailable:   return "Not available on this device"
        case .notConfigured: return "Set your server URL to begin"
        case .failure:       return "Last sync failed"
        case .stale:         return "Data may be out of date"
        case .granted:       return "Connected"
        case .partial:       return "Connected — some data not shared"
        case .noData:        return "Connected — no data yet"
        }
    }

    private var statusDetail: String? {
        switch status {
        case .partial:
            let n = coordinator.permissions?.available.count ?? 0
            let total = coordinator.permissions?.requested.count ?? health.requestedCategories.count
            return "\(n) of \(total) categories are sharing data."
        case .stale:
            return "Tap Sync now to refresh."
        case .noData:
            return "Once you have workouts or activity today, they'll appear here."
        default:
            return nil
        }
    }

    private var statusIcon: String {
        switch status {
        case .unavailable:   return "heart.slash"
        case .notConfigured: return "link.badge.plus"
        case .failure:       return "exclamationmark.triangle.fill"
        case .stale:         return "clock.badge.exclamationmark"
        case .granted:       return "checkmark.circle.fill"
        case .partial:       return "circle.lefthalf.filled"
        case .noData:        return "heart.text.square"
        }
    }

    private var statusTint: Color {
        switch status {
        case .granted:                 return .green
        case .partial, .stale, .noData: return .orange
        case .failure:                 return .red
        case .unavailable, .notConfigured: return .secondary
        }
    }

    /// Hand off to the SYSTEM Health app (or Settings) so the user manages
    /// sharing in Apple's own UI. We never imitate the permission sheet.
    private func openHealthApp() {
        // The Health app's URL scheme; falls back to this app's Settings page,
        // from which Health permissions are reachable.
        if let health = URL(string: "x-apple-health://"),
           UIApplication.shared.canOpenURL(health) {
            UIApplication.shared.open(health)
        } else if let settings = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(settings)
        }
    }
}

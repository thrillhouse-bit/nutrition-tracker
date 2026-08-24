// TodayClient.swift — GETs the backend's `/api/today` composite, decodes it as
// the shared `TodayComposite`, and turns it into a glanceable `PlanSummary` via
// the shared `PlanSummaryBuilder`. The result is handed to the phone-side
// WatchConnectivity manager so the watch shows the SAME numbers as the app —
// one source of truth, no re-derived fueling logic on the watch.
//
// Read-only and token-free: `/api/today` is a plain GET (only the ingest POST
// is token-gated), so this client never touches the secret.

import Foundation

struct TodayClient {
    enum TodayError: LocalizedError {
        case notConfigured
        case http(Int)
        case transport(String)

        var errorDescription: String? {
            switch self {
            case .notConfigured: return "Server URL is not set."
            case .http(let s): return "Server returned HTTP \(s) for /api/today."
            case .transport(let m): return m
            }
        }
    }

    var session: URLSession = .shared
    /// The phone-side WCSession manager the built summary is delivered to.
    let watch: PhoneSessionManager

    /// Local YYYY-MM-DD, matching the backend's `localYmd` day grouping.
    static func localYmd(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// Fetch today's composite, build a `PlanSummary`, and push it to the watch.
    /// Returns the summary so callers can also surface it locally if useful.
    @discardableResult
    func refresh(date: String? = nil, baseURL: URL?) async throws -> PlanSummary {
        let composite = try await fetch(date: date, baseURL: baseURL)
        // `signals.workout.demo` is the backend's honest demo flag for the one
        // signal the summary uses; if the workout is demo, label the summary demo
        // so the watch never implies a live sync. TODO: extend if the composite
        // grows a top-level demo flag.
        let isDemo = composite.signals?.workout?.demo ?? false
        let summary = PlanSummaryBuilder.make(from: composite, isDemo: isDemo)
        await watch.send(summary)
        return summary
    }

    func fetch(date: String? = nil, baseURL: URL?) async throws -> TodayComposite {
        guard let baseURL else { throw TodayError.notConfigured }
        var comps = URLComponents(url: baseURL.appendingPathComponent("api/today"),
                                  resolvingAgainstBaseURL: false)
        comps?.queryItems = [URLQueryItem(name: "date", value: date ?? Self.localYmd())]
        guard let url = comps?.url else { throw TodayError.notConfigured }

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw TodayError.transport(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw TodayError.transport("No HTTP response for /api/today.")
        }
        guard (200...299).contains(http.statusCode) else {
            throw TodayError.http(http.statusCode)
        }
        return try FuelJSON.decoder.decode(TodayComposite.self, from: data)
    }
}

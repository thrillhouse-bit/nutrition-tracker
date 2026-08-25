// EntriesClient.swift — GETs the backend's `/api/entries?from=&to=` (the
// user's logged nutrition, joined with each food's per-serving values) for
// the Apple Health WRITE-BACK direction: HealthKitNutritionWriter turns each
// row into a HealthKit Nutrition correlation. Read-only against the server
// (this never logs anything itself) and authenticated the same way
// TodayClient is — the per-user ingest token, since the companion has no
// session cookie.

import Foundation

struct EntriesClient {
    enum EntriesError: LocalizedError {
        case notConfigured
        case http(Int)
        case transport(String)

        var errorDescription: String? {
            switch self {
            case .notConfigured: return "Server URL is not set."
            case .http(let s): return "Server returned HTTP \(s) for /api/entries."
            case .transport(let m): return m
            }
        }
    }

    var session: URLSession = .shared

    /// Fetch entries logged in [from, to) — the same half-open range contract
    /// `/api/entries` already uses (see src/api/client.js `listEntries`).
    func fetch(from: Date, to: Date, baseURL: URL?, token: String?) async throws -> [LoggedEntry] {
        guard let baseURL else { throw EntriesError.notConfigured }
        var comps = URLComponents(url: baseURL.appendingPathComponent("api/entries"),
                                  resolvingAgainstBaseURL: false)
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        comps?.queryItems = [
            URLQueryItem(name: "from", value: iso.string(from: from)),
            URLQueryItem(name: "to", value: iso.string(from: to)),
        ]
        guard let url = comps?.url else { throw EntriesError.notConfigured }

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token, !token.isEmpty {
            req.setValue(token, forHTTPHeaderField: "x-ingest-token")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw EntriesError.transport(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw EntriesError.transport("No HTTP response for /api/entries.")
        }
        guard (200...299).contains(http.statusCode) else {
            throw EntriesError.http(http.statusCode)
        }
        return try FuelJSON.decoder.decode(EntriesResponse.self, from: data).entries
    }
}

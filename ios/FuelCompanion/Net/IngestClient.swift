// IngestClient.swift — POSTs a normalized `IngestPayload` to the backend's
// `/api/apple/ingest` route. Apple Health has no cloud API, so this native app
// is the ONLY path HealthKit data reaches the server (see server/providers.js:
// Apple is "push-in, like a webhook").
//
// Contract (server/index.js):
//   POST {base}/api/apple/ingest
//   header x-ingest-token: {token}   (only when APPLE_INGEST_TOKEN is set)
//   body   IngestPayload (JSON, ISO-8601 dates via FuelJSON.encoder)
//   200 →  IngestResponse
//
// Stateless by design: the resolved base URL and token are passed in per call
// (from AppConfig on the main actor) so the secret is never retained here.

import Foundation

struct IngestClient {
    enum IngestError: LocalizedError {
        case notConfigured
        case unauthorized
        case http(status: Int, body: String)
        case transport(String)

        var errorDescription: String? {
            switch self {
            case .notConfigured:
                return "Server URL is not set."
            case .unauthorized:
                return "The ingest token was rejected (401). Check the token in Settings."
            case .http(let status, let body):
                let extra = body.isEmpty ? "" : " — \(body)"
                return "Server returned HTTP \(status)\(extra)."
            case .transport(let msg):
                return msg
            }
        }
    }

    var session: URLSession = .shared

    /// Send today's samples. `token` is nil when the backend runs without
    /// APPLE_INGEST_TOKEN; when present it rides the `x-ingest-token` header and
    /// nowhere else (never a query param, never logged).
    func post(_ payload: IngestPayload, baseURL: URL?, token: String?) async throws -> IngestResponse {
        guard let baseURL else { throw IngestError.notConfigured }

        let url = baseURL.appendingPathComponent("api/apple/ingest")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token, !token.isEmpty {
            req.setValue(token, forHTTPHeaderField: "x-ingest-token")
        }
        req.httpBody = try FuelJSON.encoder.encode(payload)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw IngestError.transport(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw IngestError.transport("No HTTP response from server.")
        }
        switch http.statusCode {
        case 200...299:
            do {
                return try FuelJSON.decoder.decode(IngestResponse.self, from: data)
            } catch {
                // A 2xx with an unexpected body still counts as delivered; report
                // a decode issue honestly rather than pretending nothing arrived.
                throw IngestError.http(status: http.statusCode,
                                       body: "response could not be decoded")
            }
        case 401:
            throw IngestError.unauthorized
        default:
            let body = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            throw IngestError.http(status: http.statusCode, body: String(body.prefix(200)))
        }
    }
}

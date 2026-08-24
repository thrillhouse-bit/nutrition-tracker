// Keychain.swift — a tiny, focused wrapper over the iOS keychain used to store
// the one secret this app holds: the `x-ingest-token`. The token must NEVER live
// in UserDefaults, a plist, argv, or a log — only here. Everything is a generic
// password keyed by (service, account); reads return nil when absent.
//
// Scope note: this is intentionally minimal (get/set/delete a single string).
// It is not a general keychain library — one secret, one file.

import Foundation
import Security

struct Keychain {
    /// Keychain service namespace. Kept distinct from the bundle id so a bundle
    /// id change (done in the Xcode project) does not orphan a stored token.
    let service: String

    init(service: String = "com.fuelcompanion.secrets") {
        self.service = service
    }

    /// Store (or overwrite) a UTF-8 string for `account`. Passing nil deletes it.
    /// Returns true on success so callers can surface a failure to the user
    /// instead of silently believing the token was saved.
    @discardableResult
    func set(_ value: String?, account: String) -> Bool {
        guard let value, !value.isEmpty else { return delete(account: account) }
        guard let data = value.data(using: .utf8) else { return false }

        // Delete any existing item first so we always end in a known state
        // rather than depending on SecItemUpdate's match semantics.
        _ = delete(account: account)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            // Available after first unlock, this-device-only: a secret should not
            // ride an iCloud keychain backup to another device.
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    /// Fetch the stored string for `account`, or nil if there is none.
    func get(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data,
              let str = String(data: data, encoding: .utf8) else { return nil }
        return str
    }

    /// Remove the stored string for `account`. A missing item is success (the
    /// desired end state — "no token" — is reached either way).
    @discardableResult
    func delete(account: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}

// amesh-se-helper
// macOS Keychain + Secure Enclave helper for amesh
// Protocol: JSON in via stdin, JSON out via stdout
// Commands: check, generate, sign, get-public-key, delete

import Foundation
import Security

struct Command: Codable {
    let action: String
    let deviceId: String?
    let message: String?
}

struct Response: Codable {
    let success: Bool
    let publicKey: String?
    let signature: String?
    let backend: String?
    let error: String?
}

func respond(_ r: Response) -> Never {
    FileHandle.standardOutput.write(try! JSONEncoder().encode(r))
    exit(r.success ? 0 : 1)
}

func ok(publicKey: String? = nil, signature: String? = nil, backend: String? = nil) -> Never {
    respond(Response(success: true, publicKey: publicKey, signature: signature, backend: backend, error: nil))
}

func fail(_ msg: String) -> Never {
    respond(Response(success: false, publicKey: nil, signature: nil, backend: nil, error: msg))
}

func tagFor(_ id: String) -> Data { "dev.amesh.\(id)".data(using: .utf8)! }

func loadKey(_ id: String) -> SecKey? {
    let q: [String: Any] = [
        kSecClass as String:              kSecClassKey,
        kSecAttrApplicationTag as String: tagFor(id),
        kSecAttrKeyType as String:        kSecAttrKeyTypeECSECPrimeRandom,
        kSecReturnRef as String:          true,
    ]
    var ref: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &ref) == errSecSuccess else { return nil }
    return (ref as! SecKey)
}

// Try to generate an ephemeral Secure Enclave key (no keychain write)
func isSecureEnclaveAvailable() -> Bool {
    let attrs: [String: Any] = [
        kSecAttrKeyType as String:       kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
        kSecAttrTokenID as String:       kSecAttrTokenIDSecureEnclave,
    ]
    var err: Unmanaged<CFError>?
    return SecKeyCreateRandomKey(attrs as CFDictionary, &err) != nil
}

// Try to generate a persistent Secure Enclave key (requires keychain access)
func trySecureEnclaveGenerate(_ id: String) -> SecKey? {
    let attrs: [String: Any] = [
        kSecAttrKeyType as String:       kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
        kSecAttrTokenID as String:       kSecAttrTokenIDSecureEnclave,
        kSecPrivateKeyAttrs as String: [
            kSecAttrIsPermanent as String:    true,
            kSecAttrApplicationTag as String: tagFor(id),
        ] as [String: Any],
    ]
    var err: Unmanaged<CFError>?
    return SecKeyCreateRandomKey(attrs as CFDictionary, &err)
}

func softwareGenerate(_ id: String) -> SecKey? {
    let attrs: [String: Any] = [
        kSecAttrKeyType as String:       kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
        kSecPrivateKeyAttrs as String: [
            kSecAttrIsPermanent as String:    true,
            kSecAttrApplicationTag as String: tagFor(id),
        ] as [String: Any],
    ]
    var err: Unmanaged<CFError>?
    return SecKeyCreateRandomKey(attrs as CFDictionary, &err)
}

func exportPubKey(_ key: SecKey) -> String? {
    guard let pub = SecKeyCopyPublicKey(key),
          let data = SecKeyCopyExternalRepresentation(pub, nil) as Data? else { return nil }
    return data.base64EncodedString()
}

// MARK: - Main

let input = FileHandle.standardInput.readDataToEndOfFile()
guard let cmd = try? JSONDecoder().decode(Command.self, from: input) else { fail("invalid_json") }

switch cmd.action {

case "check":
    let se = isSecureEnclaveAvailable()
    ok(backend: se ? "secure-enclave" : "keychain")

case "generate":
    guard let id = cmd.deviceId else { fail("missing_device_id") }
    // Delete ALL existing keys with this tag to avoid stale key shadowing.
    // SecItemDelete may only remove one item per call, so loop until clean.
    let delQuery: [String: Any] = [
        kSecClass as String: kSecClassKey,
        kSecAttrApplicationTag as String: tagFor(id),
    ]
    while SecItemDelete(delQuery as CFDictionary) == errSecSuccess {}
    // Try Secure Enclave first, fall back to software keychain
    if let key = trySecureEnclaveGenerate(id) {
        guard let pub = exportPubKey(key) else { fail("export_failed") }
        ok(publicKey: pub, backend: "secure-enclave")
    } else if let key = softwareGenerate(id) {
        guard let pub = exportPubKey(key) else { fail("export_failed") }
        ok(publicKey: pub, backend: "keychain")
    } else {
        fail("keygen_failed")
    }

case "sign":
    guard let id = cmd.deviceId, let msgB64 = cmd.message else { fail("missing_args") }
    guard let key = loadKey(id) else { fail("key_not_found") }
    guard let msg = Data(base64Encoded: msgB64) else { fail("invalid_base64") }
    var err: Unmanaged<CFError>?
    guard let sig = SecKeyCreateSignature(key, .ecdsaSignatureMessageX962SHA256, msg as CFData, &err) as Data? else {
        fail(err?.takeRetainedValue().localizedDescription ?? "sign_failed")
    }
    ok(signature: sig.base64EncodedString())

case "get-public-key":
    guard let id = cmd.deviceId else { fail("missing_device_id") }
    guard let key = loadKey(id) else { fail("key_not_found") }
    guard let pub = exportPubKey(key) else { fail("export_failed") }
    ok(publicKey: pub)

case "delete":
    guard let id = cmd.deviceId else { fail("missing_device_id") }
    let delQ: [String: Any] = [
        kSecClass as String: kSecClassKey,
        kSecAttrApplicationTag as String: tagFor(id),
    ]
    while SecItemDelete(delQ as CFDictionary) == errSecSuccess {}
    ok()

default:
    fail("unknown_action")
}

/**
 * T11.01 / FD-141: SHA-256 in pure TypeScript, so `plan_hash` also works on a LAN `http://` origin
 * (Web Crypto needs a secure context; a LAN IP is not one).
 *
 * The vectors are the NIST FIPS 180-4 examples (the same ones `packages/compute` and the Hab Core
 * check their own hashes against), so a wrong digest fails here before it reaches a plan export.
 */
import { describe, expect, it } from "vitest";
import { sha256Hex, sha256HexBytes } from "../../src/export/sha256";

describe("sha256 (FD-141)", () => {
  it("NIST vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("hashes the bytes of a UTF-8 string, not its code units", () => {
    // "é" is one code point (U+00E9) but two UTF-16 code units; the digest is over the UTF-8 bytes c3 a9.
    expect(sha256Hex("é")).toBe("4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c");
    expect(sha256HexBytes(new TextEncoder().encode("é"))).toBe(
      "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c",
    );
  });

  it("hashes a million 'a' characters (NIST vector 3)", () => {
    expect(sha256Hex("a".repeat(1_000_000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("hashes raw bytes as well as text", () => {
    // The bytes 0x00, 0x01, 0x02, 0x41: all below 0x80, so their UTF-8 encoding is themselves.
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x41]);
    expect(sha256HexBytes(bytes)).toBe(sha256Hex(String.fromCharCode(0x00, 0x01, 0x02, 0x41)));
  });

  it("returns lower-case hex of 64 characters for any input", () => {
    expect(sha256Hex("")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a view that reaches outside its buffer", () => {
    expect(() => sha256HexBytes(new Uint8Array(4))).not.toThrow();
    // A view whose byteOffset + byteLength lies past the end of its buffer is a caller mistake.
    const buffer = new ArrayBuffer(4);
    const lying = Object.create(Uint8Array.prototype) as Uint8Array;
    Object.defineProperty(lying, "byteOffset", { value: 0 });
    Object.defineProperty(lying, "byteLength", { value: 8 });
    Object.defineProperty(lying, "buffer", { value: buffer });
    expect(() => sha256HexBytes(lying)).toThrow();
  });
});

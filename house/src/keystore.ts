import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";

/**
 * Encrypted keystore holding the house account's BIP-39 mnemonic. From the mnemonic the SDK
 * derives the eth-native secp256k1 key (EVM lane and native signer) and the canonical ML-DSA-87
 * keypair. scrypt (N=2^17) + AES-256-GCM; the file is written 0600.
 */
interface KeystoreFile {
  version: 1;
  kdf: "scrypt";
  n: number;
  r: number;
  p: number;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

const N = 1 << 17;
const R = 8;
const P = 1;

function key(password: string, salt: Buffer, n = N, r = R, p = P): Buffer {
  return scryptSync(password, salt, 32, { N: n, r, p, maxmem: 256 * 1024 * 1024 });
}

export function writeKeystore(path: string, mnemonic: string, password: string): void {
  if (existsSync(path)) throw new Error(`refusing to overwrite ${path}`);
  if (password.length < 12) throw new Error("use a keystore password of at least 12 characters");
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(password, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(mnemonic.trim(), "utf8"), cipher.final()]);
  const file: KeystoreFile = {
    version: 1,
    kdf: "scrypt",
    n: N,
    r: R,
    p: P,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
  writeFileSync(path, JSON.stringify(file, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function readKeystore(path: string, password: string): string {
  const f = JSON.parse(readFileSync(path, "utf8")) as KeystoreFile;
  if (f.version !== 1 || f.kdf !== "scrypt") throw new Error("unsupported keystore format");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(password, Buffer.from(f.salt, "hex"), f.n, f.r, f.p),
    Buffer.from(f.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(f.tag, "hex"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(f.ciphertext, "hex")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("wrong keystore password or corrupted keystore");
  }
}

export function keystorePassword(): string {
  const p = process.env.SORTES_KEY_PASSWORD;
  if (!p) throw new Error("set SORTES_KEY_PASSWORD (from your process manager or shell, never a committed file)");
  return p;
}

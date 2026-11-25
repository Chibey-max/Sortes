import { toHex, type Hex } from "viem";

/**
 * The user's secret is the one thing that only the browser knows. It is created with
 * crypto.getRandomValues, saved BEFORE the mint transaction is sent, and offered as a backup
 * download. If it is lost, the request can only end in the floor result.
 */
export interface SavedSecret {
  secret: Hex;
  commit: Hex;
  minter: Hex;
  createdAt: number;
  requestId?: string;
  tokenId?: string;
  path: "qorex" | "evm";
}

const KEY = "sortes:secrets:v1";

function readAll(): SavedSecret[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function writeAll(list: SavedSecret[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private mode or blocked storage: the backup download is the fallback.
  }
}

export function newSecret(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return toHex(b);
}

export function saveSecret(s: SavedSecret) {
  writeAll(readAll().filter((x) => x.commit !== s.commit).concat(s));
}

export function updateSecret(commit: Hex, patch: Partial<SavedSecret>) {
  writeAll(readAll().map((x) => (x.commit === commit ? { ...x, ...patch } : x)));
}

export function allSecrets(): SavedSecret[] {
  return readAll();
}

export function secretForRequest(requestId: string): SavedSecret | undefined {
  return readAll().find((x) => x.requestId === requestId);
}

export function storageWorks(): boolean {
  try {
    localStorage.setItem("sortes:probe", "1");
    localStorage.removeItem("sortes:probe");
    return true;
  } catch {
    return false;
  }
}

export function downloadBackup(s: SavedSecret) {
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sortes-secret-${s.requestId ?? s.commit.slice(2, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importBackup(file: File): Promise<SavedSecret> {
  const s = JSON.parse(await file.text()) as SavedSecret;
  if (!/^0x[0-9a-fA-F]{64}$/.test(s.secret) || !/^0x[0-9a-fA-F]{64}$/.test(s.commit)) throw new Error("not a Sortes secret backup");
  saveSecret(s);
  return s;
}

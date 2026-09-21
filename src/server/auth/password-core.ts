import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_PASSWORD_BYTES = 128;

function deriveKey(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_BYTES, {
      N: cost,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: 64 * 1024 * 1024,
    }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPasswordCore(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await deriveKey(password, salt, COST);
  return ["scrypt", `N=${COST},r=${BLOCK_SIZE},p=${PARALLELIZATION}`, salt.toString("base64url"), derivedKey.toString("base64url")].join("$");
}

export async function verifyPasswordCore(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, parameters, encodedSalt, encodedKey] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !parameters || !encodedSalt || !encodedKey) return false;

  const values = new URLSearchParams(parameters.replaceAll(",", "&"));
  const cost = Number(values.get("N"));
  const blockSize = Number(values.get("r"));
  const parallelization = Number(values.get("p"));
  if (cost !== COST || blockSize !== BLOCK_SIZE || parallelization !== PARALLELIZATION) return false;

  const salt = Buffer.from(encodedSalt, "base64url");
  const expectedKey = Buffer.from(encodedKey, "base64url");
  if (salt.length !== SALT_BYTES || expectedKey.length !== KEY_BYTES) return false;

  const derivedKey = await deriveKey(password, salt, cost);
  return timingSafeEqual(derivedKey, expectedKey);
}

export function passwordByteLength(password: string): number {
  return Buffer.byteLength(password, "utf8");
}

export { MAX_PASSWORD_BYTES };
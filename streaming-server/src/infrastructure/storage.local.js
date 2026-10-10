import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

export async function initializeStorage() {
  await fs.mkdir(config.storagePath, { recursive: true });
  await fs.mkdir(config.tempPath, { recursive: true });
}

export async function saveObject(tempFilePath) {
  const storageKey = randomUUID();
  const destination = path.join(config.storagePath, storageKey);

  await fs.rename(tempFilePath, destination);

  return storageKey;
}

export function getObjectPath(storageKey) {
  // Nunca se aceptan rutas físicas enviadas por el cliente.
  if (!/^[a-f0-9-]{36}$/i.test(storageKey)) {
    throw new Error("Invalid storage key");
  }

  return path.join(config.storagePath, storageKey);
}

export async function deleteObject(storageKey) {
  await fs.rm(getObjectPath(storageKey), { force: true });
}
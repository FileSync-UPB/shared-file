
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const emptyDatabase = () => ({
  files: [],
  quotas: {}
});

let writeQueue = Promise.resolve();

async function ensureDatabase() {
  await fs.mkdir(path.dirname(config.metadataPath), {
    recursive: true
  });

  try {
    await fs.access(config.metadataPath);
  } catch {
    await fs.writeFile(
      config.metadataPath,
      JSON.stringify(emptyDatabase(), null, 2),
      "utf8"
    );
  }
}

function normalizeDatabase(database) {
  if (
    !database ||
    typeof database !== "object" ||
    Array.isArray(database)
  ) {
    throw new Error("metadata.json must contain a JSON object");
  }

  if (!Array.isArray(database.files)) {
    database.files = [];
  }

  if (
    !database.quotas ||
    typeof database.quotas !== "object" ||
    Array.isArray(database.quotas)
  ) {
    database.quotas = {};
  }

  return database;
}

export async function readDatabase() {
  await ensureDatabase();

  const content = await fs.readFile(
    config.metadataPath,
    "utf8"
  );

  if (!content.trim()) {
    throw new Error(
      "metadata.json is empty. Restore a valid database before continuing."
    );
  }

  let database;

  try {
    database = JSON.parse(content);
  } catch {
    throw new Error(
      "metadata.json contains invalid JSON. Restore a valid database before continuing."
    );
  }

  return normalizeDatabase(database);
}

export async function updateDatabase(mutator) {
  const operation = writeQueue.then(async () => {
    const database = await readDatabase();
    const result = await mutator(database);

    const temporaryPath = `${config.metadataPath}.tmp`;

    await fs.writeFile(
      temporaryPath,
      JSON.stringify(database, null, 2),
      "utf8"
    );

    await fs.rename(
      temporaryPath,
      config.metadataPath
    );

    return result;
  });

  writeQueue = operation.catch(() => {});

  return operation;
}

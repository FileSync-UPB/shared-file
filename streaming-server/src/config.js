import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export const config = {
  port: Number(process.env.PORT || 3000),
  root,
  metadataPath: path.join(root, "data", "metadata.json"),
  storagePath: path.join(root, "storage", "objects"),
  tempPath: path.join(root, "temp"),
  defaultQuotaBytes: 10 * 1024 * 1024 * 1024
};
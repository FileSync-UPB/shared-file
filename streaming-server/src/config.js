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
  defaultQuotaBytes: 1 * 1024 * 1024 * 1024,
  db: {
    host: process.env.MYSQL_HOST || "fylesync-mysql",
    user: process.env.MYSQL_USER || "upb_app",
    password: process.env.MYSQL_PASSWORD || "secret_password",
    database: process.env.MYSQL_DATABASE || "fylesync_users",
    port: Number(process.env.MYSQL_PORT || 3306)
  }
};
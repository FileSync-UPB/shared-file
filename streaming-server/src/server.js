import express from "express";
import filesRouter from "./api/files.routes.js";
import { identityMiddleware } from "./middleware/identity.js";
import { initializeStorage } from "./infrastructure/storage.local.js";
import { config } from "./config.js";

const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    service: "shared-files-server",
    status: "UP"
  });
});

app.use(
  "/api/files",
  identityMiddleware,
  filesRouter
);

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status =
    error.code === "LIMIT_FILE_SIZE" ? 413 :
    error.code === "LIMIT_FILE_COUNT" ? 400 :
    Number.isInteger(error.status) ? error.status :
    500;

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: status >= 500
      ? "Internal server error"
      : error.message
  });
});

initializeStorage()
  .then(() => {
    app.listen(config.port, () => {
      console.log(
        `Shared Files Server: http://localhost:${config.port}`
      );
    });
  })
  .catch(error => {
    console.error("Failed to initialize storage:", error);
    process.exitCode = 1;
  });
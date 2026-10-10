import { Router } from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import {
  listItems,
  getItem,
  createFolder,
  registerUpload,
  renameItem,
  moveItem,
  trashItem,
  listTrash,
  restoreItem,
  getContentRecord,
  getUsage,
  DriveError,
  shareItem,
  listItemPermissions,
  revokeItemAccess,
  listSharedWithMe
} from "../application/files.service.js";
import {
  saveObject,
  getObjectPath,
  deleteObject
} from "../infrastructure/storage.local.js";

const router = Router();

const upload = multer({
  dest: config.tempPath,
  limits: {
    fileSize: 1024 * 1024 * 1024,
    files: 1
  }
});

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.get("/", asyncRoute(async (req, res) => {
  const parentId = req.query.parentId ?? null;
  const items = await listItems(req.user.id, parentId);

  res.json({ items });
}));

router.get("/usage", asyncRoute(async (req, res) => {
  res.json(await getUsage(req.user.id));
}));

router.get("/trash", asyncRoute(async (req, res) => {
  res.json({ items: await listTrash(req.user.id) });
}));

router.post("/folders", asyncRoute(async (req, res) => {
  const folder = await createFolder(
    req.user.id,
    req.body.name,
    req.body.parentId ?? null
  );

  res.status(201).json(folder);
}));

router.post("/upload", upload.single("file"), asyncRoute(async (req, res) => {
  let storageKey;

  try {
    if (!req.file) {
      throw new DriveError(400, "A file is required");
    }

    storageKey = await saveObject(req.file.path);

    const item = await registerUpload(
      req.user.id,
      {
        ...req.file,
        storageKey
      },
      req.body.parentId || null
    );

    res.status(201).json(item);
  } catch (error) {
    if (storageKey) {
      await deleteObject(storageKey).catch(() => {});
    }

    throw error;
  } finally {
    if (req.file?.path) {
      await fs.rm(req.file.path, { force: true }).catch(() => {});
    }
  }
}));

router.get("/files/:id", asyncRoute(async (req, res) => {
  res.json(await getItem(req.user.id, req.params.id));
}));

router.patch("/files/:id", asyncRoute(async (req, res) => {
  const { name, parentId } = req.body;

  let item;

  if (name !== undefined) {
    item = await renameItem(req.user.id, req.params.id, name);
  }

  if (parentId !== undefined) {
    item = await moveItem(req.user.id, req.params.id, parentId);
  }

  if (!item) {
    throw new DriveError(400, "Provide name or parentId");
  }

  res.json(item);
}));

router.delete("/files/:id", asyncRoute(async (req, res) => {
  res.json(await trashItem(req.user.id, req.params.id));
}));

router.post("/trash/:id/restore", asyncRoute(async (req, res) => {
  res.json(await restoreItem(req.user.id, req.params.id));
}));

router.get("/files/:id/content", asyncRoute(async (req, res) => {
  const item = await getContentRecord(req.user.id, req.params.id);
  const objectPath = getObjectPath(item.storageKey);
  const stat = await fs.stat(objectPath);

  const range = req.headers.range;

  res.setHeader(
    "Content-Type",
    item.mimeType || "application/octet-stream"
  );
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(item.name)}`
  );

  if (!range) {
    res.setHeader("Content-Length", stat.size);
    return res.sendFile(path.resolve(objectPath));
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);

  if (!match || (!match[1] && !match[2]) || stat.size === 0) {
    res.setHeader("Content-Range", `bytes */${stat.size}`);
    return res.status(416).end();
  }

  let start;
  let end;

  if (!match[1]) {
    const suffixLength = Number(match[2]);

    if (suffixLength <= 0) {
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      return res.status(416).end();
    }

    start = Math.max(0, stat.size - suffixLength);
    end = stat.size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : stat.size - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start >= stat.size ||
    end < start
  ) {
    res.setHeader("Content-Range", `bytes */${stat.size}`);
    return res.status(416).end();
  }

  end = Math.min(end, stat.size - 1);

  res.status(206);
  res.setHeader(
    "Content-Range",
    `bytes ${start}-${end}/${stat.size}`
  );
  res.setHeader("Content-Length", end - start + 1);

  const stream = (await import("node:fs")).createReadStream(
    objectPath,
    { start, end }
  );

  stream.on("error", error => {
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.destroy(error);
    }
  });

  stream.pipe(res);
}));
router.get("/shared", asyncRoute(async (req, res) => {
  res.json({
    items: await listSharedWithMe(req.user.id)
  });
}));

router.post("/:id/permissions", asyncRoute(async (req, res) => {
  const { userId, role = "viewer" } = req.body;

  res.status(200).json(
    await shareItem(req.user.id, req.params.id, userId, role)
  );
}));

router.get("/:id/permissions", asyncRoute(async (req, res) => {
  res.json(
    await listItemPermissions(req.user.id, req.params.id)
  );
}));

router.delete("/:id/permissions/:userId", asyncRoute(async (req, res) => {
  res.json(
    await revokeItemAccess(
      req.user.id,
      req.params.id,
      req.params.userId
    )
  );
}));
export default router;
import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import {
  getSyncOverview,
  registerDevice,
  updateDevicePolicy,
  triggerDeviceSync,
  uploadSyncedFile,
  unregisterDevice
} from "../application/sync.service.js";

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
  const overview = await getSyncOverview(req.user.id);
  res.json(overview);
}));

router.post("/devices", asyncRoute(async (req, res) => {
  const device = await registerDevice(req.user.id, req.body);
  res.status(201).json(device);
}));

router.patch("/devices/:id", asyncRoute(async (req, res) => {
  const updated = await updateDevicePolicy(req.user.id, req.params.id, req.body);
  res.json(updated);
}));

router.delete("/devices/:id", asyncRoute(async (req, res) => {
  const result = await unregisterDevice(req.user.id, req.params.id);
  res.json(result);
}));

router.post("/devices/:id/trigger", asyncRoute(async (req, res) => {
  const result = await triggerDeviceSync(req.user.id, req.params.id, req.body);
  res.json(result);
}));

router.post("/devices/:id/upload", upload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Archivo requerido para sincronización" });
  }
  const relativePath = req.body.relativePath || req.file.originalname;
  const result = await uploadSyncedFile(req.user.id, req.params.id, req.file, relativePath);
  res.status(201).json(result);
}));

export default router;

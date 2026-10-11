import { Router } from "express";
import {
  getSyncOverview,
  registerDevice,
  updateDevicePolicy,
  triggerDeviceSync
} from "../application/sync.service.js";

const router = Router();

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

router.post("/devices/:id/trigger", asyncRoute(async (req, res) => {
  const result = await triggerDeviceSync(req.user.id, req.params.id, req.body);
  res.json(result);
}));

export default router;

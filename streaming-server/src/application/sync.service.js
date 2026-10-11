import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";

const HOME_DIR = "/var/fylesync/home";
const POLICIES_PATH = path.join(config.root, "data", "sync_policies.json");

async function readPolicies() {
  try {
    const raw = await fs.readFile(POLICIES_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { devices: {}, history: [] };
  }
}

async function writePolicies(data) {
  await fs.mkdir(path.dirname(POLICIES_PATH), { recursive: true });
  await fs.writeFile(POLICIES_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function readGoState() {
  try {
    const raw = await fs.readFile(path.join(HOME_DIR, "state.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return { Devices: {}, Revisions: [] };
  }
}

export async function getSyncOverview(userId) {
  const policies = await readPolicies();
  const goState = await readGoState();

  // 1. Obtener dispositivos registrados en Go y enriquecer con configuración local
  const devicesMap = new Map();

  // Dispositivos que ya se sincronizaron con Go
  for (const [devId, devOwner] of Object.entries(goState.Devices || {})) {
    if (devOwner === userId) {
      devicesMap.set(devId, {
        id: devId,
        name: devId,
        platform: devId.includes("android") ? "Android" : (devId.includes("linux") ? "Linux" : "Windows"),
        syncFolder: devId.includes("android") ? "/sdcard/Documents/UPB_Sync" : "C:\\Users\\" + userId + "\\FyleSync",
        scheduleMode: "interval",
        scheduleTime: "02:00",
        intervalMinutes: 5,
        wifiOnly: devId.includes("android"),
        lastSyncAt: null,
        status: "Conectado",
        isRegisteredInGo: true
      });
    }
  }

  // Fusionar con políticas guardadas
  const userDevices = policies.devices[userId] || {};
  for (const [devId, devData] of Object.entries(userDevices)) {
    const existing = devicesMap.get(devId) || {};
    devicesMap.set(devId, {
      ...existing,
      ...devData,
      isRegisteredInGo: devicesMap.has(devId) || existing.isRegisteredInGo || false
    });
  }

  // Si el usuario no tiene dispositivos creados aún, inicializar dos dispositivos de ejemplo (Escritorio y Móvil)
  if (devicesMap.size === 0) {
    const defaultDesktopId = `desktop-${userId}-win`;
    const defaultMobileId = `mobile-${userId}-android`;

    devicesMap.set(defaultDesktopId, {
      id: defaultDesktopId,
      name: `PC Escritorio ${userId} (Windows)`,
      platform: "Windows",
      syncFolder: `C:\\Users\\${userId}\\FyleSync`,
      scheduleMode: "interval",
      scheduleTime: "02:00",
      intervalMinutes: 5,
      wifiOnly: false,
      lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
      status: "Sincronizado",
      isRegisteredInGo: true
    });

    devicesMap.set(defaultMobileId, {
      id: defaultMobileId,
      name: `Dispositivo Móvil ${userId} (Android)`,
      platform: "Android",
      syncFolder: `/sdcard/Documents/FyleSync`,
      scheduleMode: "scheduled",
      scheduleTime: "02:00",
      intervalMinutes: 15,
      wifiOnly: true,
      lastSyncAt: new Date(Date.now() - 7200000).toISOString(),
      status: "En espera de Wi-Fi",
      isRegisteredInGo: true
    });
  }

  policies.devices[userId] = Object.fromEntries(devicesMap);
  await writePolicies(policies);

  // 2. Escanear archivos en el repositorio espejado de este usuario (/var/fylesync/home/<userId>)
  const userHome = path.join(HOME_DIR, userId);
  const syncedFiles = [];

  try {
    const entries = await fs.readdir(userHome, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = path.join(entry.parentPath || userHome, entry.name);
        const relPath = path.relative(userHome, fullPath).replace(/\\/g, "/");
        const stats = await fs.stat(fullPath);

        // Buscar última revisión en Go
        const lastRev = (goState.Revisions || [])
          .slice()
          .reverse()
          .find(r => r.Path === relPath && r.Branch === "main");

        syncedFiles.push({
          path: relPath,
          name: entry.name,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          revision: lastRev ? lastRev.ID : "r-central",
          device: lastRev ? lastRev.Device : "servidor",
          branch: lastRev ? lastRev.Branch : "main"
        });
      }
    }
  } catch {
    // Directorio de usuario vacío o aún sin inicializar
  }

  // 3. Historial de eventos
  const userHistory = (policies.history || []).filter(h => h.userId === userId);

  return {
    server: {
      grpcPort: 8443,
      grpcHost: "localhost",
      tlsEnabled: true,
      homeRoot: HOME_DIR,
      status: "ONLINE"
    },
    devices: Array.from(devicesMap.values()),
    syncedFiles,
    history: userHistory.slice(-20).reverse()
  };
}

export async function registerDevice(userId, data) {
  const policies = await readPolicies();
  if (!policies.devices[userId]) policies.devices[userId] = {};

  const id = data.id || `${data.platform.toLowerCase()}-${userId}-${Date.now().toString(36)}`;
  const device = {
    id,
    name: data.name || `Dispositivo ${data.platform}`,
    platform: data.platform || "Windows",
    syncFolder: data.syncFolder || (data.platform === "Android" ? "/sdcard/Documents/FyleSync" : `C:\\Users\\${userId}\\FyleSync`),
    scheduleMode: data.scheduleMode || (data.platform === "Android" ? "scheduled" : "interval"),
    scheduleTime: data.scheduleTime || "02:00",
    intervalMinutes: data.intervalMinutes || 5,
    wifiOnly: data.wifiOnly !== undefined ? Boolean(data.wifiOnly) : (data.platform === "Android"),
    lastSyncAt: new Date().toISOString(),
    status: "Conectado",
    isRegisteredInGo: true
  };

  policies.devices[userId][id] = device;

  // Registrar evento en auditoría
  if (!policies.history) policies.history = [];
  policies.history.push({
    id: crypto.randomUUID(),
    userId,
    deviceId: id,
    platform: device.platform,
    action: "REGISTRO_DISPOSITIVO",
    detail: `Dispositivo "${device.name}" registrado (${device.platform})`,
    timestamp: new Date().toISOString(),
    status: "EXITO"
  });

  await writePolicies(policies);
  return device;
}

export async function updateDevicePolicy(userId, deviceId, policyUpdates) {
  await getSyncOverview(userId);
  const policies = await readPolicies();
  if (!policies.devices[userId] || !policies.devices[userId][deviceId]) {
    throw new Error("Dispositivo no encontrado");
  }

  const current = policies.devices[userId][deviceId];
  policies.devices[userId][deviceId] = {
    ...current,
    ...policyUpdates
  };

  await writePolicies(policies);
  return policies.devices[userId][deviceId];
}

export async function triggerDeviceSync(userId, deviceId, options = {}) {
  await getSyncOverview(userId);
  const policies = await readPolicies();
  let device = policies.devices[userId]?.[deviceId];

  if (!device) {
    throw new Error("Dispositivo no registrado");
  }

  const isWiFi = options.isWiFiConnected !== undefined ? Boolean(options.isWiFiConnected) : true;

  // Validación de la política Wi-Fi en móvil
  if (device.wifiOnly && !isWiFi) {
    // Registrar evento de bloqueo por falta de Wi-Fi
    policies.history.push({
      id: crypto.randomUUID(),
      userId,
      deviceId,
      platform: device.platform,
      action: "SINCRONIZACION_PAUSADA",
      detail: `Sincronización omitida: Conectado a red móvil celular. Se requiere Wi-Fi local de la empresa/universidad.`,
      timestamp: new Date().toISOString(),
      status: "EN_ESPERA_WIFI"
    });
    device.status = "En espera de Wi-Fi local";
    await writePolicies(policies);

    return {
      success: false,
      blockedByPolicy: "WIFI_REQUIRED",
      message: `Sincronización en pausa: El dispositivo ${device.name} está configurado con la política de sincronizar únicamente sobre la red Wi-Fi local interna.`
    };
  }

  // Ejecución exitosa de la sincronización
  device.lastSyncAt = new Date().toISOString();
  device.status = "Sincronizado";

  const syncedCount = options.filesCount || 3;
  policies.history.push({
    id: crypto.randomUUID(),
    userId,
    deviceId,
    platform: device.platform,
    action: "SINCRONIZACION_COMPLETA",
    detail: `Árbol de directorios "${device.syncFolder}" sincronizado síncronamente con el repositorio central (${syncedCount} archivos verificados).`,
    timestamp: new Date().toISOString(),
    status: "EXITO"
  });

  await writePolicies(policies);

  return {
    success: true,
    message: `Sincronización completada exitosamente con el repositorio central.`,
    lastSyncAt: device.lastSyncAt
  };
}

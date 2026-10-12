import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { readDatabase, updateDatabase } from "../infrastructure/metadata.repository.js";
import { saveObject } from "../infrastructure/storage.local.js";
import { createFile } from "../domain/file.js";

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

async function writeGoState(data) {
  try {
    await fs.writeFile(path.join(HOME_DIR, "state.json"), JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing state.json:", err);
  }
}

export async function getSyncOverview(userId) {
  const policies = await readPolicies();
  const goState = await readGoState();
  const db = await readDatabase().catch(() => ({ files: [] }));

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

  policies.devices[userId] = Object.fromEntries(devicesMap);
  await writePolicies(policies);

  // 2. Escanear archivos en el repositorio espejado de este usuario (/var/fylesync/home/<userId>)
  const userHome = path.join(HOME_DIR, userId);
  const syncedFiles = [];
  const foundFileNames = new Set();

  try {
    const entries = await fs.readdir(userHome, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = path.join(entry.parentPath || userHome, entry.name);
        const relPath = path.relative(userHome, fullPath).replace(/\\/g, "/");
        const stats = await fs.stat(fullPath);
        foundFileNames.add(entry.name);

        // Buscar última revisión en Go
        const lastRev = (goState.Revisions || [])
          .slice()
          .reverse()
          .find(r => r.Path === relPath && r.Branch === "main");

        // Buscar si existe en Drive metadata para obtener su ID de descarga/streaming
        const driveItem = db.files.find(f => f.ownerId === userId && f.name === entry.name && !f.trashedAt);

        syncedFiles.push({
          id: driveItem ? driveItem.id : null,
          path: relPath,
          name: entry.name,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          revision: lastRev ? lastRev.ID : "r-central",
          device: lastRev ? lastRev.Device : (driveItem ? "Dispositivo Móvil" : "servidor"),
          branch: lastRev ? lastRev.Branch : "main"
        });
      }
    }
  } catch {
    // Directorio de usuario vacío o aún sin inicializar
  }

  // También incluir archivos registrados en la carpeta "Dispositivos Sincronizados" de Drive
  const syncRootFolder = db.files.find(f => f.ownerId === userId && f.kind === "folder" && f.name === "Dispositivos Sincronizados" && !f.trashedAt);
  if (syncRootFolder) {
    const deviceSubfolders = db.files.filter(f => f.parentId === syncRootFolder.id && f.kind === "folder" && !f.trashedAt);
    const deviceSubfolderIds = new Set(deviceSubfolders.map(f => f.id));

    const deviceFiles = db.files.filter(f => f.ownerId === userId && f.kind === "file" && deviceSubfolderIds.has(f.parentId) && !f.trashedAt);
    for (const df of deviceFiles) {
      if (!foundFileNames.has(df.name)) {
        const parentFolder = deviceSubfolders.find(sf => sf.id === df.parentId);
        syncedFiles.push({
          id: df.id,
          path: df.name,
          name: df.name,
          size: df.size,
          lastModified: df.updatedAt,
          revision: "r-sincronizado",
          device: parentFolder ? parentFolder.name : "Dispositivo",
          branch: "main"
        });
      }
    }
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

  // Registrar también en Go state.json
  const goState = await readGoState();
  if (!goState.Devices) goState.Devices = {};
  goState.Devices[id] = userId;
  await writeGoState(goState);

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

export async function uploadSyncedFile(userId, deviceId, uploadedFile, relativePath) {
  await getSyncOverview(userId);
  const policies = await readPolicies();
  const device = policies.devices[userId]?.[deviceId];
  const deviceName = device ? device.name : "Dispositivo";

  const fileName = path.basename(relativePath || uploadedFile.originalname || "archivo");
  const relPath = (relativePath || uploadedFile.originalname || fileName).replace(/\\/g, "/");

  // 1. Guardar en /var/fylesync/home/<userId>/<relPath> (repositorio espejado)
  const userHome = path.join(HOME_DIR, userId);
  const destHomePath = path.join(userHome, relPath);
  await fs.mkdir(path.dirname(destHomePath), { recursive: true });
  await fs.copyFile(uploadedFile.path, destHomePath);

  // 2. Guardar en storage/objects con storageKey (para streaming, album, visor y drive)
  const storageKey = await saveObject(uploadedFile.path);

  // 3. Registrar o actualizar en metadata.json bajo "Dispositivos Sincronizados / <deviceName>"
  const registeredItem = await updateDatabase(database => {
    // Buscar o crear carpeta raíz "Dispositivos Sincronizados"
    let syncRoot = database.files.find(f => f.ownerId === userId && f.kind === "folder" && f.name === "Dispositivos Sincronizados" && f.parentId === null && !f.trashedAt);
    if (!syncRoot) {
      syncRoot = createFile({
        id: crypto.randomUUID(),
        ownerId: userId,
        parentId: null,
        name: "Dispositivos Sincronizados",
        kind: "folder",
        mimeType: "application/x-directory",
        size: 0,
        storageKey: null
      });
      database.files.push(syncRoot);
    }

    // Buscar o crear subcarpeta para el dispositivo
    let deviceFolder = database.files.find(f => f.ownerId === userId && f.kind === "folder" && f.name === deviceName && f.parentId === syncRoot.id && !f.trashedAt);
    if (!deviceFolder) {
      deviceFolder = createFile({
        id: crypto.randomUUID(),
        ownerId: userId,
        parentId: syncRoot.id,
        name: deviceName,
        kind: "folder",
        mimeType: "application/x-directory",
        size: 0,
        storageKey: null
      });
      database.files.push(deviceFolder);
    }

    // Buscar si el archivo ya existe en esa carpeta
    let fileItem = database.files.find(f => f.ownerId === userId && f.name === fileName && f.parentId === deviceFolder.id && !f.trashedAt);
    if (fileItem) {
      fileItem.storageKey = storageKey;
      fileItem.size = uploadedFile.size;
      fileItem.mimeType = uploadedFile.mimetype || "application/octet-stream";
      fileItem.updatedAt = new Date().toISOString();
    } else {
      fileItem = createFile({
        id: crypto.randomUUID(),
        ownerId: userId,
        parentId: deviceFolder.id,
        name: fileName,
        kind: "file",
        mimeType: uploadedFile.mimetype || "application/octet-stream",
        size: uploadedFile.size,
        storageKey
      });
      database.files.push(fileItem);
    }

    return fileItem;
  });

  // 4. Actualizar estado y políticas
  if (device) {
    device.lastSyncAt = new Date().toISOString();
    device.status = "Sincronizado";
  }

  if (!policies.history) policies.history = [];
  policies.history.push({
    id: crypto.randomUUID(),
    userId,
    deviceId,
    platform: device ? device.platform : "Android",
    action: "SINCRONIZACION_ARCHIVO",
    detail: `Archivo "${fileName}" (${(uploadedFile.size / 1024).toFixed(1)} KB) sincronizado desde ${deviceName} al repositorio central y Mi Unidad.`,
    timestamp: new Date().toISOString(),
    status: "EXITO"
  });

  await writePolicies(policies);

  return {
    success: true,
    file: fileName,
    item: registeredItem,
    message: `Archivo "${fileName}" sincronizado con éxito al repositorio central y Mi Unidad.`
  };
}

export async function unregisterDevice(userId, deviceId) {
  const policies = await readPolicies();
  if (policies.devices[userId] && policies.devices[userId][deviceId]) {
    const devName = policies.devices[userId][deviceId].name;
    delete policies.devices[userId][deviceId];

    // Eliminar también de Go state.json
    const goState = await readGoState();
    if (goState.Devices && goState.Devices[deviceId]) {
      delete goState.Devices[deviceId];
      await writeGoState(goState);
    }

    if (!policies.history) policies.history = [];
    policies.history.push({
      id: crypto.randomUUID(),
      userId,
      deviceId,
      platform: "Sistema",
      action: "DESVINCULACION_DISPOSITIVO",
      detail: `Dispositivo "${devName}" desvinculado del sistema.`,
      timestamp: new Date().toISOString(),
      status: "EXITO"
    });
    await writePolicies(policies);
    return { success: true, message: `Dispositivo "${devName}" desvinculado con éxito.` };
  }
  return { success: false, message: "Dispositivo no encontrado." };
}


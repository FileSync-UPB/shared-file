
import { randomUUID } from "node:crypto";
import {
  readDatabase,
  updateDatabase
} from "../infrastructure/metadata.repository.js";
import { deleteObject } from "../infrastructure/storage.local.js";
import { createFile } from "../domain/file.js";
import { config } from "../config.js";

export class DriveError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "DriveError";
    this.status = status;
  }
}

// --------------------------------------------------
// Búsqueda y permisos
// --------------------------------------------------

function getItemById(database, id) {
  return database.files.find(file => file.id === id) ?? null;
}

function getAllDescendantIds(database, folderId) {
  const descendantIds = [];
  const queue = [folderId];
  const visited = new Set([folderId]);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = database.files.filter(file => file.parentId === currentId);
    for (const child of children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        descendantIds.push(child.id);
        if (child.kind === "folder") {
          queue.push(child.id);
        }
      }
    }
  }

  return descendantIds;
}

function roleRank(role) {
  return {
    viewer: 1,
    editor: 2,
    owner: 3
  }[role] ?? 0;
}

function getAccessRole(database, item, userId) {
  if (!item) {
    return null;
  }

  // El propietario conserva acceso a sus elementos.
  if (userId && item.ownerId === userId) {
    return "owner";
  }

  let current = item;
  const visited = new Set();

  // La autorización más cercana al elemento tiene prioridad.
  while (current) {
    if (visited.has(current.id) || current.trashedAt) {
      return null;
    }

    visited.add(current.id);

    if (userId && current.ownerId === userId) {
      return "owner";
    }

    const permission = (current.permissions ?? []).find(
      entry => (userId && entry.userId === userId) || entry.userId === "public"
    );

    if (permission) {
      return ["viewer", "editor"].includes(permission.role)
        ? permission.role
        : null;
    }

    current = current.parentId
      ? getItemById(database, current.parentId)
      : null;
  }

  return null;
}

function getAccessibleItem(
  database,
  id,
  userId,
  requiredRole = "viewer"
) {
  const item = getItemById(database, id);

  if (!item || item.trashedAt) {
    throw new DriveError(404, "File or folder not found");
  }

  const role = getAccessRole(database, item, userId);

  if (!role) {
    throw new DriveError(404, "File or folder not found");
  }

  if (roleRank(role) < roleRank(requiredRole)) {
    throw new DriveError(403, "Insufficient permissions");
  }

  return item;
}

// Requiere permiso de edición. El propietario también lo tiene.
function getOwnedItem(database, id, userId) {
  return getAccessibleItem(database, id, userId, "editor");
}

function assertParent(database, parentId, userId) {
  if (parentId == null) {
    return null;
  }

  const parent = getOwnedItem(database, parentId, userId);

  if (parent.kind !== "folder") {
    throw new DriveError(400, "Parent must be a folder");
  }

  return parent;
}

function assertUniqueName(
  database,
  parentId,
  name,
  userId,
  excludeId = null
) {
  const normalizedName = name.toLocaleLowerCase();

  const duplicate = database.files.some(file =>
    file.parentId === parentId &&
    (parentId !== null || file.ownerId === userId) &&
    file.name.toLocaleLowerCase() === normalizedName &&
    !file.trashedAt &&
    file.id !== excludeId
  );

  if (duplicate) {
    throw new DriveError(
      409,
      "An item with that name already exists"
    );
  }
}

function validateName(name, message = "Invalid name") {
  if (typeof name !== "string" || !name.trim()) {
    throw new DriveError(400, message);
  }

  const cleanName = name.trim();

  if (
    cleanName.length > 255 ||
    /[/\\\0]/.test(cleanName)
  ) {
    throw new DriveError(400, message);
  }

  return cleanName;
}

// --------------------------------------------------
// Cuota y representación pública
// --------------------------------------------------

function usedBytes(database, userId) {
  return database.files.reduce((total, file) => {
    if (
      file.ownerId === userId &&
      file.kind === "file" &&
      !file.trashedAt
    ) {
      // Ignorar huérfanos cuyo padre ya fue eliminado
      if (file.parentId !== null && !database.files.some(f => f.id === file.parentId)) {
        return total;
      }
      return total + file.size;
    }

    return total;
  }, 0);
}

function getQuota(database, userId) {
  return database.quotas[userId] ?? config.defaultQuotaBytes;
}

function publicItem(item, currentUserId = null) {
  const {
    storageKey,
    permissions,
    starredBy,
    ...result
  } = item;

  // No exponer la ruta interna ni la lista interna de permisos.
  return {
    ...result,
    isStarred: currentUserId && starredBy ? starredBy.includes(currentUserId) : false,
    permissionsCount: (permissions ?? []).length
  };
}

// --------------------------------------------------
// Listar elementos y consultar metadatos
// --------------------------------------------------

export async function listItems(userId, parentId = null) {
  const database = await readDatabase();

  // Raíz: solo los elementos propios.
  if (parentId === null || parentId === "") {
    return database.files
      .filter(file =>
        file.ownerId === userId &&
        file.parentId === null &&
        !file.trashedAt
      )
      .map(file => publicItem(file, userId));
  }

  // Para abrir una carpeta compartida basta con leerla.
  const parent = getAccessibleItem(
    database,
    parentId,
    userId,
    "viewer"
  );

  if (parent.kind !== "folder") {
    throw new DriveError(400, "Parent must be a folder");
  }

  return database.files
    .filter(file =>
      file.parentId === parentId &&
      !file.trashedAt &&
      getAccessRole(database, file, userId) !== null
    )
    .map(file => publicItem(file, userId));
}

export async function getItem(userId, id) {
  const database = await readDatabase();

  return publicItem(
    getAccessibleItem(database, id, userId, "viewer")
  );
}

// --------------------------------------------------
// Crear carpetas
// --------------------------------------------------

export async function createFolder(
  userId,
  name,
  parentId = null
) {
  const cleanName = validateName(
    name,
    "Folder name is required"
  );

  return updateDatabase(database => {
    assertParent(database, parentId, userId);

    assertUniqueName(
      database,
      parentId,
      cleanName,
      userId
    );

    const folder = createFile({
      id: randomUUID(),
      ownerId: userId,
      parentId,
      name: cleanName,
      mimeType: null,
      size: 0,
      storageKey: null,
      kind: "folder"
    });

    database.files.push(folder);

    return publicItem(folder);
  });
}

// --------------------------------------------------
// Registrar archivos subidos
// --------------------------------------------------

export async function registerUpload(
  userId,
  file,
  parentId = null
) {
  if (!file) {
    throw new DriveError(
      400,
      "Upload a file using the 'file' field"
    );
  }

  const name = validateName(
    file.originalname,
    "Invalid file name"
  );

  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 0 ||
    !file.storageKey
  ) {
    throw new DriveError(400, "Invalid uploaded file");
  }

  return updateDatabase(database => {
    assertParent(database, parentId, userId);

    assertUniqueName(
      database,
      parentId,
      name,
      userId
    );

    const used = usedBytes(database, userId);
    const quota = getQuota(database, userId);

    if (file.size > quota - used) {
      throw new DriveError(
        413,
        "User storage quota exceeded"
      );
    }

    const item = createFile({
      id: randomUUID(),
      ownerId: userId,
      parentId,
      name,
      mimeType: file.mimetype || "application/octet-stream",
      size: file.size,
      storageKey: file.storageKey,
      kind: "file"
    });

    database.files.push(item);

    return publicItem(item);
  });
}

// --------------------------------------------------
// Renombrar
// --------------------------------------------------

export async function renameItem(userId, id, name) {
  const cleanName = validateName(
    name,
    "New name is required"
  );

  return updateDatabase(database => {
    const item = getOwnedItem(database, id, userId);

    assertUniqueName(
      database,
      item.parentId,
      cleanName,
      userId,
      item.id
    );

    item.name = cleanName;
    item.updatedAt = new Date().toISOString();

    return publicItem(item);
  });
}

// --------------------------------------------------
// Mover elementos
// --------------------------------------------------

export async function moveItem(userId, id, parentId) {
  return updateDatabase(database => {
    const item = getOwnedItem(database, id, userId);

    if (parentId === "") {
      parentId = null;
    }

    assertParent(database, parentId, userId);

    if (id === parentId) {
      throw new DriveError(
        400,
        "A folder cannot be moved into itself"
      );
    }

    if (item.kind === "folder") {
      let currentParent = parentId;
      const visited = new Set();

      while (currentParent !== null) {
        if (currentParent === id) {
          throw new DriveError(400, "Folder cycle detected");
        }

        if (visited.has(currentParent)) {
          throw new DriveError(400, "Folder cycle detected");
        }

        visited.add(currentParent);

        const ancestor = getItemById(database, currentParent);

        if (!ancestor || ancestor.trashedAt) {
          throw new DriveError(404, "Parent folder not found");
        }

        currentParent = ancestor.parentId;
      }
    }

    assertUniqueName(
      database,
      parentId,
      item.name,
      userId,
      item.id
    );

    item.parentId = parentId;
    item.updatedAt = new Date().toISOString();

    return publicItem(item);
  });
}

// --------------------------------------------------
// Papelera
// --------------------------------------------------

export async function trashItem(userId, id) {
  return updateDatabase(database => {
    const item = getOwnedItem(database, id, userId);
    const now = new Date().toISOString();

    item.trashedAt = now;
    item.updatedAt = now;

    if (item.kind === "folder") {
      const descendants = getAllDescendantIds(database, item.id);
      for (const descId of descendants) {
        const descItem = getItemById(database, descId);
        if (descItem) {
          descItem.trashedAt = now;
          descItem.updatedAt = now;
        }
      }
    }

    return {
      id: item.id,
      trashedAt: now
    };
  });
}

export async function listTrash(userId) {
  const database = await readDatabase();

  return database.files
    .filter(file =>
      file.ownerId === userId &&
      file.trashedAt
    )
    .map(publicItem);
}

export async function restoreItem(userId, id) {
  return updateDatabase(database => {
    const item = database.files.find(file =>
      file.id === id &&
      file.ownerId === userId &&
      file.trashedAt
    );

    if (!item) {
      throw new DriveError(404, "Trashed item not found");
    }

    const parent = item.parentId === null
      ? null
      : database.files.find(file =>
          file.id === item.parentId &&
          file.ownerId === userId &&
          file.kind === "folder" &&
          !file.trashedAt
        );

    if (item.parentId !== null && !parent) {
      throw new DriveError(
        409,
        "Restore the parent folder first"
      );
    }

    assertUniqueName(
      database,
      item.parentId,
      item.name,
      userId,
      item.id
    );

    const now = new Date().toISOString();
    item.trashedAt = null;
    item.updatedAt = now;

    if (item.kind === "folder") {
      const descendants = getAllDescendantIds(database, item.id);
      for (const descId of descendants) {
        const descItem = getItemById(database, descId);
        if (descItem) {
          descItem.trashedAt = null;
          descItem.updatedAt = now;
        }
      }
    }

    return publicItem(item);
  });
}

// --------------------------------------------------
// Obtener contenido para descarga o streaming
// --------------------------------------------------

export async function getContentRecord(userId, id) {
  const database = await readDatabase();

  const item = getAccessibleItem(
    database,
    id,
    userId,
    "viewer"
  );

  if (item.kind !== "file") {
    throw new DriveError(
      400,
      "Folders do not have file content"
    );
  }

  return item;
}

// --------------------------------------------------
// Uso de almacenamiento
// --------------------------------------------------

export async function getUsage(userId) {
  const database = await readDatabase();

  const used = usedBytes(database, userId);
  const quota = getQuota(database, userId);

  return {
    usedBytes: used,
    quotaBytes: quota,
    availableBytes: Math.max(0, quota - used)
  };
}

// --------------------------------------------------
// Compartir elementos
// --------------------------------------------------

export async function shareItem(
  ownerId,
  itemId,
  targetUserId,
  role = "viewer"
) {
  if (
    typeof targetUserId !== "string" ||
    !targetUserId.trim() ||
    targetUserId.trim() === ownerId
  ) {
    throw new DriveError(400, "Invalid recipient");
  }

  if (!["viewer", "editor"].includes(role)) {
    throw new DriveError(
      400,
      "Role must be viewer or editor"
    );
  }

  const recipient = targetUserId.trim();

  return updateDatabase(database => {
    const item = getAccessibleItem(
      database,
      itemId,
      ownerId,
      "owner"
    );

    const applyPerm = (target) => {
      target.permissions ??= [];
      const existing = target.permissions.find(
        permission => permission.userId === recipient
      );

      if (existing) {
        existing.role = role;
        existing.updatedAt = new Date().toISOString();
      } else {
        target.permissions.push({
          userId: recipient,
          role,
          grantedBy: ownerId,
          createdAt: new Date().toISOString()
        });
      }

      target.updatedAt = new Date().toISOString();
    };

    applyPerm(item);

    if (item.kind === "folder") {
      const descendants = getAllDescendantIds(database, item.id);
      for (const descId of descendants) {
        const descItem = getItemById(database, descId);
        if (descItem) {
          applyPerm(descItem);
        }
      }
    }

    return {
      itemId: item.id,
      userId: recipient,
      role
    };
  });
}

export async function listItemPermissions(userId, itemId) {
  const database = await readDatabase();

  const item = getAccessibleItem(
    database,
    itemId,
    userId,
    "owner"
  );

  return {
    itemId: item.id,
    ownerId: item.ownerId,
    permissions: (item.permissions ?? []).map(permission => ({
      userId: permission.userId,
      role: permission.role,
      createdAt: permission.createdAt,
      updatedAt: permission.updatedAt
    }))
  };
}

export async function revokeItemAccess(
  ownerId,
  itemId,
  targetUserId
) {
  return updateDatabase(database => {
    const item = getAccessibleItem(
      database,
      itemId,
      ownerId,
      "owner"
    );

    const revokePerm = (target) => {
      if (!target.permissions) return false;
      const prevLen = target.permissions.length;
      target.permissions = target.permissions.filter(
        permission => permission.userId !== targetUserId
      );
      if (target.permissions.length !== prevLen) {
        target.updatedAt = new Date().toISOString();
        return true;
      }
      return false;
    };

    const removedFromSelf = revokePerm(item);

    if (item.kind === "folder") {
      const descendants = getAllDescendantIds(database, item.id);
      for (const descId of descendants) {
        const descItem = getItemById(database, descId);
        if (descItem) {
          revokePerm(descItem);
        }
      }
    }

    if (!removedFromSelf) {
      throw new DriveError(404, "Permission not found");
    }

    return {
      itemId: item.id,
      revokedUserId: targetUserId
    };
  });
}

export async function listSharedWithMe(userId) {
  const database = await readDatabase();

  return database.files
    .filter(item => {
      if (item.trashedAt || item.ownerId === userId) return false;
      const role = getAccessRole(database, item, userId);
      if (!role) return false;

      // Si el elemento pertenece a una carpeta padre que también es accesible por el usuario,
      // no mostrarlo en la raíz para mantener la jerarquía de carpetas
      if (item.parentId !== null) {
        const parent = getItemById(database, item.parentId);
        if (parent && !parent.trashedAt && getAccessRole(database, parent, userId) !== null) {
          return false;
        }
      }

      return true;
    })
    .map(item => ({
      ...publicItem(item, userId),
      ownerId: item.ownerId
    }));
}

const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"];
const VIDEO_EXT = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"];

function fileCategory(item) {
  const mime = (item.mimeType ?? "").toLowerCase();
  const name = (item.name ?? "").toLowerCase();
  if (mime.startsWith("image/") || IMAGE_EXT.some(e => name.endsWith(e))) return "images";
  if (mime.startsWith("video/") || VIDEO_EXT.some(e => name.endsWith(e))) return "videos";
  return "files";
}

export async function listByCategory(userId, category) {
  if (!["images", "videos", "files"].includes(category)) {
    throw new DriveError(400, "Invalid category");
  }

  const database = await readDatabase();

  return database.files
    .filter(item =>
      item.kind === "file" &&
      !item.trashedAt &&
      getAccessRole(database, item, userId) !== null &&
      fileCategory(item) === category
    )
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .map(item => publicItem(item, userId));
}

export async function listRecent(userId) {
  const database = await readDatabase();

  return database.files
    .filter(item =>
      !item.trashedAt &&
      getAccessRole(database, item, userId) !== null
    )
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 50)
    .map(item => publicItem(item, userId));
}

export async function toggleStar(userId, id) {
  return updateDatabase(database => {
    const item = getAccessibleItem(database, id, userId, "viewer");
    if (!item.starredBy) {
      item.starredBy = [];
    }
    const idx = item.starredBy.indexOf(userId);
    let isStarred = false;
    if (idx === -1) {
      item.starredBy.push(userId);
      isStarred = true;
    } else {
      item.starredBy.splice(idx, 1);
      isStarred = false;
    }
    item.updatedAt = new Date().toISOString();
    return { id: item.id, isStarred };
  });
}

export async function listStarred(userId) {
  const database = await readDatabase();

  return database.files
    .filter(item =>
      !item.trashedAt &&
      (item.starredBy ?? []).includes(userId) &&
      getAccessRole(database, item, userId) !== null
    )
    .map(item => publicItem(item, userId));
}

export async function deletePermanently(userId, id) {
  return updateDatabase(async database => {
    const itemIndex = database.files.findIndex(file =>
      file.id === id &&
      file.ownerId === userId &&
      file.trashedAt
    );

    if (itemIndex === -1) {
      throw new DriveError(404, "Trashed item not found");
    }

    const [item] = database.files.splice(itemIndex, 1);

    if (item.kind === "file" && item.storageKey) {
      await deleteObject(item.storageKey).catch(() => {});
    }

    if (item.kind === "folder") {
      const descendantIds = getAllDescendantIds(database, item.id);
      for (const descId of descendantIds) {
        const descIndex = database.files.findIndex(file => file.id === descId);
        if (descIndex !== -1) {
          const [descItem] = database.files.splice(descIndex, 1);
          if (descItem.kind === "file" && descItem.storageKey) {
            await deleteObject(descItem.storageKey).catch(() => {});
          }
        }
      }
    }

    return { id, deleted: true };
  });
}

export async function emptyTrash(userId) {
  return updateDatabase(async database => {
    const trashed = database.files.filter(f => f.ownerId === userId && f.trashedAt);
    for (const item of trashed) {
      if (item.kind === "file" && item.storageKey) {
        await deleteObject(item.storageKey).catch(() => {});
      }
    }
    database.files = database.files.filter(f => !(f.ownerId === userId && f.trashedAt));
    return { clearedCount: trashed.length };
  });
}

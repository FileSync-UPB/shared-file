export function createFile({
  id,
  ownerId,
  parentId = null,
  name,
  mimeType,
  size,
  storageKey,
  kind = "file"
}) {
  const now = new Date().toISOString();

  return {
    id,
    ownerId,
    parentId,
    name,
    kind,
    mimeType,
    size,
    storageKey,
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
    permissions: []
  };
}
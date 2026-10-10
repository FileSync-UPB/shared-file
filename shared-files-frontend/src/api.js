
const API = "/api";

async function request(path, userId, options = {}) {
  const headers = new Headers(options.headers || {});

  if (userId) {
    headers.set("x-user-id", userId);
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = `Error HTTP ${response.status}`;

    try {
      const data = await response.json();
      message = data.error || data.message || message;
    } catch {
      // La respuesta no contiene JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response;
}

function jsonOptions(method, body) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const api = {
  health: () => request("/health"),

  list: (userId, parentId = null) => {
    const query = parentId
      ? `?parentId=${encodeURIComponent(parentId)}`
      : "";

    return request(`/files${query}`, userId);
  },

  usage: (userId) => request("/files/usage", userId),

  trash: (userId) => request("/files/trash", userId),

  shared: (userId) => request("/files/shared", userId),

  createFolder: (userId, name, parentId = null) =>
    request(
      "/files/folders",
      userId,
      jsonOptions("POST", { name, parentId })
    ),

  upload: (userId, file, parentId = null) => {
    const form = new FormData();

    form.append("file", file);

    if (parentId) {
      form.append("parentId", parentId);
    }

    return request("/files/upload", userId, {
      method: "POST",
      body: form,
    });
  },

  rename: (userId, id, name) =>
    request(
      `/files/files/${encodeURIComponent(id)}`,
      userId,
      jsonOptions("PATCH", { name })
    ),

  move: (userId, id, parentId) =>
    request(
      `/files/files/${encodeURIComponent(id)}`,
      userId,
      jsonOptions("PATCH", { parentId })
    ),

  trashItem: (userId, id) =>
    request(
      `/files/files/${encodeURIComponent(id)}`,
      userId,
      { method: "DELETE" }
    ),

  restore: (userId, id) =>
    request(
      `/files/trash/${encodeURIComponent(id)}/restore`,
      userId,
      { method: "POST" }
    ),

  permissions: (userId, id) =>
    request(
      `/files/${encodeURIComponent(id)}/permissions`,
      userId
    ),

  share: (userId, id, targetUserId, role) =>
    request(
      `/files/${encodeURIComponent(id)}/permissions`,
      userId,
      jsonOptions("POST", {
        userId: targetUserId,
        role,
      })
    ),

  revoke: (userId, id, targetUserId) =>
    request(
      `/files/${encodeURIComponent(id)}/permissions/${encodeURIComponent(targetUserId)}`,
      userId,
      { method: "DELETE" }
    ),

  // Obtiene el contenido original del archivo para visualizarlo.
  content: (userId, id) =>
    request(
      `/files/files/${encodeURIComponent(id)}/content`,
      userId
    ),

  // Descarga un archivo.
  download: async (userId, id, filename) => {
    const response = await request(
      `/files/files/${encodeURIComponent(id)}/content`,
      userId
    );

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename || "archivo";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

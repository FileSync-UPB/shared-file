
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Download,
  Eye,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  HardDrive,
  Home,
  LoaderCircle,
  LogOut,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { api } from "./api";

const getItems = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.files)) return data.files;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const getId = (item) =>
  item?.id ?? item?._id ?? item?.fileId ?? item?.folderId;

const getName = (item) =>
  item?.name ?? item?.filename ?? item?.originalName ?? "Archivo sin nombre";

const isFolder = (item) =>
  item?.type === "folder" ||
  item?.isFolder === true ||
  item?.mimeType === "inode/directory";

const getSize = (item) =>
  Number(item?.size ?? item?.fileSize ?? 0);

const getMime = (item) =>
  String(item?.mimeType ?? item?.mimetype ?? item?.mime ?? "").toLowerCase();

const getExtension = (name) => {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString();
};

function getPreviewKind(item) {
  const mime = getMime(item);
  const extension = getExtension(getName(item));

  if (mime.startsWith("image/") || [
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"
  ].includes(extension)) {
    return "image";
  }

  if (mime.startsWith("video/") || [
    "mp4", "webm", "ogg", "ogv", "mov", "m4v", "mkv"
  ].includes(extension)) {
    return "video";
  }

  if (mime.startsWith("audio/") || [
    "mp3", "wav", "ogg", "oga", "m4a", "aac", "flac"
  ].includes(extension)) {
    return "audio";
  }

  if (mime === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (
    mime.startsWith("text/") ||
    [
      "txt", "md", "csv", "json", "js", "jsx", "ts", "tsx",
      "css", "html", "xml", "yml", "yaml", "log", "java",
      "c", "cpp", "h", "py", "sql"
    ].includes(extension)
  ) {
    return "text";
  }

  return "unsupported";
}

function FileIcon({ item }) {
  if (isFolder(item)) {
    return <Folder size={20} />;
  }

  const kind = getPreviewKind(item);

  if (kind === "image") return <FileImage size={20} />;
  if (kind === "video") return <FileVideo size={20} />;
  if (kind === "audio") return <FileAudio size={20} />;
  if (kind === "text" || kind === "pdf") return <FileText size={20} />;

  return <File size={20} />;
}

function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={wide ? { width: "min(1000px, 95vw)", maxWidth: "1000px" } : undefined}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            type="button"
            title="Cerrar"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function PreviewContent({ kind, url, text, filename }) {
  const mediaStyle = {
    display: "block",
    maxWidth: "100%",
    maxHeight: "65vh",
    margin: "0 auto",
    objectFit: "contain",
  };

  if (kind === "image") {
    return (
      <img
        src={url}
        alt={filename}
        style={{ ...mediaStyle, width: "100%" }}
      />
    );
  }

  if (kind === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        style={{ ...mediaStyle, width: "100%", background: "#111" }}
      >
        Tu navegador no puede reproducir este video.
      </video>
    );
  }

  if (kind === "audio") {
    return (
      <div style={{ padding: "30px 10px", textAlign: "center" }}>
        <FileAudio size={52} style={{ marginBottom: 20 }} />
        <p>{filename}</p>
        <audio src={url} controls style={{ width: "100%" }}>
          Tu navegador no puede reproducir este audio.
        </audio>
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <iframe
        src={url}
        title={filename}
        style={{
          width: "100%",
          height: "70vh",
          border: 0,
          background: "#fff",
        }}
      />
    );
  }

  if (kind === "text") {
    return (
      <pre
        style={{
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          overflow: "auto",
          maxHeight: "65vh",
          padding: 18,
          borderRadius: 8,
          background: "var(--surface-secondary, #f4f4f5)",
          textAlign: "left",
          fontSize: 13,
        }}
      >
        {text}
      </pre>
    );
  }

  return (
    <div style={{ padding: 30, textAlign: "center" }}>
      <File size={44} />
      <p>No hay vista previa disponible para este formato.</p>
      <p style={{ opacity: 0.7 }}>
        Puedes descargar el archivo para abrirlo con una aplicación compatible.
      </p>
    </div>
  );
}

export default function App() {
  const [userId, setUserId] = useState("usuario-1");
  const [section, setSection] = useState("drive");
  const [parentId, setParentId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [items, setItems] = useState([]);
  const [trashItems, setTrashItems] = useState([]);
  const [sharedItems, setSharedItems] = useState([]);
  const [usage, setUsage] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [modal, setModal] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [shareTargetUser, setShareTargetUser] = useState("");
  const [shareRole, setShareRole] = useState("viewer");
  const [permissions, setPermissions] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);

  const [previewUrl, setPreviewUrl] = useState("");
  const [previewKind, setPreviewKind] = useState("unsupported");
  const [previewText, setPreviewText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const uploadRef = useRef(null);
  const previewUrlRef = useRef("");

  const releasePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }

    setPreviewUrl("");
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setSelectedItem(null);
    setPreviewText("");
    setPreviewError("");
    setPreviewLoading(false);
    releasePreviewUrl();
  }, [releasePreviewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const loadDrive = useCallback(async () => {
    const results = await Promise.allSettled([
      api.list(userId, parentId),
      api.usage(userId),
    ]);

    if (results[0].status === "fulfilled") {
      setItems(getItems(results[0].value));
    } else {
      throw results[0].reason;
    }

    if (results[1].status === "fulfilled") {
      setUsage(results[1].value);
    }
  }, [userId, parentId]);

  const loadSection = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (section === "drive") {
        await loadDrive();
      } else if (section === "trash") {
        const data = await api.trash(userId);
        setTrashItems(getItems(data));
      } else if (section === "shared") {
        const data = await api.shared(userId);
        setSharedItems(getItems(data));
      }
    } catch (err) {
      setError(err?.message || "No se pudieron cargar los archivos.");
    } finally {
      setLoading(false);
    }
  }, [section, userId, loadDrive]);

  useEffect(() => {
    loadSection();
  }, [loadSection]);

  const notify = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const navigateSection = (nextSection) => {
    setSection(nextSection);
    setParentId(null);
    setBreadcrumbs([]);
    setQuery("");
  };

  const openFolder = (folder) => {
    const id = getId(folder);

    if (id == null) {
      setError("No se encontró el identificador de la carpeta.");
      return;
    }

    setBreadcrumbs((previous) => [
      ...previous,
      { id, name: getName(folder) },
    ]);
    setParentId(id);
  };

  const goToBreadcrumb = (index) => {
    if (index < 0) {
      setParentId(null);
      setBreadcrumbs([]);
      return;
    }

    const crumb = breadcrumbs[index];
    setParentId(crumb.id);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
  };

  const openPreview = async (item) => {
    if (isFolder(item)) return;

    const id = getId(item);

    if (id == null) {
      setError("No se encontró el identificador del archivo.");
      return;
    }

    releasePreviewUrl();
    setSelectedItem(item);
    setPreviewKind(getPreviewKind(item));
    setPreviewText("");
    setPreviewError("");
    setPreviewLoading(true);
    setModal("preview");

    try {
      const response = await api.content(userId, id);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      previewUrlRef.current = url;
      setPreviewUrl(url);

      const kind = getPreviewKind(item);
      setPreviewKind(kind);

      if (kind === "text") {
        const text = await blob.text();
        setPreviewText(text);
      }
    } catch (err) {
      setPreviewError(
        err?.message || "No se pudo cargar la vista previa del archivo."
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadItem = async (item) => {
    const id = getId(item);

    if (id == null) {
      setError("No se encontró el identificador del archivo.");
      return;
    }

    setBusy(true);

    try {
      await api.download(userId, id, getName(item));
      notify("Descarga iniciada.");
    } catch (err) {
      setError(err?.message || "No se pudo descargar el archivo.");
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async (event) => {
    event.preventDefault();

    const name = folderName.trim();

    if (!name) {
      setError("Escribe un nombre para la carpeta.");
      return;
    }

    setBusy(true);

    try {
      await api.createFolder(userId, name, parentId);
      setFolderName("");
      closeModal();
      await loadSection();
      notify("Carpeta creada correctamente.");
    } catch (err) {
      setError(err?.message || "No se pudo crear la carpeta.");
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (event) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) return;

    setBusy(true);
    setError("");

    try {
      for (const file of files) {
        await api.upload(userId, file, parentId);
      }

      await loadSection();
      notify(files.length === 1 ? "Archivo subido." : "Archivos subidos.");
    } catch (err) {
      setError(err?.message || "No se pudieron subir los archivos.");
    } finally {
      setBusy(false);

      if (uploadRef.current) {
        uploadRef.current.value = "";
      }
    }
  };

  const renameItem = async (event) => {
    event.preventDefault();

    const id = getId(selectedItem);
    const name = renameName.trim();

    if (!id || !name) {
      setError("Escribe un nombre válido.");
      return;
    }

    setBusy(true);

    try {
      await api.rename(userId, id, name);
      closeModal();
      await loadSection();
      notify("Elemento renombrado.");
    } catch (err) {
      setError(err?.message || "No se pudo renombrar el elemento.");
    } finally {
      setBusy(false);
    }
  };

  const moveToTrash = async (item) => {
    const id = getId(item);

    if (id == null) return;

    if (!window.confirm(`¿Mover "${getName(item)}" a la papelera?`)) {
      return;
    }

    setBusy(true);

    try {
      await api.trashItem(userId, id);
      await loadSection();
      notify("Elemento movido a la papelera.");
    } catch (err) {
      setError(err?.message || "No se pudo mover a la papelera.");
    } finally {
      setBusy(false);
    }
  };

  const restoreItem = async (item) => {
    const id = getId(item);

    if (id == null) return;

    setBusy(true);

    try {
      await api.restore(userId, id);
      await loadSection();
      notify("Elemento restaurado.");
    } catch (err) {
      setError(err?.message || "No se pudo restaurar el elemento.");
    } finally {
      setBusy(false);
    }
  };

  const openRename = (item) => {
    setSelectedItem(item);
    setRenameName(getName(item));
    setModal("rename");
  };

  const openShare = async (item) => {
    setSelectedItem(item);
    setShareTargetUser("");
    setShareRole("viewer");
    setPermissions([]);
    setModal("share");
    setShareLoading(true);

    try {
      const data = await api.permissions(userId, getId(item));
      setPermissions(getItems(data));
    } catch (err) {
      setError(err?.message || "No se pudieron cargar los permisos.");
    } finally {
      setShareLoading(false);
    }
  };

  const shareItem = async (event) => {
    event.preventDefault();

    const target = shareTargetUser.trim();

    if (!target || !selectedItem) {
      setError("Introduce el identificador del usuario destinatario.");
      return;
    }

    setShareLoading(true);

    try {
      await api.share(
        userId,
        getId(selectedItem),
        target,
        shareRole
      );

      const data = await api.permissions(userId, getId(selectedItem));
      setPermissions(getItems(data));
      setShareTargetUser("");
      notify("Permiso compartido correctamente.");
    } catch (err) {
      setError(err?.message || "No se pudo compartir el elemento.");
    } finally {
      setShareLoading(false);
    }
  };

  const revokePermission = async (permission) => {
    const targetUserId =
      permission?.userId ??
      permission?.targetUserId ??
      permission?.user?.id;

    if (!targetUserId || !selectedItem) {
      setError("No se encontró el usuario del permiso.");
      return;
    }

    setShareLoading(true);

    try {
      await api.revoke(userId, getId(selectedItem), targetUserId);

      const data = await api.permissions(userId, getId(selectedItem));
      setPermissions(getItems(data));
      notify("Permiso revocado.");
    } catch (err) {
      setError(err?.message || "No se pudo revocar el permiso.");
    } finally {
      setShareLoading(false);
    }
  };

  const currentItems =
    section === "drive"
      ? items
      : section === "trash"
        ? trashItems
        : sharedItems;

  const filteredItems = currentItems.filter((item) =>
    getName(item).toLowerCase().includes(query.trim().toLowerCase())
  );

  const usedBytes = Number(
    usage?.usedBytes ??
    usage?.used ??
    usage?.totalSize ??
    usage?.storageUsed ??
    0
  );

  const quotaBytes = Number(
    usage?.quotaBytes ??
    usage?.quota ??
    usage?.storageLimit ??
    0
  );

  const usagePercent =
    quotaBytes > 0
      ? Math.min(100, (usedBytes / quotaBytes) * 100)
      : 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Play size={22} />
          </div>
          <div>
            <h2>StreamSpace</h2>
            <span>Almacenamiento personal</span>
          </div>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">ESPACIO DE TRABAJO</span>

          <button
            className={`nav-item ${section === "drive" ? "active" : ""}`}
            onClick={() => navigateSection("drive")}
          >
            <HardDrive size={18} />
            <span>Mis archivos</span>
          </button>

          <button
            className={`nav-item ${section === "shared" ? "active" : ""}`}
            onClick={() => navigateSection("shared")}
          >
            <Users size={18} />
            <span>Compartidos conmigo</span>
          </button>

          <button
            className={`nav-item ${section === "trash" ? "active" : ""}`}
            onClick={() => navigateSection("trash")}
          >
            <Trash2 size={18} />
            <span>Papelera</span>
          </button>
        </div>

        <div className="sidebar-storage">
          <div className="storage-heading">
            <HardDrive size={17} />
            <span>Almacenamiento</span>
          </div>

          <div className="storage-track">
            <div
              className="storage-fill"
              style={{ width: `${usagePercent}%` }}
            />
          </div>

          <p>
            {formatBytes(usedBytes)}
            {quotaBytes > 0 ? ` de ${formatBytes(quotaBytes)}` : " utilizados"}
          </p>
        </div>

        <div className="sidebar-bottom">
          <label className="user-switch-label" htmlFor="user-id">
            Usuario actual
          </label>

          <input
            id="user-id"
            className="user-switch-input"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              setParentId(null);
              setBreadcrumbs([]);
            }}
            placeholder="ID de usuario"
          />

          <button
            className="nav-item"
            onClick={() => loadSection()}
            title="Actualizar archivos"
          >
            <RefreshCw size={17} />
            <span>Actualizar</span>
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar archivos..."
              aria-label="Buscar archivos"
            />
            {query && (
              <button
                className="icon-button"
                onClick={() => setQuery("")}
                title="Limpiar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="topbar-user">
            <span>{userId}</span>
            <div className="avatar">
              {userId.slice(0, 1).toUpperCase() || "U"}
            </div>
          </div>
        </header>

        <div className="content">
          {error && (
            <div className="toast toast-error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                title="Cerrar mensaje"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {notice && (
            <div className="toast" role="status">
              <span>{notice}</span>
              <button
                className="icon-button"
                onClick={() => setNotice("")}
                title="Cerrar mensaje"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="page-heading">
            <div>
              <h1>
                {section === "drive"
                  ? "Mis archivos"
                  : section === "shared"
                    ? "Compartidos conmigo"
                    : "Papelera"}
              </h1>

              <p>
                {section === "drive"
                  ? "Administra tus archivos y carpetas."
                  : section === "shared"
                    ? "Archivos y carpetas compartidos contigo."
                    : "Recupera los elementos que has eliminado."}
              </p>
            </div>

            <div className="heading-actions">
              {section === "drive" && (
                <>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setFolderName("");
                      setModal("folder");
                    }}
                    disabled={busy}
                  >
                    <FolderPlus size={17} />
                    Nueva carpeta
                  </button>

                  <button
                    className="primary-button"
                    onClick={() => uploadRef.current?.click()}
                    disabled={busy}
                  >
                    <Upload size={17} />
                    Subir archivos
                  </button>

                  <input
                    ref={uploadRef}
                    type="file"
                    multiple
                    hidden
                    onChange={uploadFiles}
                  />
                </>
              )}

              <button
                className="icon-button"
                onClick={loadSection}
                title="Actualizar"
                disabled={loading}
              >
                <RefreshCw size={17} />
              </button>
            </div>
          </div>

          {section === "drive" && (
            <nav className="breadcrumbs" aria-label="Ruta de carpetas">
              <button onClick={() => goToBreadcrumb(-1)}>
                <Home size={15} />
                Mis archivos
              </button>

              {breadcrumbs.map((crumb, index) => (
                <span className="breadcrumb-part" key={crumb.id}>
                  <ChevronRight size={15} />
                  <button onClick={() => goToBreadcrumb(index)}>
                    {crumb.name}
                  </button>
                </span>
              ))}
            </nav>
          )}

          <div className="summary-row">
            <div className="summary-card">
              <div className="summary-icon">
                <File size={20} />
              </div>
              <div>
                <span>Elementos</span>
                <strong>{filteredItems.length}</strong>
              </div>
            </div>

            <div className="summary-card">
              <div className="summary-icon">
                <HardDrive size={20} />
              </div>
              <div>
                <span>Espacio utilizado</span>
                <strong>{formatBytes(usedBytes)}</strong>
              </div>
            </div>

            <div className="summary-card">
              <div className="summary-icon">
                <Activity size={20} />
              </div>
              <div>
                <span>Estado</span>
                <strong>{loading ? "Cargando..." : "Conectado"}</strong>
              </div>
            </div>
          </div>

          <section className="file-panel">
            <div className="file-panel-heading">
              <div>
                <h2>
                  {section === "trash"
                    ? "Elementos eliminados"
                    : section === "shared"
                      ? "Archivos compartidos"
                      : parentId
                        ? "Contenido de la carpeta"
                        : "Todos los archivos"}
                </h2>
                <p>{filteredItems.length} elementos</p>
              </div>
            </div>

            {loading ? (
              <div className="empty-state">
                <LoaderCircle className="spin" size={30} />
                <p>Cargando archivos...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="empty-state">
                {query ? <Search size={34} /> : <Folder size={34} />}
                <h3>{query ? "Sin resultados" : "No hay archivos aquí"}</h3>
                <p>
                  {query
                    ? "Prueba con otro término de búsqueda."
                    : section === "drive"
                      ? "Sube un archivo o crea una carpeta para comenzar."
                      : "Los elementos aparecerán aquí cuando estén disponibles."}
                </p>
              </div>
            ) : (
              <div className="file-table-wrap">
                <table className="file-table">
                  <thead className="file-table-head">
                    <tr>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>Tamaño</th>
                      <th>Fecha</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredItems.map((item, index) => {
                      const folder = isFolder(item);
                      const kind = getPreviewKind(item);

                      return (
                        <tr
                          className="file-row"
                          key={getId(item) ?? `${getName(item)}-${index}`}
                        >
                          <td>
                            <div className="file-name-cell">
                              <span className="file-icon">
                                <FileIcon item={item} />
                              </span>

                              <button
                                className="file-name-button"
                                title={folder ? "Abrir carpeta" : "Visualizar archivo"}
                                onClick={() =>
                                  folder ? openFolder(item) : openPreview(item)
                                }
                              >
                                {getName(item)}
                              </button>
                            </div>
                          </td>

                          <td>
                            {folder
                              ? "Carpeta"
                              : getMime(item) || getExtension(getName(item)).toUpperCase() || "Archivo"}
                          </td>

                          <td>{folder ? "—" : formatBytes(getSize(item))}</td>

                          <td>
                            {formatDate(
                              item?.updatedAt ??
                              item?.createdAt ??
                              item?.modifiedAt
                            )}
                          </td>

                          <td>
                            <div className="row-actions">
                              {section === "trash" ? (
                                <button
                                  className="icon-button"
                                  title="Restaurar"
                                  onClick={() => restoreItem(item)}
                                  disabled={busy}
                                >
                                  <RotateCcw size={17} />
                                </button>
                              ) : (
                                <>
                                  {!folder && (
                                    <>
                                      <button
                                        className="icon-button"
                                        title="Visualizar"
                                        onClick={() => openPreview(item)}
                                      >
                                        <Eye size={17} />
                                      </button>

                                      <button
                                        className="icon-button"
                                        title="Descargar"
                                        onClick={() => downloadItem(item)}
                                        disabled={busy}
                                      >
                                        <Download size={17} />
                                      </button>
                                    </>
                                  )}

                                  {section === "drive" && (
                                    <>
                                      <button
                                        className="icon-button"
                                        title="Renombrar"
                                        onClick={() => openRename(item)}
                                      >
                                        <Pencil size={17} />
                                      </button>

                                      <button
                                        className="icon-button"
                                        title="Compartir"
                                        onClick={() => openShare(item)}
                                      >
                                        <Share2 size={17} />
                                      </button>

                                      <button
                                        className="icon-button"
                                        title="Mover a la papelera"
                                        onClick={() => moveToTrash(item)}
                                        disabled={busy}
                                      >
                                        <Trash2 size={17} />
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      {modal === "folder" && (
        <Modal title="Crear carpeta" onClose={closeModal}>
          <form className="modal-form" onSubmit={createFolder}>
            <label htmlFor="folder-name">Nombre de la carpeta</label>
            <input
              id="folder-name"
              autoFocus
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Ej. Videos favoritos"
              required
            />

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeModal}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={busy}
              >
                {busy ? "Creando..." : "Crear carpeta"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "rename" && (
        <Modal title="Renombrar elemento" onClose={closeModal}>
          <form className="modal-form" onSubmit={renameItem}>
            <label htmlFor="rename-name">Nuevo nombre</label>
            <input
              id="rename-name"
              autoFocus
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              required
            />

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeModal}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={busy}
              >
                {busy ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "share" && (
        <Modal title="Compartir elemento" onClose={closeModal}>
          <div className="modal-form">
            <p>
              <strong>{getName(selectedItem || {})}</strong>
            </p>

            <form onSubmit={shareItem} className="modal-form">
              <label htmlFor="share-user">ID del usuario destinatario</label>
              <input
                id="share-user"
                value={shareTargetUser}
                onChange={(event) => setShareTargetUser(event.target.value)}
                placeholder="Ej. usuario-2"
                required
              />

              <label htmlFor="share-role">Permiso</label>
              <select
                id="share-role"
                value={shareRole}
                onChange={(event) => setShareRole(event.target.value)}
              >
                <option value="viewer">Solo lectura</option>
                <option value="editor">Puede editar</option>
              </select>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeModal}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={shareLoading}
                >
                  {shareLoading ? "Compartiendo..." : "Compartir"}
                </button>
              </div>
            </form>

            <h3>Permisos actuales</h3>

            {shareLoading && permissions.length === 0 ? (
              <p>Cargando permisos...</p>
            ) : permissions.length === 0 ? (
              <p>No hay permisos adicionales registrados.</p>
            ) : (
              <ul style={{ paddingLeft: 20 }}>
                {permissions.map((permission, index) => {
                  const target =
                    permission?.userId ??
                    permission?.targetUserId ??
                    permission?.user?.id ??
                    permission?.user?.name ??
                    "Usuario";

                  return (
                    <li
                      key={`${target}-${index}`}
                      style={{
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <span>
                        {target} — {permission?.role ?? "viewer"}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        title="Revocar permiso"
                        onClick={() => revokePermission(permission)}
                        disabled={shareLoading}
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Modal>
      )}

      {modal === "preview" && (
        <Modal
          title={getName(selectedItem || {})}
          onClose={closeModal}
          wide
        >
          <div style={{ padding: 12 }}>
            {previewLoading ? (
              <div className="empty-state">
                <LoaderCircle className="spin" size={30} />
                <p>Cargando vista previa...</p>
              </div>
            ) : previewError ? (
              <div className="empty-state">
                <File size={36} />
                <p>{previewError}</p>
              </div>
            ) : (
              <>
                <PreviewContent
                  kind={previewKind}
                  url={previewUrl}
                  text={previewText}
                  filename={getName(selectedItem || {})}
                />

                {previewKind === "video" &&
                  getExtension(getName(selectedItem || {})) === "mkv" && (
                    <p style={{ marginTop: 14, opacity: 0.75 }}>
                      Algunos navegadores no reproducen archivos MKV. Si no
                      funciona, descarga el video o conviértelo a MP4.
                    </p>
                  )}

                <div className="modal-actions">
                  {previewKind === "unsupported" && (
                    <button
                      className="primary-button"
                      onClick={() => downloadItem(selectedItem)}
                      disabled={busy}
                    >
                      <Download size={17} />
                      Descargar archivo
                    </button>
                  )}

                  <button
                    className="secondary-button"
                    onClick={closeModal}
                  >
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

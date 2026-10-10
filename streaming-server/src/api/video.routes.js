
import { Router } from "express";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { VideoService } from "../application/video.service.js";

const router = Router();
const videoService = new VideoService();

const videosDirectory = path.resolve(
  process.cwd(),
  "storage",
  "videos"
);

router.get("/", (req, res) => {
  res.status(200).json(videoService.getAllVideos());
});

router.get("/:id/stream", async (req, res) => {
  try {
    const video = videoService.getVideoById(req.params.id);

    if (!video) {
      return res.status(404).json({
        error: "Vídeo no encontrado"
      });
    }

    // El nombre del archivo procede del catálogo del servidor.
    const videoPath = path.resolve(
      videosDirectory,
      video.filename
    );

    // Evita que la ruta del archivo salga del directorio de vídeos.
    if (!videoPath.startsWith(videosDirectory + path.sep)) {
      return res.status(400).json({
        error: "Ruta de vídeo no válida"
      });
    }

    const stats = await fs.stat(videoPath);

    if (!stats.isFile()) {
      return res.status(404).json({
        error: "Archivo de vídeo no encontrado"
      });
    }

    const fileSize = stats.size;
    const range = req.headers.range;

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Accept-Ranges", "bytes");

    // Si no se solicita un rango, se envía el archivo completo.
    if (!range) {
      res.setHeader("Content-Length", fileSize);
      return createReadStream(videoPath).pipe(res);
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);

    if (!match || (!match[1] && !match[2])) {
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      return res.status(416).end();
    }

    let start;
    let end;

    if (match[1] === "") {
      // Ejemplo: bytes=-500 (los últimos 500 bytes).
      const suffixLength = Number(match[2]);

      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        res.setHeader("Content-Range", `bytes */${fileSize}`);
        return res.status(416).end();
      }

      start = Math.max(fileSize - suffixLength, 0);
      end = fileSize - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? fileSize - 1 : Number(match[2]);
      end = Math.min(end, fileSize - 1);
    }

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= fileSize ||
      end < start
    ) {
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      return res.status(416).end();
    }

    res.status(206);
    res.setHeader(
      "Content-Range",
      `bytes ${start}-${end}/${fileSize}`
    );
    res.setHeader("Content-Length", end - start + 1);

    const stream = createReadStream(videoPath, { start, end });

    stream.on("error", (error) => {
      console.error("Error leyendo el vídeo:", error);

      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.destroy(error);
      }
    });

    stream.pipe(res);
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({
        error: "Archivo de vídeo no encontrado"
      });
    }

    console.error("Error al reproducir el vídeo:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Error interno al reproducir el vídeo"
      });
    } else {
      res.destroy(error);
    }
  }
});

router.get("/:id", (req, res) => {
  const video = videoService.getVideoById(req.params.id);

  if (!video) {
    return res.status(404).json({
      error: "Vídeo no encontrado"
    });
  }

  res.status(200).json(video);
});

export default router;

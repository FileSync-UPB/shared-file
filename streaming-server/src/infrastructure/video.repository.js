import { Video } from "../domain/video.js";

const videos = [
  new Video({
    id: "1",
    title: "Introducción al proyecto HPC",
    description: "Vídeo de demostración del servicio Streaming.",
    filename: "introduccion.mp4",
    ownerId: "user-1"
  }),
  new Video({
    id: "2",
    title: "Presentación científica",
    description: "Ejemplo de presentación de resultados científicos.",
    filename: "presentacion.mp4",
    ownerId: "user-2"
  })
];

export class VideoRepository {
  findAll() {
    return videos;
  }

  findById(id) {
    return videos.find((video) => video.id === id) ?? null;
  }
}
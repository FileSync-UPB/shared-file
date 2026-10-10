import { VideoRepository } from "../infrastructure/video.repository.js";

const videoRepository = new VideoRepository();

export class VideoService {
  getAllVideos() {
    return videoRepository.findAll();
  }

  getVideoById(id) {
    return videoRepository.findById(id);
  }
}
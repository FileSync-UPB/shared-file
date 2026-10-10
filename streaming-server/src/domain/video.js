export class Video {
  constructor({ id, title, description, filename, ownerId }) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.filename = filename;
    this.ownerId = ownerId;
  }
}
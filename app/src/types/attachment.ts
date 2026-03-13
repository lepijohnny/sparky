export interface PendingAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  thumbnailUrl: string | null;
  filePath: string;
}

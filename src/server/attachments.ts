import fs from "node:fs";
import path from "node:path";
import mime from "mime-types";
import type { NotebookDb } from "./db.js";
import type { AttachmentRef, ChatSession } from "./types.js";

const DATA_IMAGE_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/g;
const LONG_BASE64_RE = /\b(?:[A-Za-z0-9+/]{80,}={0,2}){15,}\b/g;

export function sanitizeLargeInlineData(content: string) {
  let redactions = 0;
  const withoutImages = content.replace(DATA_IMAGE_RE, () => {
    redactions += 1;
    return "[숨겨진 대용량 이미지 데이터]";
  });
  const sanitized = withoutImages.replace(LONG_BASE64_RE, (match) => {
    if (match.length < 1200) return match;
    redactions += 1;
    return "[숨겨진 대용량 base64 데이터]";
  });
  return {
    content: sanitized,
    redactions,
    collapsed: sanitized.length > 10000 || sanitized.split(/\r?\n/).length > 200
  };
}

export function getSessionAttachmentDir(session: ChatSession, workspacePath: string) {
  return path.join(workspacePath, ".codex-notebook", "attachments", session.id);
}

export function copyUploadedFile(params: {
  db: NotebookDb;
  session: ChatSession;
  workspacePath: string;
  tempPath: string;
  originalName: string;
  size: number;
  mimeType?: string;
}): AttachmentRef {
  const targetDir = getSessionAttachmentDir(params.session, params.workspacePath);
  fs.mkdirSync(targetDir, { recursive: true });
  const safeName = params.originalName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  const targetPath = path.join(targetDir, `${Date.now()}-${safeName}`);
  fs.copyFileSync(params.tempPath, targetPath);
  fs.rmSync(params.tempPath, { force: true });

  const detectedMime = params.mimeType || mime.lookup(targetPath) || "application/octet-stream";
  const isImage = String(detectedMime).startsWith("image/");

  return params.db.addAttachment({
    sessionId: params.session.id,
    type: isImage ? "image" : "file",
    filename: safeName,
    filePath: targetPath,
    thumbnailPath: isImage ? targetPath : undefined,
    mimeType: String(detectedMime),
    size: params.size
  });
}

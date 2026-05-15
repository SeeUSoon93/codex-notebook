import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mime from "mime-types";
import type { NotebookDb } from "./db.js";
import type { AttachmentRef, ChatSession } from "./types.js";

const DATA_IMAGE_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/g;
const LONG_BASE64_RE = /\b(?:[A-Za-z0-9+/]{80,}={0,2}){15,}\b/g;
const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;
const IMAGE_EXTENSIONS = new Set([".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

function normalizeOriginalName(name: string) {
  const latin1Decoded = Buffer.from(name, "latin1").toString("utf8");
  const decodedLooksBetter =
    !latin1Decoded.includes("�") &&
    (/[가-힣]/.test(latin1Decoded) || /[^\x00-\x7F]/.test(latin1Decoded)) &&
    !/[가-힣]/.test(name);
  return decodedLooksBetter ? latin1Decoded : name;
}

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

function extensionFromMime(mimeType: string) {
  const extension = mime.extension(mimeType);
  return extension ? `.${extension}` : ".bin";
}

function isPathInside(child: string, parent: string) {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeMarkdownImageTarget(raw: string) {
  const withoutTitle = raw.trim().replace(/^<|>$/g, "").replace(/^["']|["']$/g, "");
  if (/^https?:\/\//i.test(withoutTitle) || /^data:/i.test(withoutTitle)) return undefined;
  if (/^file:\/\//i.test(withoutTitle)) {
    try {
      return decodeURIComponent(withoutTitle.replace(/^file:\/+/i, ""));
    } catch {
      return withoutTitle.replace(/^file:\/+/i, "");
    }
  }
  return withoutTitle;
}

export function attachImageFile(params: {
  db: NotebookDb;
  session: ChatSession;
  sourcePath: string;
  targetDir: string;
  index: number;
}) {
  const stat = fs.statSync(params.sourcePath);
  const detectedMime = mime.lookup(params.sourcePath) || "image/png";
  const safeName = path.basename(params.sourcePath).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  const targetPath = isPathInside(params.sourcePath, params.targetDir)
    ? params.sourcePath
    : path.join(params.targetDir, `generated-${Date.now()}-${params.index}-${safeName}`);
  if (targetPath !== params.sourcePath) fs.copyFileSync(params.sourcePath, targetPath);

  return params.db.addAttachment({
    sessionId: params.session.id,
    type: "image",
    filename: path.basename(targetPath),
    filePath: targetPath,
    thumbnailPath: targetPath,
    mimeType: String(detectedMime),
    size: stat.size
  });
}

export function extractInlineDataToAttachments(params: {
  db: NotebookDb;
  session: ChatSession;
  workspacePath: string;
  content: string;
}) {
  const targetDir = getSessionAttachmentDir(params.session, params.workspacePath);
  fs.mkdirSync(targetDir, { recursive: true });
  const attachments: AttachmentRef[] = [];
  let index = 0;

  const withoutInlineImages = params.content.replace(DATA_IMAGE_RE, (match) => {
    const header = match.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    if (!header) return "[숨겨진 대용량 이미지 데이터]";
    const mimeType = header[1];
    const base64 = match.slice(header[0].length).replace(/\s/g, "");
    try {
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) return "[숨겨진 대용량 이미지 데이터]";
      index += 1;
      const filename = `generated-${Date.now()}-${index}${extensionFromMime(mimeType)}`;
      const filePath = path.join(targetDir, filename);
      fs.writeFileSync(filePath, buffer);
      attachments.push(
        params.db.addAttachment({
          sessionId: params.session.id,
          type: "image",
          filename,
          filePath,
          thumbnailPath: filePath,
          mimeType,
          size: buffer.length
        })
      );
      return `[이미지 저장됨: ${filename}]`;
    } catch {
      return "[숨겨진 대용량 이미지 데이터]";
    }
  });

  const seenReferencedImages = new Map<string, AttachmentRef>();
  const withReferencedImages = withoutInlineImages.replace(MARKDOWN_IMAGE_RE, (match, target) => {
    const normalized = normalizeMarkdownImageTarget(target);
    if (!normalized) return match;
    const resolved = path.resolve(params.workspacePath, normalized);
    if (!isPathInside(resolved, params.workspacePath)) return match;
    if (!IMAGE_EXTENSIONS.has(path.extname(resolved).toLowerCase()) || !fs.existsSync(resolved)) return match;

    try {
      const existing = seenReferencedImages.get(resolved);
      if (existing) return `[이미지 저장됨: ${existing.filename}]`;
      index += 1;
      const attachment = attachImageFile({
        db: params.db,
        session: params.session,
        sourcePath: resolved,
        targetDir,
        index
      });
      seenReferencedImages.set(resolved, attachment);
      attachments.push(attachment);
      return `[이미지 저장됨: ${attachment.filename}]`;
    } catch {
      return match;
    }
  });

  const sanitized = sanitizeLargeInlineData(withReferencedImages);
  return {
    ...sanitized,
    attachments
  };
}

function getCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

export function listCodexGeneratedImages() {
  const root = path.join(getCodexHome(), "generated_images");
  const files: string[] = [];
  const queue = [root];
  let visited = 0;

  while (queue.length > 0 && visited < 5000) {
    const current = queue.shift()!;
    visited += 1;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  return files;
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
  const safeName = normalizeOriginalName(params.originalName).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
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

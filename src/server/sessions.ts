import type { NotebookDb } from "./db.js";
import type { ChatSession } from "./types.js";

export function getSessionWorkspace(db: NotebookDb, session: ChatSession) {
  const folder = db.getFolder(session.folderId);
  if (!folder) {
    throw new Error("세션의 workspace folder를 찾을 수 없습니다.");
  }
  return folder.path;
}

export function makeSessionTitle(prompt: string) {
  const title = prompt.trim().replace(/\s+/g, " ").slice(0, 36);
  return title || "새 작업";
}

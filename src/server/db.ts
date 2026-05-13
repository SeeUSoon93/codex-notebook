import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AttachmentRef,
  ChatMessage,
  ChatSession,
  Intelligence,
  PermissionMode,
  SkillCard,
  WorkspaceFolder
} from "./types.js";

const now = () => new Date().toISOString();

export function getAppDataDir() {
  const base =
    process.platform === "win32"
      ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
      : path.join(os.homedir(), ".local", "share");
  return path.join(base, "codex-notebook-local");
}

export function getDefaultWorkspacePath() {
  if (process.platform === "win32") {
    return path.join(os.homedir(), "CodexNotebook", "workspaces", "default");
  }
  return path.join(os.homedir(), "CodexNotebook", "workspaces", "default");
}

function rowToFolder(row: Record<string, unknown>): WorkspaceFolder {
  return {
    id: String(row.id),
    name: String(row.name),
    path: String(row.path),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function rowToSession(row: Record<string, unknown>): ChatSession {
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    title: String(row.title),
    codexSessionId: row.codex_session_id ? String(row.codex_session_id) : undefined,
    model: String(row.model),
    intelligence: row.intelligence as Intelligence,
    permissionMode: row.permission_mode as PermissionMode,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as ChatMessage["role"],
    content: String(row.content),
    collapsed: Boolean(row.collapsed),
    createdAt: String(row.created_at)
  };
}

function rowToAttachment(row: Record<string, unknown>): AttachmentRef {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    messageId: row.message_id ? String(row.message_id) : undefined,
    type: row.type as AttachmentRef["type"],
    filename: String(row.filename),
    filePath: String(row.file_path),
    thumbnailPath: row.thumbnail_path ? String(row.thumbnail_path) : undefined,
    mimeType: String(row.mime_type),
    size: Number(row.size),
    createdAt: String(row.created_at)
  };
}

export class NotebookDb {
  private db: Database.Database;

  constructor(dbPath = path.join(getAppDataDir(), "notebook.sqlite")) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
    this.seed();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        folder_id TEXT NOT NULL,
        title TEXT NOT NULL,
        codex_session_id TEXT,
        model TEXT NOT NULL,
        intelligence TEXT NOT NULL,
        permission_mode TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(folder_id) REFERENCES folders(id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        collapsed INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        message_id TEXT,
        type TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        thumbnail_path TEXT,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id),
        FOREIGN KEY(message_id) REFERENCES messages(id)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        prompt TEXT NOT NULL
      );
    `);
  }

  private seed() {
    const defaultFolder = this.ensureDefaultFolder();
    const sessionCount = this.db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number };
    if (sessionCount.count === 0) {
      this.createSession({
        folderId: defaultFolder.id,
        title: "새 작업",
        model: "gpt-5.5",
        intelligence: "normal",
        permissionMode: "workspace-write"
      });
    }

    const skills: SkillCard[] = [
      { id: "bugfix", title: "버그 수정", description: "재현, 원인, 수정, 검증 순서로 처리", prompt: "다음 문제를 재현 경로부터 확인하고 최소 수정으로 고쳐줘." },
      { id: "ui", title: "UI 개선", description: "레이아웃, 상태, 접근성 중심 개선", prompt: "현재 UI를 실제 사용 흐름 기준으로 다듬고 필요한 상태와 반응형 처리를 보완해줘." },
      { id: "refactor", title: "리팩터링", description: "동작 유지, 구조 정리", prompt: "동작은 유지하면서 중복과 책임 경계를 정리하는 리팩터링을 해줘." },
      { id: "tests", title: "테스트 작성", description: "위험 경로 중심 테스트 추가", prompt: "핵심 동작과 회귀 위험이 큰 부분을 우선해서 테스트를 추가해줘." },
      { id: "docs", title: "문서화", description: "설치, 사용, 설계 의도 정리", prompt: "현재 구현 기준으로 사용법과 유지보수에 필요한 문서를 정리해줘." },
      { id: "perf", title: "성능 개선", description: "병목 확인 후 개선", prompt: "성능 병목을 먼저 확인하고 체감 효과가 있는 개선을 적용해줘." },
      { id: "review", title: "PR 리뷰", description: "버그와 회귀 위험 중심 검토", prompt: "코드 리뷰 관점으로 버그, 회귀 위험, 누락된 테스트를 우선 찾아줘." },
      { id: "image", title: "이미지 생성", description: "프롬프트와 산출물 관리", prompt: "이미지 생성 요청을 구체적인 프롬프트와 파일 산출물 중심으로 처리해줘." }
    ];

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO skills (id, title, description, prompt)
      VALUES (@id, @title, @description, @prompt)
    `);
    const tx = this.db.transaction((items: SkillCard[]) => items.forEach((item) => insert.run(item)));
    tx(skills);
  }

  ensureDefaultFolder() {
    const defaultPath = getDefaultWorkspacePath();
    fs.mkdirSync(defaultPath, { recursive: true });
    const existing = this.db.prepare("SELECT * FROM folders WHERE path = ?").get(defaultPath) as Record<string, unknown> | undefined;
    if (existing) return rowToFolder(existing);

    const timestamp = now();
    const folder = {
      id: randomUUID(),
      name: "default",
      path: defaultPath,
      created_at: timestamp,
      updated_at: timestamp
    };
    this.db.prepare(`
      INSERT INTO folders (id, name, path, created_at, updated_at)
      VALUES (@id, @name, @path, @created_at, @updated_at)
    `).run(folder);
    return rowToFolder(folder);
  }

  listFolders() {
    return (this.db.prepare("SELECT * FROM folders ORDER BY name COLLATE NOCASE").all() as Record<string, unknown>[]).map(rowToFolder);
  }

  getFolder(id: string) {
    const row = this.db.prepare("SELECT * FROM folders WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? rowToFolder(row) : undefined;
  }

  upsertFolder(input: { name: string; path: string }) {
    fs.mkdirSync(input.path, { recursive: true });
    const existing = this.db.prepare("SELECT * FROM folders WHERE path = ?").get(input.path) as Record<string, unknown> | undefined;
    const timestamp = now();
    if (existing) {
      this.db.prepare("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?").run(input.name, timestamp, existing.id);
      return this.getFolder(String(existing.id))!;
    }
    const folder = {
      id: randomUUID(),
      name: input.name,
      path: input.path,
      created_at: timestamp,
      updated_at: timestamp
    };
    this.db.prepare(`
      INSERT INTO folders (id, name, path, created_at, updated_at)
      VALUES (@id, @name, @path, @created_at, @updated_at)
    `).run(folder);
    return rowToFolder(folder);
  }

  listSessions() {
    return (this.db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all() as Record<string, unknown>[]).map(rowToSession);
  }

  getSession(id: string) {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? rowToSession(row) : undefined;
  }

  createSession(input: {
    folderId: string;
    title: string;
    model: string;
    intelligence: Intelligence;
    permissionMode: PermissionMode;
  }) {
    const timestamp = now();
    const row = {
      id: randomUUID(),
      folder_id: input.folderId,
      title: input.title,
      codex_session_id: null,
      model: input.model,
      intelligence: input.intelligence,
      permission_mode: input.permissionMode,
      created_at: timestamp,
      updated_at: timestamp
    };
    this.db.prepare(`
      INSERT INTO sessions (id, folder_id, title, codex_session_id, model, intelligence, permission_mode, created_at, updated_at)
      VALUES (@id, @folder_id, @title, @codex_session_id, @model, @intelligence, @permission_mode, @created_at, @updated_at)
    `).run(row);
    return rowToSession(row);
  }

  updateSession(id: string, patch: Partial<Pick<ChatSession, "title" | "model" | "intelligence" | "permissionMode" | "codexSessionId">>) {
    const current = this.getSession(id);
    if (!current) return undefined;
    const updated = {
      title: patch.title ?? current.title,
      model: patch.model ?? current.model,
      intelligence: patch.intelligence ?? current.intelligence,
      permission_mode: patch.permissionMode ?? current.permissionMode,
      codex_session_id: patch.codexSessionId ?? current.codexSessionId ?? null,
      updated_at: now(),
      id
    };
    this.db.prepare(`
      UPDATE sessions
      SET title = @title,
          model = @model,
          intelligence = @intelligence,
          permission_mode = @permission_mode,
          codex_session_id = @codex_session_id,
          updated_at = @updated_at
      WHERE id = @id
    `).run(updated);
    return this.getSession(id);
  }

  listMessages(sessionId: string) {
    return (this.db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC").all(sessionId) as Record<string, unknown>[]).map(rowToMessage);
  }

  addMessage(input: { sessionId: string; role: ChatMessage["role"]; content: string; collapsed?: boolean }) {
    const timestamp = now();
    const row = {
      id: randomUUID(),
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      collapsed: input.collapsed ? 1 : 0,
      metadata: null,
      created_at: timestamp
    };
    this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, collapsed, metadata, created_at)
      VALUES (@id, @session_id, @role, @content, @collapsed, @metadata, @created_at)
    `).run(row);
    this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(timestamp, input.sessionId);
    return rowToMessage(row);
  }

  listAttachments(sessionId: string) {
    return (this.db.prepare("SELECT * FROM attachments WHERE session_id = ? ORDER BY created_at DESC").all(sessionId) as Record<string, unknown>[]).map(rowToAttachment);
  }

  getAttachment(id: string) {
    const row = this.db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? rowToAttachment(row) : undefined;
  }

  addAttachment(input: Omit<AttachmentRef, "id" | "createdAt">) {
    const timestamp = now();
    const row = {
      id: randomUUID(),
      session_id: input.sessionId,
      message_id: input.messageId ?? null,
      type: input.type,
      filename: input.filename,
      file_path: input.filePath,
      thumbnail_path: input.thumbnailPath ?? null,
      mime_type: input.mimeType,
      size: input.size,
      created_at: timestamp
    };
    this.db.prepare(`
      INSERT INTO attachments (id, session_id, message_id, type, filename, file_path, thumbnail_path, mime_type, size, created_at)
      VALUES (@id, @session_id, @message_id, @type, @filename, @file_path, @thumbnail_path, @mime_type, @size, @created_at)
    `).run(row);
    return rowToAttachment(row);
  }

  getSettings() {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    return Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<string, string>;
  }

  setSetting(key: string, value: string) {
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, now());
  }

  listSkills() {
    return this.db.prepare("SELECT * FROM skills ORDER BY rowid ASC").all() as SkillCard[];
  }
}

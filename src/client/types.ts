export type Intelligence = "fast" | "normal" | "deep" | "xhigh";
export type PermissionMode = "read-only" | "workspace-write" | "full-auto";

export type WorkspaceFolder = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatSession = {
  id: string;
  folderId: string;
  title: string;
  codexSessionId?: string;
  model: string;
  intelligence: Intelligence;
  permissionMode: PermissionMode;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachmentIds?: string[];
  durationMs?: number;
  collapsed: boolean;
  createdAt: string;
};

export type AttachmentRef = {
  id: string;
  sessionId: string;
  messageId?: string;
  type: "image" | "file";
  filename: string;
  filePath: string;
  thumbnailPath?: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type SkillCard = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  source?: "preset" | "skill" | "plugin";
  sourcePath?: string;
};

export type ParsedCodexStatus = {
  account?: string;
  planType?: string;
  model?: string;
  directory?: string;
  contextLeftPercent?: number;
  note?: string;
  source?: "app-server" | "tui";
  limits: Array<{
    label: string;
    leftPercent: number;
    usedPercent?: number;
    resetsAt: string;
    resetsAtIso?: string;
  }>;
  raw: string;
};

export type CodexCliState = {
  installed: boolean;
  loggedIn: boolean;
  version?: string;
  message?: string;
};

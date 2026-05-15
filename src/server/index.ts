import express from "express";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import multer from "multer";
import { WebSocketServer } from "ws";
import { NotebookDb, getAppDataDir } from "./db.js";
import { CodexCommandAdapter } from "./codex.js";
import {
  attachImageFile,
  copyUploadedFile,
  extractInlineDataToAttachments,
  listCodexGeneratedImages,
  sanitizeLargeInlineData
} from "./attachments.js";
import { getSessionWorkspace, makeSessionTitle } from "./sessions.js";
import { listAllSkills } from "./skills.js";
import { parseCodexAppServerStatus, parseCodexStatus } from "./status.js";
import { attachTerminal } from "./terminal.js";

type StartOptions = {
  port?: number;
  host?: string;
  openUrl?: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isDirectRun() {
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
}

function sendJsonError(res: express.Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

type CodexJsonEvent = {
  type?: string;
  thread_id?: string;
  item?: {
    type?: string;
    text?: string;
  };
  delta?: string;
};

function extractCodexEventText(event: CodexJsonEvent) {
  if (event.type === "item.completed" && event.item?.type === "agent_message") {
    return event.item.text || "";
  }
  if (
    (event.type === "item.delta" || event.type === "agent_message.delta" || event.type === "response.output_text.delta") &&
    typeof event.delta === "string"
  ) {
    return event.delta;
  }
  return "";
}

function cleanCodexDiagnostics(value: string) {
  const withoutWarnings = value
    .split(/\r?\n/)
    .filter((line) => !/^\d{4}-\d{2}-\d{2}T.*\bWARN\b/.test(line))
    .join("\n");
  return withoutWarnings
    .replace(/Reading additional input from stdin\.\.\./g, "")
    .replace(/<html>[\s\S]*?<\/html>/gi, "")
    .trim();
}

function isImageGenerationPrompt(prompt: string) {
  return /^\s*\$(?:imagegen|melancholic-smartphone-snapshot|commercial-illustration-style)\b/i.test(prompt);
}

function runDetached(command: string, args: string[]) {
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
}

function pickFolderPath() {
  return new Promise<string | undefined>((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("OS 폴더 선택창은 현재 Windows에서만 지원합니다."));
      return;
    }

    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = 'Codex Notebook workspace folder'",
      "$dialog.ShowNewFolderButton = $true",
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }"
    ].join("; ");

    execFile(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: false },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        const selected = stdout.trim();
        resolve(selected || undefined);
      }
    );
  });
}

export async function startServer(options: StartOptions = {}) {
  const port = options.port ?? Number(process.env.PORT || 3737);
  const host = options.host ?? "127.0.0.1";
  const db = new NotebookDb();
  const codex = new CodexCommandAdapter();
  const app = express();
  const upload = multer({ dest: path.join(getAppDataDir(), "tmp") });

  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/bootstrap", async (_req, res) => {
    const state = await codex.checkState();
    res.json({
      codex: state,
      folders: db.listFolders(),
      sessions: db.listSessions(),
      settings: db.getSettings(),
      skills: listAllSkills(),
      models: await codex.listModels()
    });
  });

  app.get("/api/skills", (_req, res) => {
    res.json({ skills: listAllSkills() });
  });

  app.get("/api/folders", (_req, res) => {
    res.json({ folders: db.listFolders() });
  });

  app.post("/api/folders", (req, res) => {
    const name = String(req.body?.name || "workspace");
    const folderPath = String(req.body?.path || "");
    if (!folderPath) return sendJsonError(res, 400, "폴더 경로가 필요합니다.");
    res.json({ folder: db.upsertFolder({ name, path: folderPath }) });
  });

  app.post("/api/folders/pick", async (_req, res) => {
    try {
      const folderPath = await pickFolderPath();
      if (!folderPath) {
        res.json({ cancelled: true });
        return;
      }
      const name = path.basename(folderPath) || "workspace";
      res.json({ folder: db.upsertFolder({ name, path: folderPath }) });
    } catch (error) {
      sendJsonError(res, 500, error instanceof Error ? error.message : "폴더 선택에 실패했습니다.");
    }
  });

  app.get("/api/sessions", (_req, res) => {
    res.json({ sessions: db.listSessions() });
  });

  app.post("/api/sessions", (req, res) => {
    const folderId = String(req.body?.folderId || "");
    const folder = db.getFolder(folderId);
    if (!folder) return sendJsonError(res, 404, "workspace folder를 찾을 수 없습니다.");
    const session = db.createSession({
      folderId,
      title: String(req.body?.title || "새 작업"),
      model: String(req.body?.model || "gpt-5.5"),
      intelligence: req.body?.intelligence || "normal",
      permissionMode: req.body?.permissionMode || "workspace-write"
    });
    res.json({ session });
  });

  app.patch("/api/sessions/:id", (req, res) => {
    const session = db.updateSession(req.params.id, req.body || {});
    if (!session) return sendJsonError(res, 404, "세션을 찾을 수 없습니다.");
    res.json({ session });
  });

  app.delete("/api/sessions/:id", (req, res) => {
    const deleted = db.deleteSession(req.params.id);
    if (!deleted) return sendJsonError(res, 404, "세션을 찾을 수 없습니다.");
    for (const attachment of deleted.attachments) {
      fs.rmSync(attachment.filePath, { force: true });
    }
    res.json({ ok: true, deletedSessionId: deleted.session.id, sessions: db.listSessions() });
  });

  app.get("/api/sessions/:id/messages", (req, res) => {
    if (!db.getSession(req.params.id)) return sendJsonError(res, 404, "세션을 찾을 수 없습니다.");
    const attachments = db.listAttachments(req.params.id);
    const messages = db.listMessages(req.params.id).map((message) => ({
      ...message,
      attachmentIds: attachments.filter((attachment) => attachment.messageId === message.id).map((attachment) => attachment.id)
    }));
    res.json({
      messages,
      attachments
    });
  });

  app.post("/api/sessions/:id/attachments", upload.array("files"), (req, res) => {
    const session = db.getSession(req.params.id);
    if (!session) return sendJsonError(res, 404, "세션을 찾을 수 없습니다.");
    const workspacePath = getSessionWorkspace(db, session);
    const files = (req.files || []) as Express.Multer.File[];
    const attachments = files.map((file) =>
      copyUploadedFile({
        db,
        session,
        workspacePath,
        tempPath: file.path,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      })
    );
    res.json({ attachments });
  });

  app.get("/api/sessions/:id/attachments", (req, res) => {
    if (!db.getSession(req.params.id)) return sendJsonError(res, 404, "세션을 찾을 수 없습니다.");
    res.json({ attachments: db.listAttachments(req.params.id) });
  });

  app.get("/api/attachments/:id/content", (req, res) => {
    const attachment = db.getAttachment(req.params.id);
    if (!attachment || !fs.existsSync(attachment.filePath)) {
      return sendJsonError(res, 404, "파일을 찾을 수 없습니다.");
    }
    res.type(attachment.mimeType);
    res.sendFile(attachment.filePath);
  });

  app.post("/api/attachments/:id/open", (req, res) => {
    const attachment = db.getAttachment(req.params.id);
    if (!attachment || !fs.existsSync(attachment.filePath)) {
      return sendJsonError(res, 404, "파일을 찾을 수 없습니다.");
    }
    if (process.platform === "win32") {
      runDetached("powershell.exe", ["-NoProfile", "-Command", "Start-Process -LiteralPath $args[0]", attachment.filePath]);
    } else if (process.platform === "darwin") {
      runDetached("open", [attachment.filePath]);
    } else {
      runDetached("xdg-open", [attachment.filePath]);
    }
    res.json({ ok: true });
  });

  app.post("/api/attachments/:id/reveal", (req, res) => {
    const attachment = db.getAttachment(req.params.id);
    if (!attachment || !fs.existsSync(attachment.filePath)) {
      return sendJsonError(res, 404, "파일을 찾을 수 없습니다.");
    }
    if (process.platform === "win32") {
      runDetached("explorer.exe", [`/select,${attachment.filePath}`]);
    } else if (process.platform === "darwin") {
      runDetached("open", ["-R", attachment.filePath]);
    } else {
      runDetached("xdg-open", [path.dirname(attachment.filePath)]);
    }
    res.json({ ok: true });
  });

  app.post("/api/attachments/:id/copy-path", (req, res) => {
    const attachment = db.getAttachment(req.params.id);
    if (!attachment) return sendJsonError(res, 404, "파일을 찾을 수 없습니다.");
    if (process.platform === "win32") {
      execFile("powershell.exe", ["-NoProfile", "-Command", "Set-Clipboard -Value $args[0]", attachment.filePath], (error) => {
        if (error) return sendJsonError(res, 500, error.message);
        res.json({ ok: true });
      });
      return;
    }
    res.json({ ok: true, path: attachment.filePath });
  });

  app.delete("/api/attachments/:id", (req, res) => {
    const attachment = db.deleteAttachment(req.params.id);
    if (!attachment) return sendJsonError(res, 404, "파일을 찾을 수 없습니다.");
    fs.rmSync(attachment.filePath, { force: true });
    res.json({ ok: true });
  });

  app.post("/api/settings", (req, res) => {
    const entries = Object.entries(req.body || {});
    for (const [key, value] of entries) {
      db.setSetting(key, String(value));
    }
    res.json({ settings: db.getSettings() });
  });

  app.get("/api/status", async (req, res) => {
    const sessionId = String(req.query.sessionId || "");
    const session = sessionId ? db.getSession(sessionId) : db.listSessions()[0];
    if (!session) return sendJsonError(res, 404, "세션을 찾을 수 없습니다.");
    const workspacePath = getSessionWorkspace(db, session);
    const result = await codex.readStatus(workspacePath);
    if (result.code !== 0) {
      return res.json({
        status: undefined,
        raw: `${result.stdout}\n${result.stderr}`.trim(),
        error: result.stderr || "Codex /status 실행에 실패했습니다."
      });
    }
    res.json({
      status: result.appStatus
        ? parseCodexAppServerStatus(result.appStatus)
        : parseCodexStatus(result.stdout || result.stderr)
    });
  });

  const clientDist = path.resolve(__dirname, "../../client");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.type("html").send(`
        <h1>Codex Notebook Local</h1>
        <p>개발 모드에서는 <code>npm run dev</code>로 Vite 클라이언트를 함께 실행하세요.</p>
      `);
    });
  }

  const server = http.createServer(app);
  const terminalWss = new WebSocketServer({ noServer: true });
  const codexWss = new WebSocketServer({ noServer: true });

  terminalWss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const session = db.getSession(url.searchParams.get("sessionId") || "");
    if (!session) {
      ws.send(JSON.stringify({ type: "error", message: "세션을 찾을 수 없습니다." }));
      ws.close();
      return;
    }
    attachTerminal(ws, getSessionWorkspace(db, session));
  });

  codexWss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      const payload = JSON.parse(raw.toString()) as { sessionId: string; prompt: string; attachmentIds?: string[] };
      const session = db.getSession(payload.sessionId);
      if (!session) {
        ws.send(JSON.stringify({ type: "error", message: "세션을 찾을 수 없습니다." }));
        ws.close();
        return;
      }

      const workspacePath = getSessionWorkspace(db, session);
      const userContent = sanitizeLargeInlineData(payload.prompt);
      const messageAttachments = (payload.attachmentIds || [])
        .map((id) => db.getAttachment(id))
        .filter((attachment): attachment is NonNullable<ReturnType<typeof db.getAttachment>> =>
          Boolean(attachment && attachment.sessionId === session.id)
        );
      const userMessage = db.addMessage({
        sessionId: session.id,
        role: "user",
        content: userContent.content,
        collapsed: userContent.collapsed
      });
      db.linkAttachmentsToMessage(session.id, userMessage.id, messageAttachments.map((attachment) => attachment.id));

      if (session.title === "새 작업") {
        const titleSource = payload.prompt || messageAttachments.map((attachment) => attachment.filename).join(" ");
        db.updateSession(session.id, { title: makeSessionTitle(titleSource) });
      }

      const attachmentPrompt = messageAttachments.length > 0
        ? `\n\n첨부 파일:\n${messageAttachments.map((attachment) => `- ${attachment.filePath}`).join("\n")}`
        : "";
      const generatedImagesBeforeRun = new Set(listCodexGeneratedImages());
      const child = codex.spawnExec(session, `${userContent.content}${attachmentPrompt}`.trim(), workspacePath);
      let stdoutBuffer = "";
      let collectedAgentText = "";
      let collectedStderr = "";
      let codexThreadId = session.codexSessionId;

      const handleCodexEvent = (event: CodexJsonEvent) => {
        if (event.type === "thread.started" && event.thread_id) {
          codexThreadId = event.thread_id;
          db.updateSession(session.id, { codexSessionId: event.thread_id });
        }

        const text = extractCodexEventText(event);
        if (!text) return;
        const cleaned = sanitizeLargeInlineData(text);
        collectedAgentText += cleaned.content;
        ws.send(JSON.stringify({ type: "chunk", stream: "stdout", data: cleaned.content }));
      };

      const readJsonEvents = (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            handleCodexEvent(JSON.parse(line) as CodexJsonEvent);
          } catch {
            collectedStderr += `${line}\n`;
          }
        }
      };

      child.stdout.on("data", (chunk: Buffer) => readJsonEvents(chunk));
      child.stderr.on("data", (chunk: Buffer) => {
        collectedStderr += chunk.toString();
      });
      child.on("error", (error) => {
        ws.send(JSON.stringify({ type: "error", message: error.message }));
      });
      child.on("close", (code) => {
        if (stdoutBuffer.trim()) {
          try {
            handleCodexEvent(JSON.parse(stdoutBuffer) as CodexJsonEvent);
          } catch {
            collectedStderr += `${stdoutBuffer}\n`;
          }
        }

        const finalDiagnostics = cleanCodexDiagnostics(collectedStderr);
        const finalContent =
          collectedAgentText.trim() || (code === 0 ? "" : finalDiagnostics) || (code === 0 ? "" : `Codex exited with code ${code}`);
        const sanitized = extractInlineDataToAttachments({
          db,
          session,
          workspacePath,
          content: finalContent
        });
        const newCodexGeneratedImages = listCodexGeneratedImages()
          .filter((filePath) => !generatedImagesBeforeRun.has(filePath))
          .map((filePath, index) =>
            attachImageFile({
              db,
              session,
              sourcePath: filePath,
              targetDir: path.join(workspacePath, ".codex-notebook", "attachments", session.id),
              index: index + 1
            })
          );
        const generatedAttachmentIds = [...sanitized.attachments, ...newCodexGeneratedImages].map((attachment) => attachment.id);
        const messageContent =
          sanitized.content.trim() || generatedAttachmentIds.length > 0
            ? sanitized.content
            : isImageGenerationPrompt(payload.prompt)
              ? "이미지 생성 결과를 찾지 못했습니다. 현재 로컬 Codex CLI 실행에서 이미지 산출 파일이 생성되지 않았습니다."
              : "";
        const message = db.addMessage({
          sessionId: session.id,
          role: "assistant",
          content: messageContent,
          collapsed: sanitized.collapsed
        });
        if (codexThreadId && codexThreadId !== session.codexSessionId) {
          db.updateSession(session.id, { codexSessionId: codexThreadId });
        }
        db.linkAttachmentsToMessage(session.id, message.id, generatedAttachmentIds);
        ws.send(JSON.stringify({
          type: "done",
          code,
          userMessage: {
            ...userMessage,
            attachmentIds: messageAttachments.map((attachment) => attachment.id)
          },
          message: {
            ...message,
            attachmentIds: generatedAttachmentIds
          },
          attachments: db.listAttachments(session.id),
          sessions: db.listSessions()
        }));
        ws.close();
      });
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const url = req.url || "";
    if (url.startsWith("/ws/terminal")) {
      terminalWss.handleUpgrade(req, socket, head, (ws) => terminalWss.emit("connection", ws, req));
      return;
    }
    if (url.startsWith("/ws/codex")) {
      codexWss.handleUpgrade(req, socket, head, (ws) => codexWss.emit("connection", ws, req));
      return;
    }
    socket.destroy();
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  return {
    app,
    server,
    url: `http://localhost:${port}`
  };
}

if (isDirectRun()) {
  const port = Number(process.env.PORT || 3737);
  startServer({ port }).then(({ url }) => {
    console.log(`Codex Notebook Local server listening on ${url}`);
  });
}

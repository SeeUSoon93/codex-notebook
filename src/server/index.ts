import express from "express";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { WebSocketServer } from "ws";
import { NotebookDb, getAppDataDir } from "./db.js";
import { CodexCommandAdapter } from "./codex.js";
import { copyUploadedFile, sanitizeLargeInlineData } from "./attachments.js";
import { getSessionWorkspace, makeSessionTitle } from "./sessions.js";
import { parseCodexStatus } from "./status.js";
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
      skills: db.listSkills(),
      models: ["gpt-5.5", "gpt-5.5-codex", "codex-mini-latest"]
    });
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

  app.get("/api/sessions/:id/messages", (req, res) => {
    if (!db.getSession(req.params.id)) return sendJsonError(res, 404, "세션을 찾을 수 없습니다.");
    res.json({
      messages: db.listMessages(req.params.id),
      attachments: db.listAttachments(req.params.id)
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
        error: "Codex /status 실행에 실패했습니다."
      });
    }
    res.json({ status: parseCodexStatus(result.stdout || result.stderr) });
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
      const payload = JSON.parse(raw.toString()) as { sessionId: string; prompt: string };
      const session = db.getSession(payload.sessionId);
      if (!session) {
        ws.send(JSON.stringify({ type: "error", message: "세션을 찾을 수 없습니다." }));
        ws.close();
        return;
      }

      const workspacePath = getSessionWorkspace(db, session);
      const userContent = sanitizeLargeInlineData(payload.prompt);
      db.addMessage({
        sessionId: session.id,
        role: "user",
        content: userContent.content,
        collapsed: userContent.collapsed
      });

      if (session.title === "새 작업") {
        db.updateSession(session.id, { title: makeSessionTitle(payload.prompt) });
      }

      const child = codex.spawnExec(session, userContent.content, workspacePath);
      let collected = "";

      const sendChunk = (stream: "stdout" | "stderr", chunk: Buffer) => {
        const cleaned = sanitizeLargeInlineData(chunk.toString());
        collected += cleaned.content;
        ws.send(JSON.stringify({ type: "chunk", stream, data: cleaned.content }));
      };

      child.stdout.on("data", (chunk: Buffer) => sendChunk("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => sendChunk("stderr", chunk));
      child.on("error", (error) => {
        ws.send(JSON.stringify({ type: "error", message: error.message }));
      });
      child.on("close", (code) => {
        const sanitized = sanitizeLargeInlineData(collected || `Codex exited with code ${code}`);
        const message = db.addMessage({
          sessionId: session.id,
          role: "assistant",
          content: sanitized.content,
          collapsed: sanitized.collapsed
        });
        ws.send(JSON.stringify({ type: "done", code, message, sessions: db.listSessions() }));
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

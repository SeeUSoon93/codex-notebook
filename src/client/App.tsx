import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AttachmentRef,
  ChatMessage,
  ChatSession,
  CodexCliState,
  ParsedCodexStatus,
  SkillCard,
  WorkspaceFolder
} from "./types";
import { ChatPanel } from "./components/ChatPanel";
import { LeftSessionPanel } from "./components/LeftSessionPanel";
import { RightPanel } from "./components/RightPanel";

type FontSettings = {
  fontKorean: string;
  fontTerminal: string;
  fontCode: string;
  fontMarkdown: string;
};

const defaultFonts: FontSettings = {
  fontKorean: "Pretendard",
  fontTerminal: "JetBrains Mono",
  fontCode: "JetBrains Mono",
  fontMarkdown: "Pretendard"
};

function readNumber(key: string, fallback: number) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) ? value : fallback;
}

function useDragSize(params: {
  axis: "x" | "y";
  value: number;
  min: number;
  max: number;
  invert?: boolean;
  onChange: (value: number) => void;
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  return useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const start = paramsRef.current.axis === "x" ? event.clientX : event.clientY;
    const initial = paramsRef.current.value;

    const onMove = (moveEvent: PointerEvent) => {
      const current = paramsRef.current.axis === "x" ? moveEvent.clientX : moveEvent.clientY;
      const delta = (current - start) * (paramsRef.current.invert ? -1 : 1);
      const next = Math.min(paramsRef.current.max, Math.max(paramsRef.current.min, initial + delta));
      paramsRef.current.onChange(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);
}

export function App() {
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  const [skills, setSkills] = useState<SkillCard[]>([]);
  const [models, setModels] = useState<string[]>(["gpt-5.5"]);
  const [codex, setCodex] = useState<CodexCliState>();
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<ParsedCodexStatus>();
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string>();
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const [leftWidth, setLeftWidth] = useState(() => readNumber("panel.leftWidth", 260));
  const [rightWidth, setRightWidth] = useState(() => readNumber("panel.rightWidth", 300));
  const [terminalHeight, setTerminalHeight] = useState(() => readNumber("panel.terminalHeight", 260));
  const [leftCollapsed, setLeftCollapsed] = useState(() => localStorage.getItem("panel.leftCollapsed") === "true");
  const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem("panel.rightCollapsed") === "true");
  const [terminalOpen, setTerminalOpen] = useState(() => localStorage.getItem("panel.terminalOpen") !== "false");
  const [terminalCollapsed, setTerminalCollapsed] = useState(() => localStorage.getItem("panel.terminalCollapsed") === "true");
  const [fontSettings, setFontSettings] = useState<FontSettings>(defaultFonts);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || sessions[0],
    [selectedSessionId, sessions]
  );

  const leftDrag = useDragSize({ axis: "x", value: leftWidth, min: 180, max: 520, onChange: setLeftWidth });
  const rightDrag = useDragSize({ axis: "x", value: rightWidth, min: 220, max: 560, invert: true, onChange: setRightWidth });
  const terminalDrag = useDragSize({ axis: "y", value: terminalHeight, min: 120, max: 520, invert: true, onChange: setTerminalHeight });

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--font-korean", fontSettings.fontKorean);
    root.style.setProperty("--font-terminal", fontSettings.fontTerminal);
    root.style.setProperty("--font-code", fontSettings.fontCode);
    root.style.setProperty("--font-markdown", fontSettings.fontMarkdown);
  }, [fontSettings]);

  useEffect(() => {
    localStorage.setItem("panel.leftWidth", String(leftWidth));
    localStorage.setItem("panel.rightWidth", String(rightWidth));
    localStorage.setItem("panel.terminalHeight", String(terminalHeight));
    localStorage.setItem("panel.leftCollapsed", String(leftCollapsed));
    localStorage.setItem("panel.rightCollapsed", String(rightCollapsed));
    localStorage.setItem("panel.terminalOpen", String(terminalOpen));
    localStorage.setItem("panel.terminalCollapsed", String(terminalCollapsed));
  }, [leftWidth, rightWidth, terminalHeight, leftCollapsed, rightCollapsed, terminalOpen, terminalCollapsed]);

  const loadMessages = useCallback(async (sessionId: string) => {
    const response = await fetch(`/api/sessions/${sessionId}/messages`);
    const data = await response.json();
    setMessages(data.messages || []);
    setAttachments(data.attachments || []);
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!selectedSession?.id) return;
    setStatusLoading(true);
    setStatusError(undefined);
    try {
      const response = await fetch(`/api/status?sessionId=${encodeURIComponent(selectedSession.id)}`);
      const data = await response.json();
      setStatus(data.status);
      setStatusError(data.error);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "상태를 불러오지 못했습니다.");
    } finally {
      setStatusLoading(false);
    }
  }, [selectedSession?.id]);

  useEffect(() => {
    fetch("/api/bootstrap")
      .then((response) => response.json())
      .then((data) => {
        setFolders(data.folders || []);
        setSessions(data.sessions || []);
        setSkills(data.skills || []);
        setModels(data.models || ["gpt-5.5"]);
        setCodex(data.codex);
        setFontSettings({
          fontKorean: data.settings?.fontKorean || defaultFonts.fontKorean,
          fontTerminal: data.settings?.fontTerminal || defaultFonts.fontTerminal,
          fontCode: data.settings?.fontCode || defaultFonts.fontCode,
          fontMarkdown: data.settings?.fontMarkdown || defaultFonts.fontMarkdown
        });
        const firstSession = data.sessions?.[0];
        if (firstSession) {
          setSelectedSessionId(firstSession.id);
          loadMessages(firstSession.id);
        }
        if (!data.codex?.installed || !data.codex?.loggedIn) {
          setLoginModalOpen(true);
          setTerminalOpen(true);
          setTerminalCollapsed(false);
        }
      });
  }, [loadMessages]);

  useEffect(() => {
    if (selectedSession?.id) loadMessages(selectedSession.id);
  }, [selectedSession?.id, loadMessages]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "`") {
        event.preventDefault();
        setTerminalOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setLoginModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function createSession(folderId: string) {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId, title: "새 작업", model: models[0] || "gpt-5.5" })
    });
    const data = await response.json();
    setSessions((current) => [data.session, ...current]);
    setSelectedSessionId(data.session.id);
    setMessages([]);
    setAttachments([]);
  }

  async function patchSession(patch: Partial<Pick<ChatSession, "model" | "intelligence" | "permissionMode">>) {
    if (!selectedSession) return;
    const response = await fetch(`/api/sessions/${selectedSession.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    const data = await response.json();
    setSessions((current) => current.map((session) => (session.id === data.session.id ? data.session : session)));
  }

  async function changeFolder(folderId: string) {
    const existing = sessions.find((session) => session.folderId === folderId);
    if (existing) {
      setSelectedSessionId(existing.id);
      return;
    }
    await createSession(folderId);
  }

  async function uploadFiles(files: FileList) {
    if (!selectedSession) return;
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));
    const response = await fetch(`/api/sessions/${selectedSession.id}/attachments`, {
      method: "POST",
      body: form
    });
    const data = await response.json();
    setAttachments((current) => [...(data.attachments || []), ...current]);
    const paths = (data.attachments || []).map((item: AttachmentRef) => `- ${item.filePath}`).join("\n");
    setInput((current) => `${current}${current ? "\n\n" : ""}첨부 파일:\n${paths}`);
  }

  async function persistFonts(next: FontSettings) {
    setFontSettings(next);
    Object.entries(next).forEach(([key, value]) => localStorage.setItem(key, value));
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next)
    });
  }

  function sendPrompt(prompt = input) {
    if (!selectedSession || !prompt.trim() || sending) return;
    const text = prompt.trim();
    setInput("");
    setSending(true);
    const optimisticUser: ChatMessage = {
      id: `local-user-${Date.now()}`,
      sessionId: selectedSession.id,
      role: "user",
      content: text,
      collapsed: false,
      createdAt: new Date().toISOString()
    };
    const streaming: ChatMessage = {
      id: `local-assistant-${Date.now()}`,
      sessionId: selectedSession.id,
      role: "assistant",
      content: "",
      collapsed: false,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, optimisticUser, streaming]);

    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${scheme}://${window.location.host}/ws/codex`);
    ws.onopen = () => ws.send(JSON.stringify({ sessionId: selectedSession.id, prompt: text }));
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "chunk") {
        setMessages((current) =>
          current.map((item) => item.id === streaming.id ? { ...item, content: item.content + message.data } : item)
        );
      }
      if (message.type === "done") {
        setMessages((current) =>
          current.map((item) => item.id === streaming.id ? message.message : item)
        );
        if (message.sessions) setSessions(message.sessions);
        setSending(false);
      }
      if (message.type === "error") {
        setMessages((current) =>
          current.map((item) => item.id === streaming.id ? { ...item, content: message.message } : item)
        );
        setSending(false);
      }
    };
    ws.onclose = () => setSending(false);
  }

  const appStyle = {
    gridTemplateColumns: `${leftCollapsed ? 48 : leftWidth}px 6px minmax(360px, 1fr) 6px ${rightCollapsed ? 48 : rightWidth}px`,
    "--terminal-height": `${terminalCollapsed ? 36 : terminalHeight}px`
  } as React.CSSProperties;

  return (
    <div className="app-shell" style={appStyle}>
      <LeftSessionPanel
        collapsed={leftCollapsed}
        folders={folders}
        sessions={sessions}
        selectedSessionId={selectedSession?.id}
        onToggle={() => setLeftCollapsed((value) => !value)}
        onSelectSession={setSelectedSessionId}
        onNewSession={createSession}
      />
      <div className="resize-handle vertical" onPointerDown={leftDrag} />
      <ChatPanel
        session={selectedSession}
        messages={messages}
        attachments={attachments}
        folders={folders}
        models={models}
        input={input}
        sending={sending}
        terminalOpen={terminalOpen}
        terminalCollapsed={terminalCollapsed}
        onInputChange={setInput}
        onSend={() => sendPrompt()}
        onFolderChange={changeFolder}
        onSessionPatch={patchSession}
        onToggleTerminal={() => setTerminalOpen((open) => !open)}
        onToggleTerminalCollapsed={() => setTerminalCollapsed((value) => !value)}
        onFilesSelected={uploadFiles}
      />
      <div className="resize-handle vertical" onPointerDown={rightDrag} />
      <RightPanel
        collapsed={rightCollapsed}
        codex={codex}
        status={status}
        statusLoading={statusLoading}
        statusError={statusError}
        attachments={attachments}
        skills={skills}
        fontSettings={fontSettings}
        onToggle={() => setRightCollapsed((value) => !value)}
        onRefreshStatus={refreshStatus}
        onUseSkill={(prompt, runNow) => {
          setInput((current) => `${current}${current ? "\n\n" : ""}${prompt}`);
          if (runNow) sendPrompt(prompt);
        }}
        onFontChange={persistFonts}
      />
      {terminalOpen && <div className="resize-handle horizontal terminal-resizer" onPointerDown={terminalDrag} />}
      {loginModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>{codex?.installed ? "Codex 로그인이 필요합니다." : "Codex CLI가 설치되어 있지 않습니다."}</h2>
            <p>
              {codex?.installed
                ? "아래 터미널에서 `codex login`을 실행해 주세요."
                : "아래 명령어로 설치해 주세요: npm install -g @openai/codex"}
            </p>
            <button className="send-button" onClick={() => setLoginModalOpen(false)}>확인</button>
          </div>
        </div>
      )}
    </div>
  );
}

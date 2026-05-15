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

type Theme = "dark" | "light";
type RunPhase = "idle" | "connecting" | "thinking" | "streaming";

const defaultFonts: FontSettings = {
  fontKorean: "Pretendard",
  fontTerminal: "JetBrains Mono",
  fontCode: "JetBrains Mono",
  fontMarkdown: "Pretendard"
};

function readNumber(key: string, fallback: number) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentRef[]>([]);
  const [skills, setSkills] = useState<SkillCard[]>([]);
  const [models, setModels] = useState<string[]>(["gpt-5.5"]);
  const [codex, setCodex] = useState<CodexCliState>();
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [runStartedAt, setRunStartedAt] = useState<number>();
  const [runTick, setRunTick] = useState(Date.now());
  const [status, setStatus] = useState<ParsedCodexStatus>();
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string>();
  const [statusUpdatedAt, setStatusUpdatedAt] = useState<string>();
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [skillTags, setSkillTags] = useState<string[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [sessionSearchFocus, setSessionSearchFocus] = useState(0);

  const [leftWidth, setLeftWidth] = useState(() => readNumber("panel.leftWidth", 260));
  const [rightWidth, setRightWidth] = useState(() => readNumber("panel.rightWidth", 300));
  const [terminalHeight, setTerminalHeight] = useState(() => readNumber("panel.terminalHeight", 260));
  const [leftCollapsed, setLeftCollapsed] = useState(() => localStorage.getItem("panel.leftCollapsed") === "true");
  const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem("panel.rightCollapsed") === "true");
  const [terminalOpen, setTerminalOpen] = useState(() => localStorage.getItem("panel.terminalOpen") !== "false");
  const [terminalCollapsed, setTerminalCollapsed] = useState(() => localStorage.getItem("panel.terminalCollapsed") === "true");
  const [fontSettings, setFontSettings] = useState<FontSettings>(defaultFonts);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") === "light" ? "light" : "dark"));

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
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

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

  const refreshAttachments = useCallback(async () => {
    if (!selectedSession?.id) return;
    const response = await fetch(`/api/sessions/${selectedSession.id}/attachments`);
    const data = await response.json();
    setAttachments(data.attachments || []);
  }, [selectedSession?.id]);

  const refreshStatus = useCallback(async () => {
    if (!selectedSession?.id) return;
    setStatusLoading(true);
    setStatusError(undefined);
    try {
      const response = await fetch(`/api/status?sessionId=${encodeURIComponent(selectedSession.id)}`);
      const data = await response.json();
      setStatus(data.status);
      setStatusError(data.error);
      if (data.status && !data.error) setStatusUpdatedAt(new Date().toISOString());
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
        if (data.settings?.theme === "light" || data.settings?.theme === "dark") {
          setTheme(data.settings.theme);
        }
        if (data.settings?.panelLeftWidth) setLeftWidth(readNumberFromSettings(data.settings.panelLeftWidth, leftWidth));
        if (data.settings?.panelRightWidth) setRightWidth(readNumberFromSettings(data.settings.panelRightWidth, rightWidth));
        if (data.settings?.panelTerminalHeight) setTerminalHeight(readNumberFromSettings(data.settings.panelTerminalHeight, terminalHeight));
        if (data.settings?.panelLeftCollapsed) setLeftCollapsed(data.settings.panelLeftCollapsed === "true");
        if (data.settings?.panelRightCollapsed) setRightCollapsed(data.settings.panelRightCollapsed === "true");
        if (data.settings?.panelTerminalOpen) setTerminalOpen(data.settings.panelTerminalOpen !== "false");
        if (data.settings?.panelTerminalCollapsed) setTerminalCollapsed(data.settings.panelTerminalCollapsed === "true");
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
        setSettingsLoaded(true);
      });
  }, [loadMessages]);

  function readNumberFromSettings(raw: string, fallback: number) {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  useEffect(() => {
    if (!settingsLoaded) return;
    const timeout = window.setTimeout(() => {
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panelLeftWidth: leftWidth,
          panelRightWidth: rightWidth,
          panelTerminalHeight: terminalHeight,
          panelLeftCollapsed: leftCollapsed,
          panelRightCollapsed: rightCollapsed,
          panelTerminalOpen: terminalOpen,
          panelTerminalCollapsed: terminalCollapsed
        })
      }).catch(() => undefined);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [settingsLoaded, leftWidth, rightWidth, terminalHeight, leftCollapsed, rightCollapsed, terminalOpen, terminalCollapsed]);

  useEffect(() => {
    if (selectedSession?.id) loadMessages(selectedSession.id);
  }, [selectedSession?.id, loadMessages]);

  useEffect(() => {
    if (!selectedSession?.id || !codex?.installed || !codex.loggedIn) return;
    refreshStatus();
    const interval = window.setInterval(refreshStatus, 30000);
    return () => window.clearInterval(interval);
  }, [codex?.installed, codex?.loggedIn, refreshStatus, selectedSession?.id]);

  useEffect(() => {
    if (runPhase === "idle" || !runStartedAt) return;
    setRunTick(Date.now());
    const interval = window.setInterval(() => setRunTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [runPhase, runStartedAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "`") {
        event.preventDefault();
        setTerminalOpen((open) => !open);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLeftCollapsed(false);
        setSessionSearchFocus((value) => value + 1);
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
    setPendingAttachments([]);
  }

  function formatSessionTitle(title: string) {
    if (/^첨부\s*파일\s*:/i.test(title) || /^attachment\s*:/i.test(title)) return "첨부 작업";
    return title;
  }

  async function deleteSession(sessionId: string) {
    const target = sessions.find((session) => session.id === sessionId);
    if (!target) return;
    if (sending && selectedSession?.id === sessionId) {
      window.alert("실행 중인 세션은 완료된 뒤 삭제할 수 있습니다.");
      return;
    }
    if (!window.confirm(`"${formatSessionTitle(target.title)}" 세션을 삭제할까요?`)) return;

    const response = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    if (!response.ok) return;
    const data = await response.json();
    const nextSessions = data.sessions || sessions.filter((session) => session.id !== sessionId);
    setSessions(nextSessions);

    if (selectedSessionId !== sessionId) return;
    setMessages([]);
    setAttachments([]);
    setPendingAttachments([]);
    const nextSelected = nextSessions.find((session: ChatSession) => session.folderId === target.folderId) || nextSessions[0];
    if (nextSelected) {
      setSelectedSessionId(nextSelected.id);
      await loadMessages(nextSelected.id);
      return;
    }
    await createSession(target.folderId);
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

  async function chooseFolder() {
    const response = await fetch("/api/folders/pick", {
      method: "POST"
    });
    const data = await response.json();
    if (!response.ok || !data.folder) return;
    setFolders((current) => {
      const exists = current.some((folder) => folder.id === data.folder.id);
      return exists ? current.map((folder) => (folder.id === data.folder.id ? data.folder : folder)) : [...current, data.folder];
    });
    await createSession(data.folder.id);
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
    setPendingAttachments((current) => [...current, ...(data.attachments || [])]);
  }

  async function removePendingAttachment(id: string) {
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== id));
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
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

  async function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next })
    });
  }

  function addSkillTag(skill: SkillCard, runNow: boolean) {
    const tag = skill.title;
    const nextTags = skillTags.includes(tag) ? skillTags : [...skillTags, tag];
    setSkillTags(nextTags);
    if (runNow) sendPrompt(input, nextTags);
  }

  function removeSkillTag(name: string) {
    setSkillTags((current) => current.filter((tag) => tag !== name));
  }

  function sendPrompt(prompt = input, tags = skillTags, files = pendingAttachments) {
    const tagPrefix = tags.map((tag) => `$${tag}`).join(" ");
    const text = [tagPrefix, prompt.trim()].filter(Boolean).join("\n\n");
    if (!selectedSession || (!text && files.length === 0) || sending) return;
    const startedAt = Date.now();
    setInput("");
    setSkillTags([]);
    setPendingAttachments([]);
    setSending(true);
    setRunPhase("connecting");
    setRunStartedAt(startedAt);
    setRunTick(startedAt);
    const optimisticUser: ChatMessage = {
      id: `local-user-${Date.now()}`,
      sessionId: selectedSession.id,
      role: "user",
      content: text,
      attachmentIds: files.map((attachment) => attachment.id),
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
    ws.onopen = () => {
      setRunPhase("thinking");
      ws.send(JSON.stringify({
        sessionId: selectedSession.id,
        prompt: text,
        attachmentIds: files.map((attachment) => attachment.id)
      }));
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "chunk") {
        setRunPhase("streaming");
        setMessages((current) =>
          current.map((item) => item.id === streaming.id ? { ...item, content: item.content + message.data } : item)
        );
      }
      if (message.type === "done") {
        const durationMs = Date.now() - startedAt;
        setMessages((current) =>
          current.map((item) => {
            if (item.id === optimisticUser.id && message.userMessage) return message.userMessage;
            if (item.id === streaming.id) return { ...message.message, durationMs };
            return item;
          })
        );
        if (message.attachments) setAttachments(message.attachments);
        if (message.sessions) setSessions(message.sessions);
        setSending(false);
        setRunPhase("idle");
        setRunStartedAt(undefined);
      }
      if (message.type === "error") {
        const durationMs = Date.now() - startedAt;
        setMessages((current) =>
          current.map((item) => item.id === streaming.id ? { ...item, content: message.message, durationMs } : item)
        );
        setSending(false);
        setRunPhase("idle");
        setRunStartedAt(undefined);
      }
    };
    ws.onerror = () => {
      setRunPhase("idle");
      setRunStartedAt(undefined);
    };
    ws.onclose = () => {
      setSending(false);
      setRunPhase("idle");
      setRunStartedAt(undefined);
    };
  }

  const runElapsedMs = runStartedAt ? Math.max(0, runTick - runStartedAt) : undefined;

  const appStyle = {
    gridTemplateColumns: `${leftCollapsed ? 48 : leftWidth}px 6px minmax(360px, 1fr) 6px ${rightCollapsed ? 48 : rightWidth}px`,
    "--terminal-height": `${terminalOpen && !terminalCollapsed ? terminalHeight : 42}px`
  } as React.CSSProperties;

  return (
    <div className="app-shell" style={appStyle}>
      <LeftSessionPanel
        collapsed={leftCollapsed}
        folders={folders}
        sessions={sessions}
        selectedSessionId={selectedSession?.id}
        searchFocusToken={sessionSearchFocus}
        onToggle={() => setLeftCollapsed((value) => !value)}
        onSelectSession={setSelectedSessionId}
        onNewSession={createSession}
        onDeleteSession={deleteSession}
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
        theme={theme}
        runPhase={runPhase}
        runElapsedMs={runElapsedMs}
        skillTags={skillTags}
        pendingAttachments={pendingAttachments}
        onInputChange={setInput}
        onSend={() => sendPrompt()}
        onFolderChange={changeFolder}
        onChooseFolder={chooseFolder}
        onSessionPatch={patchSession}
        onToggleTerminal={() => setTerminalOpen((open) => !open)}
        onToggleTerminalCollapsed={() => setTerminalCollapsed((value) => !value)}
        onTerminalResizeStart={terminalDrag}
        onToggleTheme={toggleTheme}
        onRemoveSkillTag={removeSkillTag}
        onRemovePendingAttachment={removePendingAttachment}
        onFilesSelected={uploadFiles}
      />
      <div className="resize-handle vertical" onPointerDown={rightDrag} />
      <RightPanel
        collapsed={rightCollapsed}
        codex={codex}
        status={status}
        statusLoading={statusLoading}
        statusError={statusError}
        statusUpdatedAt={statusUpdatedAt}
        attachments={attachments}
        skills={skills}
        fontSettings={fontSettings}
        onToggle={() => setRightCollapsed((value) => !value)}
        onRefreshStatus={refreshStatus}
        onUseSkill={addSkillTag}
        onAttachmentsChanged={refreshAttachments}
        onFontChange={persistFonts}
      />
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

import type { AttachmentRef, ChatMessage, ChatSession, WorkspaceFolder } from "../types";
import type { PointerEvent } from "react";
import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Clock3, FileText, LoaderCircle, MessageSquare, Moon, Sun, TerminalSquare } from "lucide-react";
import { BottomTerminal } from "./BottomTerminal";
import { ChatInput } from "./ChatInput";

type RunPhase = "idle" | "connecting" | "thinking" | "streaming";

type Props = {
  session?: ChatSession;
  messages: ChatMessage[];
  attachments: AttachmentRef[];
  folders: WorkspaceFolder[];
  models: string[];
  input: string;
  sending: boolean;
  terminalOpen: boolean;
  terminalCollapsed: boolean;
  theme: "dark" | "light";
  runPhase: RunPhase;
  runElapsedMs?: number;
  skillTags: string[];
  pendingAttachments: AttachmentRef[];
  onInputChange: (value: string) => void;
  onSend: () => void;
  onFolderChange: (folderId: string) => void;
  onChooseFolder: () => void;
  onSessionPatch: (patch: Partial<Pick<ChatSession, "model" | "intelligence" | "permissionMode">>) => void;
  onToggleTerminal: () => void;
  onToggleTerminalCollapsed: () => void;
  onTerminalResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onToggleTheme: () => void;
  onRemoveSkillTag: (name: string) => void;
  onRemovePendingAttachment: (id: string) => void;
  onFilesSelected: (files: FileList) => void;
};

function cleanLegacyAttachmentText(content: string) {
  const cleaned = content
    .replace(/^첨부 파일:\r?\n(?:- .+(?:\r?\n|$))+(?:\r?\n)?/, "")
    .replace(/^\[이미지 저장됨: .+\]\s*$/gm, "")
    .trim();
  if (!/^OpenAI Codex v/i.test(cleaned)) return cleaned;

  const transcript = cleaned.match(/\r?\n-{3,}\r?\nuser\r?\n[\s\S]*?\r?\ncodex\r?\n([\s\S]*?)(?:\r?\ntokens used\r?\n[\d,]+[\s\S]*)?$/i);
  return transcript?.[1]?.trim() || "";
}

function formatSessionTitle(title?: string) {
  if (!title) return "세션 없음";
  if (/^첨부\s*파일\s*:/i.test(title) || /^attachment\s*:/i.test(title)) {
    return "첨부 작업";
  }
  return title;
}

function formatElapsed(ms?: number) {
  const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function runPhaseLabel(phase: RunPhase) {
  if (phase === "connecting") return "연결 중";
  if (phase === "thinking") return "생각중";
  if (phase === "streaming") return "응답 작성 중";
  return "";
}

function MessageAttachments({ files }: { files: AttachmentRef[] }) {
  if (files.length === 0) return null;
  const images = files.filter((file) => file.type === "image");
  const otherFiles = files.filter((file) => file.type !== "image");
  return (
    <div className="message-attachments">
      {images.map((file) => (
        <a className="message-image-attachment" href={`/api/attachments/${file.id}/content`} target="_blank" rel="noreferrer" key={file.id} title={file.filePath}>
          <img src={`/api/attachments/${file.id}/content`} alt={file.filename} />
          <span>{file.filename}</span>
        </a>
      ))}
      {otherFiles.map((file) => (
        <a className="message-attachment" href={`/api/attachments/${file.id}/content`} target="_blank" rel="noreferrer" key={file.id} title={file.filePath}>
          <FileText size={14} />
          <span>{file.filename}</span>
        </a>
      ))}
    </div>
  );
}

function MessageBlock({ message, attachments, pending }: { message: ChatMessage; attachments: AttachmentRef[]; pending: boolean }) {
  const isLong = message.collapsed || message.content.length > 10000;
  const displayContent = cleanLegacyAttachmentText(message.content);
  const messageAttachments = attachments.filter((attachment) => message.attachmentIds?.includes(attachment.id));
  const isPendingAssistant = pending && message.role === "assistant" && !displayContent;
  if (!displayContent && messageAttachments.length === 0 && !isPendingAssistant) return null;
  return (
    <article className={`message ${message.role}`}>
      <div className="message-role-row">
        <div className="message-role">{message.role === "user" ? "User" : "Codex"}</div>
        {typeof message.durationMs === "number" && (
          <div className="message-meta"><Clock3 size={12} /> {formatElapsed(message.durationMs)}</div>
        )}
      </div>
      <MessageAttachments files={messageAttachments} />
      {displayContent && (
        <pre className={`message-content markdown-content ${isLong ? "collapsed-message" : ""}`}>{displayContent}</pre>
      )}
      {isPendingAssistant && (
        <div className="typing-indicator">
          <LoaderCircle size={14} />
          <span>생각중</span>
        </div>
      )}
    </article>
  );
}

export function ChatPanel({
  session,
  messages,
  attachments,
  folders,
  models,
  input,
  sending,
  terminalOpen,
  terminalCollapsed,
  theme,
  runPhase,
  runElapsedMs,
  skillTags,
  pendingAttachments,
  onInputChange,
  onSend,
  onFolderChange,
  onChooseFolder,
  onSessionPatch,
  onToggleTerminal,
  onToggleTerminalCollapsed,
  onTerminalResizeStart,
  onToggleTheme,
  onRemoveSkillTag,
  onRemovePendingAttachment,
  onFilesSelected
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.scrollTop = scroll.scrollHeight;
  }, [messages.length, lastMessage?.content]);

  return (
    <main className="chat-panel">
      <div className="chat-header">
        <div>
          <strong><MessageSquare size={15} /> {formatSessionTitle(session?.title)}</strong>
          <span>{session?.model}</span>
        </div>
        <div className="chat-header-actions">
          <button
            className={`icon-button ${terminalOpen ? "active" : ""}`}
            title="터미널 토글"
            aria-label="터미널 토글"
            onClick={onToggleTerminal}
          >
            <TerminalSquare size={16} />
          </button>
          <button
            className="icon-button"
            title={theme === "dark" ? "라이트 모드" : "다크 모드"}
            aria-label={theme === "dark" ? "라이트 모드" : "다크 모드"}
            onClick={onToggleTheme}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
      <div className="message-scroll" ref={scrollRef}>
        {messages.map((message) => (
          <MessageBlock
            key={message.id}
            message={message}
            attachments={attachments}
            pending={runPhase !== "idle" && message.id === lastMessage?.id}
          />
        ))}
      </div>
      <div className={`run-status-bar ${runPhase === "idle" ? "run-status-idle" : ""}`} aria-live="polite">
        <LoaderCircle size={14} />
        <span>{runPhaseLabel(runPhase)}</span>
        <strong>{formatElapsed(runElapsedMs)}</strong>
      </div>
      <ChatInput
        value={input}
        folders={folders}
        session={session}
        models={models}
        terminalOpen={terminalOpen}
        sending={sending}
        skillTags={skillTags}
        pendingAttachments={pendingAttachments}
        onChange={onInputChange}
        onSend={onSend}
        onFolderChange={onFolderChange}
        onChooseFolder={onChooseFolder}
        onSessionPatch={onSessionPatch}
        onToggleTerminal={onToggleTerminal}
        onRemoveSkillTag={onRemoveSkillTag}
        onRemovePendingAttachment={onRemovePendingAttachment}
        onFilesSelected={onFilesSelected}
      />
      <section className={`bottom-terminal ${!terminalOpen ? "terminal-closed" : ""} ${terminalCollapsed ? "terminal-collapsed" : ""}`}>
          <div className="resize-handle horizontal terminal-resize-handle" onPointerDown={onTerminalResizeStart} />
          <div className="terminal-titlebar">
            <span>Terminal</span>
            <button
              className="icon-button small"
              title={!terminalOpen ? "터미널 열기" : terminalCollapsed ? "터미널 펼치기" : "터미널 접기"}
              onClick={!terminalOpen ? onToggleTerminal : onToggleTerminalCollapsed}
            >
              {!terminalOpen || terminalCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          {terminalOpen && !terminalCollapsed && (
            <BottomTerminal sessionId={session?.id} open={terminalOpen} collapsed={terminalCollapsed} theme={theme} />
          )}
      </section>
    </main>
  );
}

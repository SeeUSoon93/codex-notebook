import type { AttachmentRef, ChatMessage, ChatSession, WorkspaceFolder } from "../types";
import { BottomTerminal } from "./BottomTerminal";
import { ChatInput } from "./ChatInput";

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
  onInputChange: (value: string) => void;
  onSend: () => void;
  onFolderChange: (folderId: string) => void;
  onSessionPatch: (patch: Partial<Pick<ChatSession, "model" | "intelligence" | "permissionMode">>) => void;
  onToggleTerminal: () => void;
  onToggleTerminalCollapsed: () => void;
  onFilesSelected: (files: FileList) => void;
};

function MessageBlock({ message }: { message: ChatMessage }) {
  const isLong = message.collapsed || message.content.length > 10000;
  return (
    <article className={`message ${message.role}`}>
      <div className="message-role">{message.role === "user" ? "User" : "Codex"}</div>
      <pre className={`message-content markdown-content ${isLong ? "collapsed-message" : ""}`}>{message.content}</pre>
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
  onInputChange,
  onSend,
  onFolderChange,
  onSessionPatch,
  onToggleTerminal,
  onToggleTerminalCollapsed,
  onFilesSelected
}: Props) {
  return (
    <main className="chat-panel">
      <div className="chat-header">
        <div>
          <strong>{session?.title || "세션 없음"}</strong>
          <span>{session?.model}</span>
        </div>
      </div>
      <div className="message-scroll">
        {messages.map((message) => <MessageBlock key={message.id} message={message} />)}
        {attachments.length > 0 && (
          <div className="attachment-strip">
            {attachments.slice(0, 8).map((attachment) => (
              <a href={`/api/attachments/${attachment.id}/content`} target="_blank" rel="noreferrer" key={attachment.id}>
                {attachment.type === "image" ? <img src={`/api/attachments/${attachment.id}/content`} alt={attachment.filename} /> : <span>{attachment.filename}</span>}
              </a>
            ))}
          </div>
        )}
      </div>
      <ChatInput
        value={input}
        folders={folders}
        session={session}
        models={models}
        terminalOpen={terminalOpen}
        sending={sending}
        onChange={onInputChange}
        onSend={onSend}
        onFolderChange={onFolderChange}
        onSessionPatch={onSessionPatch}
        onToggleTerminal={onToggleTerminal}
        onFilesSelected={onFilesSelected}
      />
      {terminalOpen && (
        <section className={`bottom-terminal ${terminalCollapsed ? "terminal-collapsed" : ""}`}>
          <div className="terminal-titlebar">
            <span>Terminal</span>
            <button className="icon-button small" title="터미널 접기" onClick={onToggleTerminalCollapsed}>
              {terminalCollapsed ? "⌃" : "⌄"}
            </button>
          </div>
          {!terminalCollapsed && <BottomTerminal sessionId={session?.id} open={terminalOpen} collapsed={terminalCollapsed} />}
        </section>
      )}
    </main>
  );
}

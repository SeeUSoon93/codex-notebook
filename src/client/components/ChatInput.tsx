import { useRef } from "react";
import type { ChatSession, Intelligence, PermissionMode, WorkspaceFolder } from "../types";

type Props = {
  value: string;
  folders: WorkspaceFolder[];
  session?: ChatSession;
  models: string[];
  terminalOpen: boolean;
  sending: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onFolderChange: (folderId: string) => void;
  onSessionPatch: (patch: Partial<Pick<ChatSession, "model" | "intelligence" | "permissionMode">>) => void;
  onToggleTerminal: () => void;
  onFilesSelected: (files: FileList) => void;
};

export function ChatInput({
  value,
  folders,
  session,
  models,
  terminalOpen,
  sending,
  onChange,
  onSend,
  onFolderChange,
  onSessionPatch,
  onToggleTerminal,
  onFilesSelected
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="chat-input-shell">
      <textarea
        className="chat-input"
        value={value}
        placeholder="Codex에게 요청"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            onSend();
          }
        }}
      />
      <div className="input-toolbar">
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) onFilesSelected(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <button className="icon-button" title="파일 추가" onClick={() => fileRef.current?.click()}>＋</button>
        <select value={session?.folderId || ""} onChange={(event) => onFolderChange(event.target.value)}>
          {folders.map((folder) => (
            <option value={folder.id} key={folder.id}>{folder.name}</option>
          ))}
        </select>
        <select
          value={session?.permissionMode || "workspace-write"}
          onChange={(event) => onSessionPatch({ permissionMode: event.target.value as PermissionMode })}
        >
          <option value="read-only">읽기 전용</option>
          <option value="workspace-write">Workspace 수정</option>
          <option value="full-auto">Full Auto</option>
        </select>
        <select
          value={session?.intelligence || "normal"}
          onChange={(event) => onSessionPatch({ intelligence: event.target.value as Intelligence })}
        >
          <option value="fast">빠르게</option>
          <option value="normal">보통</option>
          <option value="deep">깊게</option>
          <option value="xhigh">극한</option>
        </select>
        <select value={session?.model || models[0]} onChange={(event) => onSessionPatch({ model: event.target.value })}>
          {models.map((model) => (
            <option value={model} key={model}>{model}</option>
          ))}
        </select>
        <button className={`icon-button ${terminalOpen ? "active" : ""}`} title="터미널 토글" onClick={onToggleTerminal}>⌘</button>
        <button className="send-button" disabled={sending || !value.trim()} onClick={onSend}>보내기</button>
      </div>
    </div>
  );
}

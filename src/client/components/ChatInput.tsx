import { useRef } from "react";
import { Brain, FileText, FolderOpen, Image, Paperclip, SendHorizontal, Shield, TerminalSquare, X } from "lucide-react";
import type { AttachmentRef, ChatSession, Intelligence, PermissionMode, WorkspaceFolder } from "../types";

type Props = {
  value: string;
  folders: WorkspaceFolder[];
  session?: ChatSession;
  models: string[];
  terminalOpen: boolean;
  sending: boolean;
  skillTags: string[];
  pendingAttachments: AttachmentRef[];
  onChange: (value: string) => void;
  onSend: () => void;
  onFolderChange: (folderId: string) => void;
  onChooseFolder: () => void;
  onSessionPatch: (patch: Partial<Pick<ChatSession, "model" | "intelligence" | "permissionMode">>) => void;
  onToggleTerminal: () => void;
  onRemoveSkillTag: (name: string) => void;
  onRemovePendingAttachment: (id: string) => void;
  onFilesSelected: (files: FileList) => void;
};

export function ChatInput({
  value,
  folders,
  session,
  models,
  terminalOpen,
  sending,
  skillTags,
  pendingAttachments,
  onChange,
  onSend,
  onFolderChange,
  onChooseFolder,
  onSessionPatch,
  onToggleTerminal,
  onRemoveSkillTag,
  onRemovePendingAttachment,
  onFilesSelected
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const currentFolder = folders.find((folder) => folder.id === session?.folderId);

  return (
    <div className="chat-input-shell">
      {skillTags.length > 0 && (
        <div className="skill-tag-row" aria-label="선택한 스킬">
          {skillTags.map((name) => (
            <button className="skill-tag" key={name} title={`${name} 제거`} onClick={() => onRemoveSkillTag(name)}>
              <span>${name}</span>
              <X size={12} />
            </button>
          ))}
        </div>
      )}
      {pendingAttachments.length > 0 && (
        <div className="pending-attachment-row" aria-label="첨부 파일">
          {pendingAttachments.map((attachment) => (
            <div className="attachment-chip" key={attachment.id} title={attachment.filePath}>
              {attachment.type === "image" ? <Image size={14} /> : <FileText size={14} />}
              <span>{attachment.filename}</span>
              <button className="chip-remove" title="첨부 제거" aria-label="첨부 제거" onClick={() => onRemovePendingAttachment(attachment.id)}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        className="chat-input"
        value={value}
        placeholder="Codex에게 요청"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
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
        <button className="icon-button" title="파일 추가" aria-label="파일 추가" onClick={() => fileRef.current?.click()}>
          <Paperclip size={16} />
        </button>
        <button className="icon-button" title="폴더 선택" aria-label="폴더 선택" onClick={onChooseFolder}>
          <FolderOpen size={15} />
        </button>
        <select
          value={session?.folderId || ""}
          onChange={(event) => {
            onFolderChange(event.target.value);
          }}
          title={currentFolder?.path || "폴더 선택"}
        >
          {folders.map((folder) => (
            <option value={folder.id} key={folder.id}>{folder.name === "default" ? "폴더 선택..." : folder.name}</option>
          ))}
        </select>
        <span className="toolbar-icon-label" title="권한">
          <Shield size={15} />
        </span>
        <select
          value={session?.permissionMode || "workspace-write"}
          onChange={(event) => onSessionPatch({ permissionMode: event.target.value as PermissionMode })}
        >
          <option value="read-only">읽기 전용</option>
          <option value="workspace-write">Workspace 수정</option>
          <option value="full-auto">Full Auto</option>
        </select>
        <span className="toolbar-icon-label" title="인텔리전스">
          <Brain size={15} />
        </span>
        <select
          value={session?.intelligence || "normal"}
          onChange={(event) => onSessionPatch({ intelligence: event.target.value as Intelligence })}
        >
          <option value="fast">낮음</option>
          <option value="normal">중간</option>
          <option value="deep">높음</option>
          <option value="xhigh">매우 높음</option>
        </select>
        <select value={session?.model || models[0]} onChange={(event) => onSessionPatch({ model: event.target.value })}>
          {models.map((model) => (
            <option value={model} key={model}>{model}</option>
          ))}
        </select>
        <button
          className={`terminal-toggle-button ${terminalOpen ? "active" : ""}`}
          title="터미널 토글"
          aria-label="터미널 토글"
          onClick={onToggleTerminal}
        >
          <TerminalSquare size={16} />
          <span>터미널</span>
        </button>
        <button className="send-button" disabled={sending || (!value.trim() && skillTags.length === 0 && pendingAttachments.length === 0)} onClick={onSend}>
          <SendHorizontal size={15} />
          <span>{sending ? "처리 중" : "보내기"}</span>
        </button>
      </div>
    </div>
  );
}

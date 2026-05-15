import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Folder, Menu, MessageSquare, Plus, Search, Trash2 } from "lucide-react";
import type { ChatSession, WorkspaceFolder } from "../types";

type Props = {
  collapsed: boolean;
  folders: WorkspaceFolder[];
  sessions: ChatSession[];
  selectedSessionId?: string;
  searchFocusToken: number;
  onToggle: () => void;
  onSelectSession: (sessionId: string) => void;
  onNewSession: (folderId: string) => void;
  onDeleteSession: (sessionId: string) => void;
};

function formatSessionTitle(title: string) {
  if (/^첨부\s*파일\s*:/i.test(title) || /^attachment\s*:/i.test(title)) {
    return "첨부 작업";
  }
  return title;
}

export function LeftSessionPanel({
  collapsed,
  folders,
  sessions,
  selectedSessionId,
  searchFocusToken,
  onToggle,
  onSelectSession,
  onNewSession,
  onDeleteSession
}: Props) {
  const [query, setQuery] = useState("");
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("left.collapsedFolders") || "[]"));
    } catch {
      return new Set();
    }
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const sessionsByFolder = useMemo(() => {
    return new Map(
      folders.map((folder) => [
        folder.id,
        sessions.filter((session) => {
          if (session.folderId !== folder.id) return false;
          if (!normalizedQuery) return true;
          return `${folder.name} ${folder.path} ${session.title}`.toLowerCase().includes(normalizedQuery);
        })
      ])
    );
  }, [folders, normalizedQuery, sessions]);

  useEffect(() => {
    if (searchFocusToken > 0) searchRef.current?.focus();
  }, [searchFocusToken]);

  useEffect(() => {
    localStorage.setItem("left.collapsedFolders", JSON.stringify([...collapsedFolderIds]));
  }, [collapsedFolderIds]);

  function toggleFolder(folderId: string) {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  if (collapsed) {
    return (
      <aside className="side-panel collapsed-panel">
        <button className="icon-button" title="세션 패널 펼치기" aria-label="세션 패널 펼치기" onClick={onToggle}>
          <Menu size={17} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="side-panel left-panel">
      <div className="panel-titlebar">
        <strong><MessageSquare size={15} /> 세션</strong>
        <button className="icon-button" title="세션 패널 접기" aria-label="세션 패널 접기" onClick={onToggle}>
          <ChevronLeft size={17} />
        </button>
      </div>
      <div className="session-list">
        <label className="session-search">
          <Search size={14} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="세션 검색"
          />
        </label>
        {folders.map((folder) => {
          const folderSessions = sessionsByFolder.get(folder.id) || [];
          if (normalizedQuery && folderSessions.length === 0) return null;
          const folderCollapsed = collapsedFolderIds.has(folder.id) && !normalizedQuery;
          return (
            <section className="folder-group" key={folder.id}>
              <div className="folder-row">
                <button className="folder-toggle" title={folder.path} onClick={() => toggleFolder(folder.id)}>
                  {folderCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <Folder size={13} />
                  <span>{folder.name}</span>
                  <em>{folderSessions.length}</em>
                </button>
                <button className="icon-button small" title="새 세션" aria-label="새 세션" onClick={() => onNewSession(folder.id)}>
                  <Plus size={14} />
                </button>
              </div>
              {!folderCollapsed && (
                <div className="folder-sessions">
                  {folderSessions.map((session) => (
                    <div className={`session-row ${session.id === selectedSessionId ? "active" : ""}`} key={session.id}>
                      <button
                        className="session-item"
                        onClick={() => onSelectSession(session.id)}
                      >
                        {formatSessionTitle(session.title)}
                      </button>
                      <button
                        className="session-delete"
                        title="세션 삭제"
                        aria-label="세션 삭제"
                        onClick={() => onDeleteSession(session.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

import type { ChatSession, WorkspaceFolder } from "../types";

type Props = {
  collapsed: boolean;
  folders: WorkspaceFolder[];
  sessions: ChatSession[];
  selectedSessionId?: string;
  onToggle: () => void;
  onSelectSession: (sessionId: string) => void;
  onNewSession: (folderId: string) => void;
};

export function LeftSessionPanel({
  collapsed,
  folders,
  sessions,
  selectedSessionId,
  onToggle,
  onSelectSession,
  onNewSession
}: Props) {
  if (collapsed) {
    return (
      <aside className="side-panel collapsed-panel">
        <button className="icon-button" title="세션 패널 펼치기" onClick={onToggle}>☰</button>
      </aside>
    );
  }

  return (
    <aside className="side-panel left-panel">
      <div className="panel-titlebar">
        <strong>세션</strong>
        <button className="icon-button" title="세션 패널 접기" onClick={onToggle}>‹</button>
      </div>
      <div className="session-list">
        {folders.map((folder) => {
          const folderSessions = sessions.filter((session) => session.folderId === folder.id);
          return (
            <section className="folder-group" key={folder.id}>
              <div className="folder-row">
                <span title={folder.path}>{folder.name}</span>
                <button className="icon-button small" title="새 세션" onClick={() => onNewSession(folder.id)}>＋</button>
              </div>
              {folderSessions.map((session) => (
                <button
                  className={`session-item ${session.id === selectedSessionId ? "active" : ""}`}
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                >
                  {session.title}
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

import type { CodexCliState, ParsedCodexStatus } from "../types";

type Props = {
  codex?: CodexCliState;
  status?: ParsedCodexStatus;
  loading: boolean;
  error?: string;
  onRefresh: () => void;
};

export function StatusCard({ codex, status, loading, error, onRefresh }: Props) {
  return (
    <section className="panel-card">
      <div className="card-titlebar">
        <strong>상태</strong>
        <button className="icon-button small" title="상태 새로고침" onClick={onRefresh}>⟳</button>
      </div>
      {!codex?.installed && <p className="muted">Codex CLI 미설치</p>}
      {codex?.installed && !codex.loggedIn && <p className="warning-text">Codex 로그인이 필요합니다.</p>}
      {codex?.version && <p className="muted">{codex.version}</p>}
      {loading && <p className="muted">불러오는 중</p>}
      {error && <p className="warning-text">{error}</p>}
      {status?.account && (
        <div className="status-block">
          <span>계정</span>
          <strong>{status.account}</strong>
        </div>
      )}
      {status?.limits.map((limit) => (
        <div className="status-block" key={`${limit.label}-${limit.resetsAt}`}>
          <span>{limit.label}</span>
          <strong>{limit.leftPercent}% 남음 · {limit.resetsAt} 초기화</strong>
        </div>
      ))}
    </section>
  );
}

import { Activity, RefreshCw } from "lucide-react";
import type { CodexCliState, ParsedCodexStatus } from "../types";

type Props = {
  codex?: CodexCliState;
  status?: ParsedCodexStatus;
  loading: boolean;
  error?: string;
  updatedAt?: string;
  onRefresh: () => void;
};

function formatUpdatedAt(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function StatusCard({ codex, status, loading, error, updatedAt, onRefresh }: Props) {
  return (
    <section className="panel-card">
      <div className="card-titlebar">
        <strong><Activity size={14} /> 상태</strong>
        <button className="icon-button small" title="상태 새로고침" aria-label="상태 새로고침" onClick={onRefresh}>
          <RefreshCw size={13} />
        </button>
      </div>
      {!codex?.installed && <p className="muted">Codex CLI 미설치</p>}
      {codex?.installed && !codex.loggedIn && <p className="warning-text">Codex 로그인이 필요합니다.</p>}
      {codex?.version && <p className="muted">{codex.version}</p>}
      {loading && <p className="muted">자동 새로고침 중</p>}
      {updatedAt && !loading && <p className="muted">마지막 갱신 {formatUpdatedAt(updatedAt)}</p>}
      {error && <p className="warning-text">{error}</p>}
      {status?.account && (
        <div className="status-block">
          <span>계정</span>
          <strong>{status.account}</strong>
        </div>
      )}
      {status?.model && (
        <div className="status-block">
          <span>모델</span>
          <strong>{status.model}</strong>
        </div>
      )}
      {status?.directory && (
        <div className="status-block">
          <span>작업 폴더</span>
          <strong>{status.directory}</strong>
        </div>
      )}
      {typeof status?.contextLeftPercent === "number" && (
        <div className="status-block">
          <span>컨텍스트</span>
          <strong>{status.contextLeftPercent}% 남음</strong>
        </div>
      )}
      {status?.limits.map((limit) => (
        <div className="status-block" key={`${limit.label}-${limit.resetsAt}`}>
          <span>{limit.label}</span>
          <strong>{limit.leftPercent}% 남음 · {limit.resetsAt} 초기화</strong>
        </div>
      ))}
      {status?.note && <p className="muted">{status.note}</p>}
    </section>
  );
}

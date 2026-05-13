import type { AttachmentRef, CodexCliState, ParsedCodexStatus, SkillCard } from "../types";
import { FontSettingsModal } from "./FontSettingsModal";
import { ImageListCard } from "./ImageListCard";
import { SkillCards } from "./SkillCards";
import { StatusCard } from "./StatusCard";

type FontSettings = {
  fontKorean: string;
  fontTerminal: string;
  fontCode: string;
  fontMarkdown: string;
};

type Props = {
  collapsed: boolean;
  codex?: CodexCliState;
  status?: ParsedCodexStatus;
  statusLoading: boolean;
  statusError?: string;
  attachments: AttachmentRef[];
  skills: SkillCard[];
  fontSettings: FontSettings;
  onToggle: () => void;
  onRefreshStatus: () => void;
  onUseSkill: (prompt: string, runNow: boolean) => void;
  onFontChange: (settings: FontSettings) => void;
};

export function RightPanel({
  collapsed,
  codex,
  status,
  statusLoading,
  statusError,
  attachments,
  skills,
  fontSettings,
  onToggle,
  onRefreshStatus,
  onUseSkill,
  onFontChange
}: Props) {
  if (collapsed) {
    return (
      <aside className="side-panel collapsed-panel">
        <button className="icon-button" title="오른쪽 패널 펼치기" onClick={onToggle}>▣</button>
      </aside>
    );
  }

  return (
    <aside className="side-panel right-panel">
      <div className="panel-titlebar">
        <strong>패널</strong>
        <button className="icon-button" title="오른쪽 패널 접기" onClick={onToggle}>›</button>
      </div>
      <div className="right-card-stack">
        <StatusCard codex={codex} status={status} loading={statusLoading} error={statusError} onRefresh={onRefreshStatus} />
        <ImageListCard attachments={attachments} />
        <SkillCards skills={skills} onUse={onUseSkill} />
        <FontSettingsModal settings={fontSettings} onChange={onFontChange} />
      </div>
    </aside>
  );
}

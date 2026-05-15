import { ChevronRight, PanelRight } from "lucide-react";
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
  statusUpdatedAt?: string;
  attachments: AttachmentRef[];
  skills: SkillCard[];
  fontSettings: FontSettings;
  onToggle: () => void;
  onRefreshStatus: () => void;
  onUseSkill: (skill: SkillCard, runNow: boolean) => void;
  onAttachmentsChanged: () => void;
  onFontChange: (settings: FontSettings) => void;
};

export function RightPanel({
  collapsed,
  codex,
  status,
  statusLoading,
  statusError,
  statusUpdatedAt,
  attachments,
  skills,
  fontSettings,
  onToggle,
  onRefreshStatus,
  onUseSkill,
  onAttachmentsChanged,
  onFontChange
}: Props) {
  if (collapsed) {
    return (
      <aside className="side-panel collapsed-panel">
        <button className="icon-button" title="오른쪽 패널 펼치기" aria-label="오른쪽 패널 펼치기" onClick={onToggle}>
          <PanelRight size={17} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="side-panel right-panel">
      <div className="panel-titlebar">
        <strong><PanelRight size={15} /> 패널</strong>
        <button className="icon-button" title="오른쪽 패널 접기" aria-label="오른쪽 패널 접기" onClick={onToggle}>
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="right-card-stack">
        <StatusCard
          codex={codex}
          status={status}
          loading={statusLoading}
          error={statusError}
          updatedAt={statusUpdatedAt}
          onRefresh={onRefreshStatus}
        />
        <ImageListCard attachments={attachments} onChanged={onAttachmentsChanged} />
        <SkillCards skills={skills} onUse={onUseSkill} />
        <FontSettingsModal settings={fontSettings} onChange={onFontChange} />
      </div>
    </aside>
  );
}

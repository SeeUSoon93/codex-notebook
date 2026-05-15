import { Clipboard, ExternalLink, FolderSearch, Images, Trash2 } from "lucide-react";
import type { AttachmentRef } from "../types";

type Props = {
  attachments: AttachmentRef[];
  onChanged: () => void;
};

export function ImageListCard({ attachments, onChanged }: Props) {
  const images = attachments.filter((attachment) => attachment.type === "image");
  const runAction = async (image: AttachmentRef, action: "open" | "reveal" | "copy-path" | "delete") => {
    const method = action === "delete" ? "DELETE" : "POST";
    const suffix = action === "delete" ? "" : `/${action}`;
    await fetch(`/api/attachments/${image.id}${suffix}`, { method });
    if (action === "delete") onChanged();
  };

  return (
    <section className="panel-card">
      <div className="card-titlebar">
        <strong><Images size={14} /> 이미지</strong>
        <span className="count-pill">{images.length}</span>
      </div>
      <div className="image-grid">
        {images.map((image) => (
          <div className="image-item" key={image.id}>
            <button className="image-thumb" onClick={() => runAction(image, "open")} title={image.filename}>
              <img src={`/api/attachments/${image.id}/content`} alt={image.filename} />
            </button>
            <div className="image-actions">
              <button className="icon-button small" title="원본 열기" aria-label="원본 열기" onClick={() => runAction(image, "open")}>
                <ExternalLink size={12} />
              </button>
              <button className="icon-button small" title="파일 위치 열기" aria-label="파일 위치 열기" onClick={() => runAction(image, "reveal")}>
                <FolderSearch size={12} />
              </button>
              <button className="icon-button small" title="경로 복사" aria-label="경로 복사" onClick={() => runAction(image, "copy-path")}>
                <Clipboard size={12} />
              </button>
              <button className="icon-button small" title="삭제" aria-label="삭제" onClick={() => runAction(image, "delete")}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {images.length === 0 && <p className="muted">이미지 없음</p>}
    </section>
  );
}

import type { AttachmentRef } from "../types";

type Props = {
  attachments: AttachmentRef[];
};

export function ImageListCard({ attachments }: Props) {
  const images = attachments.filter((attachment) => attachment.type === "image");
  return (
    <section className="panel-card">
      <div className="card-titlebar">
        <strong>이미지</strong>
        <span className="count-pill">{images.length}</span>
      </div>
      <div className="image-grid">
        {images.map((image) => (
          <a className="image-thumb" href={`/api/attachments/${image.id}/content`} target="_blank" rel="noreferrer" key={image.id} title={image.filename}>
            <img src={`/api/attachments/${image.id}/content`} alt={image.filename} />
          </a>
        ))}
      </div>
      {images.length === 0 && <p className="muted">이미지 없음</p>}
    </section>
  );
}

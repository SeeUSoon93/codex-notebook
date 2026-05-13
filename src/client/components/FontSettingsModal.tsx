type FontSettings = {
  fontKorean: string;
  fontTerminal: string;
  fontCode: string;
  fontMarkdown: string;
};

type Props = {
  settings: FontSettings;
  onChange: (settings: FontSettings) => void;
};

const fields: Array<{ key: keyof FontSettings; label: string }> = [
  { key: "fontKorean", label: "한글 폰트" },
  { key: "fontTerminal", label: "터미널 폰트" },
  { key: "fontCode", label: "코드 폰트" },
  { key: "fontMarkdown", label: "마크다운 폰트" }
];

export function FontSettingsModal({ settings, onChange }: Props) {
  return (
    <section className="panel-card">
      <div className="card-titlebar">
        <strong>폰트</strong>
      </div>
      <div className="font-fields">
        {fields.map((field) => (
          <label className="font-field" key={field.key}>
            <span>{field.label}</span>
            <input
              value={settings[field.key]}
              onChange={(event) => onChange({ ...settings, [field.key]: event.target.value })}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

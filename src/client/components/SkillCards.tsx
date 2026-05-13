import type { SkillCard } from "../types";

type Props = {
  skills: SkillCard[];
  onUse: (prompt: string, runNow: boolean) => void;
};

export function SkillCards({ skills, onUse }: Props) {
  return (
    <section className="panel-card">
      <div className="card-titlebar">
        <strong>스킬</strong>
      </div>
      <div className="skill-grid">
        {skills.map((skill) => (
          <button
            className="skill-card"
            key={skill.id}
            title={skill.description}
            onClick={(event) => onUse(skill.prompt, event.shiftKey)}
          >
            <strong>{skill.title}</strong>
            <span>{skill.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

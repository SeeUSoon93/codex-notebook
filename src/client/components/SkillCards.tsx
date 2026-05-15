import { Sparkles } from "lucide-react";
import type { SkillCard } from "../types";

type Props = {
  skills: SkillCard[];
  onUse: (skill: SkillCard, runNow: boolean) => void;
};

export function SkillCards({ skills, onUse }: Props) {
  return (
    <section className="panel-card skills-panel-card">
      <div className="card-titlebar">
        <strong><Sparkles size={14} /> 스킬</strong>
        <span className="count-pill">{skills.length}</span>
      </div>
      <div className="skill-grid">
        {skills.map((skill) => (
          <button
            className="skill-card"
            key={skill.id}
            title={skill.description}
            onClick={(event) => onUse(skill, event.shiftKey)}
          >
            <strong><Sparkles size={13} /> {skill.title}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

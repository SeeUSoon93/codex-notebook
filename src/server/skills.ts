import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SkillCard } from "./types.js";

function getCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function findSkillFiles(root: string) {
  const files: string[] = [];
  const queue = [root];
  let visited = 0;

  while (queue.length > 0 && visited < 4000) {
    const current = queue.shift()!;
    visited += 1;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase() === "skill.md") {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function readMetadata(markdown: string) {
  const block = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || "";
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  return { name, description };
}

function fileToSkill(root: string, filePath: string): SkillCard | undefined {
  let markdown = "";
  try {
    markdown = fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }

  const metadata = readMetadata(markdown);
  const dirName = path.basename(path.dirname(filePath));
  const name = metadata.name || dirName;
  const relative = path.relative(root, path.dirname(filePath)).replace(/\\/g, "/");
  const description = metadata.description || `${name} skill`;

  return {
    id: `skill:${relative || name}`,
    title: name,
    description,
    prompt: `$${name}`,
    source: "skill",
    sourcePath: filePath
  };
}

export function discoverCodexSkills() {
  const discovered: SkillCard[] = [];
  const seen = new Set<string>();
  const root = path.join(getCodexHome(), "skills");

  for (const file of findSkillFiles(root)) {
    const skill = fileToSkill(root, file);
    if (!skill || seen.has(skill.id)) continue;
    seen.add(skill.id);
    discovered.push(skill);
  }

  return discovered.sort((a, b) => a.title.localeCompare(b.title));
}

export function listAllSkills() {
  return discoverCodexSkills();
}

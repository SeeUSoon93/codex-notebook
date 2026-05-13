import type { ParsedCodexStatus } from "./types.js";

export function parseCodexStatus(raw: string): ParsedCodexStatus {
  const account = raw.match(/Account:\s*([^\r\n]+)/)?.[1]?.trim();
  const limits: ParsedCodexStatus["limits"] = [];
  const limitRe = /((?:\d+h|Weekly)\s+limit):[\s\S]*?(\d+)%\s+left\s+\(resets\s+([^)]+)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = limitRe.exec(raw))) {
    const sourceLabel = match[1].trim();
    const label = sourceLabel.toLowerCase().startsWith("weekly")
      ? "주간 한도"
      : `${sourceLabel.replace(/\s+limit/i, "")} 한도`;
    limits.push({
      label,
      leftPercent: Number(match[2]),
      resetsAt: match[3].trim()
    });
  }

  return { account, limits, raw };
}

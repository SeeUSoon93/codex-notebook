import type { ParsedCodexStatus } from "./types.js";

type AppServerAccount =
  | { type: "chatgpt"; email: string; planType: string }
  | { type: string };

type RateLimitWindow = {
  usedPercent?: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
};

type RateLimitSnapshot = {
  limitId?: string | null;
  limitName?: string | null;
  planType?: string | null;
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
};

export type CodexAppServerStatus = {
  account?: AppServerAccount | null;
  rateLimits?: RateLimitSnapshot | null;
  rateLimitsByLimitId?: Record<string, RateLimitSnapshot> | null;
};

function formatPlan(planType?: string | null) {
  if (!planType) return undefined;
  return planType
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatResetTime(epochSeconds?: number | null) {
  if (!epochSeconds) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(epochSeconds * 1000));
}

function formatDurationLabel(window?: RateLimitWindow | null) {
  const mins = window?.windowDurationMins;
  if (!mins) return "한도";
  if (mins === 10080) return "주간 한도";
  if (mins % 60 === 0) return `${mins / 60}시간 한도`;
  return `${mins}분 한도`;
}

function windowToLimit(window: RateLimitWindow | null | undefined) {
  if (!window || typeof window.usedPercent !== "number") return undefined;
  const usedPercent = Math.max(0, Math.min(100, window.usedPercent));
  return {
    label: formatDurationLabel(window),
    leftPercent: Math.max(0, 100 - usedPercent),
    usedPercent,
    resetsAt: formatResetTime(window.resetsAt),
    resetsAtIso: window.resetsAt ? new Date(window.resetsAt * 1000).toISOString() : undefined
  };
}

function isChatgptAccount(account: AppServerAccount | null | undefined): account is Extract<AppServerAccount, { type: "chatgpt" }> {
  return account?.type === "chatgpt" && "email" in account && "planType" in account;
}

export function parseCodexAppServerStatus(status: CodexAppServerStatus): ParsedCodexStatus {
  const snapshot =
    status.rateLimitsByLimitId?.codex ||
    status.rateLimits ||
    Object.values(status.rateLimitsByLimitId || {})[0];
  const limits = [windowToLimit(snapshot?.primary), windowToLimit(snapshot?.secondary)]
    .filter((limit): limit is NonNullable<ReturnType<typeof windowToLimit>> => Boolean(limit));
  const planType = isChatgptAccount(status.account) ? status.account.planType : snapshot?.planType;
  const account = isChatgptAccount(status.account)
    ? `${status.account.email}${formatPlan(status.account.planType) ? ` (${formatPlan(status.account.planType)})` : ""}`
    : status.account?.type;

  return {
    account,
    planType: formatPlan(planType),
    source: "app-server",
    limits,
    note: limits.length === 0 ? "Codex app-server가 한도 정보를 반환하지 않았습니다." : undefined,
    raw: JSON.stringify(status)
  };
}

export function parseCodexStatus(raw: string): ParsedCodexStatus {
  const cleaned = raw
    .replace(/[│╭╮╰╯]/g, " ")
    .replace(/[ \t]+/g, " ");
  const account = cleaned.match(/\bAccount:\s*([^\r\n]+)/i)?.[1]?.trim();
  const model = cleaned.match(/\bmodel:\s*([^\r\n]+)/i)?.[1]?.trim();
  const directory = cleaned.match(/\bdirectory:\s*([^\r\n]+)/i)?.[1]?.trim();
  const contextLeftPercent = Number(cleaned.match(/(\d+)%\s+context\s+left/i)?.[1]);
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

  const note =
    !account && limits.length === 0
      ? "현재 Codex CLI /status 출력에 계정/한도 정보가 없습니다."
      : undefined;

  return {
    account,
    model,
    directory,
    contextLeftPercent: Number.isFinite(contextLeftPercent) ? contextLeftPercent : undefined,
    note,
    source: "tui",
    limits,
    raw
  };
}

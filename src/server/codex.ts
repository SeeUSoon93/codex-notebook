import { spawn } from "node:child_process";
import { spawn as spawnPty } from "node-pty";
import type { CodexAppServerStatus } from "./status.js";
import type { ChatSession, CodexCliState, Intelligence, PermissionMode } from "./types.js";

type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  appStatus?: CodexAppServerStatus;
};

function codexCandidates() {
  return process.platform === "win32" ? ["codex.cmd", "codex.exe", "codex"] : ["codex"];
}

function runCommand(command: string, args: string[], options: { cwd?: string; timeoutMs?: number } = {}) {
  return new Promise<CommandResult>((resolve) => {
    let child;
    let settled = false;
    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        shell: process.platform === "win32",
        windowsHide: true
      });
    } catch (error) {
      finish({ code: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) });
      return;
    }
    let stdout = "";
    let stderr = "";
    const timeout = options.timeoutMs
      ? setTimeout(() => {
        child.kill();
        finish({ code: 124, stdout, stderr: stderr || "Command timed out" });
      }, options.timeoutMs)
      : undefined;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      finish({ code: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      finish({ code, stdout, stderr });
    });
  });
}

async function runFirstAvailable(args: string[], options: { cwd?: string; timeoutMs?: number } = {}) {
  let last: CommandResult = { code: 1, stdout: "", stderr: "Codex CLI가 설치되어 있지 않습니다." };
  for (const command of codexCandidates()) {
    const result = await runCommand(command, args, options);
    last = result;
    if (!/ENOENT/i.test(result.stderr)) return result;
  }
  return last;
}

function permissionToArgs(mode: PermissionMode) {
  if (mode === "read-only") {
    return ["--sandbox", "read-only"];
  }
  if (mode === "full-auto") {
    return ["--sandbox", "workspace-write"];
  }
  return ["--sandbox", "workspace-write"];
}

function intelligenceToReasoning(intelligence: Intelligence) {
  switch (intelligence) {
    case "fast":
      return "low";
    case "deep":
      return "high";
    case "xhigh":
      return "xhigh";
    case "normal":
    default:
      return "medium";
  }
}

function stripTerminalSequences(value: string) {
  return value
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");
}

function readStatusFromTui(command: string, workspacePath: string) {
  return new Promise<CommandResult>((resolve) => {
    let output = "";
    let settled = false;
    const pty = spawnPty(command, ["--no-alt-screen", "--cd", workspacePath], {
      name: "xterm-color",
      cols: 120,
      rows: 40,
      cwd: workspacePath,
      env: process.env
    });

    const finish = (code: number | null, stderr = "") => {
      if (settled) return;
      settled = true;
      try {
        pty.kill();
      } catch {
        // PTY may already be closed.
      }
      resolve({ code, stdout: stripTerminalSequences(output), stderr });
    };

    pty.onData((data) => {
      output += data;
      if (
        ((/Weekly limit|(?:\d+h)\s+limit/i.test(output) && /Account:/i.test(output)) ||
          /\d+%\s+context\s+left/i.test(output))
      ) {
        setTimeout(() => finish(0), 250);
      }
    });
    pty.onExit(({ exitCode }) => finish(exitCode));

    setTimeout(() => pty.write("\u0015/status\n"), 1400);
    setTimeout(() => finish(output ? 0 : 124, output ? "" : "Codex /status timed out"), 10000);
  });
}

function readStatusFromAppServer(command: string) {
  return new Promise<CommandResult>((resolve) => {
    const child = spawn(command, ["app-server", "--listen", "stdio://"], {
      shell: process.platform === "win32",
      windowsHide: true
    });
    let buffer = "";
    let stderr = "";
    const results = new Map<number, unknown>();
    let settled = false;

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        child.kill();
      } catch {
        // Process may already have exited.
      }
      resolve(result);
    };

    const send = (id: number, method: string, params: unknown) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    };

    const maybeFinish = () => {
      const accountResult = results.get(2) as { account?: CodexAppServerStatus["account"] } | undefined;
      const limitsResult = results.get(3) as
        | {
            rateLimits?: CodexAppServerStatus["rateLimits"];
            rateLimitsByLimitId?: CodexAppServerStatus["rateLimitsByLimitId"];
          }
        | undefined;
      if (!accountResult || !limitsResult) return;
      const appStatus = {
        account: accountResult.account,
        rateLimits: limitsResult.rateLimits,
        rateLimitsByLimitId: limitsResult.rateLimitsByLimitId
      };
      finish({ code: 0, stdout: JSON.stringify(appStatus), stderr, appStatus });
    };

    const readLines = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } };
          if (typeof message.id === "number") {
            if (message.error) {
              finish({ code: 1, stdout: "", stderr: message.error.message || "Codex app-server request failed" });
              return;
            }
            results.set(message.id, message.result);
            if (message.id === 1) {
              send(2, "account/read", { refreshToken: false });
              send(3, "account/rateLimits/read", null);
            }
            maybeFinish();
          }
        } catch {
          stderr += `${line}\n`;
        }
      }
    };

    const timeout = setTimeout(() => {
      finish({ code: 124, stdout: "", stderr: stderr || "Codex app-server status timed out" });
    }, 7000);

    child.stdout.on("data", readLines);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => finish({ code: 1, stdout: "", stderr: error.message }));
    child.on("close", (code) => {
      if (!settled) finish({ code, stdout: "", stderr: stderr || "Codex app-server closed before status was returned" });
    });

    send(1, "initialize", {
      clientInfo: { name: "codex-notebook-local", version: "0.1.0" },
      capabilities: { experimentalApi: true }
    });
  });
}

export class CodexCommandAdapter {
  readonly executable = process.platform === "win32" ? "codex.cmd" : "codex";

  async checkState(): Promise<CodexCliState> {
    const version = await runFirstAvailable(["--version"], { timeoutMs: 5000 });
    if (version.code !== 0) {
      return {
        installed: false,
        loggedIn: false,
        message: version.stderr || "Codex CLI가 설치되어 있지 않습니다."
      };
    }

    const login = await runFirstAvailable(["login", "status"], { timeoutMs: 5000 });
    return {
      installed: true,
      loggedIn: login.code === 0 && !/not logged in/i.test(`${login.stdout}\n${login.stderr}`),
      version: (version.stdout || version.stderr).trim(),
      message: (login.stdout || login.stderr).trim()
    };
  }

  async listModels() {
    const fallback = ["gpt-5.5", "gpt-5.5-codex", "codex-mini-latest"];
    const result = await runFirstAvailable(["debug", "models", "--bundled"], { timeoutMs: 5000 });
    if (result.code !== 0) return fallback;
    try {
      const parsed = JSON.parse(result.stdout) as {
        models?: Array<{ slug?: string; visibility?: string; supported_in_api?: boolean }>;
      };
      const models = (parsed.models || [])
        .filter((model) => model.slug && model.visibility !== "hidden")
        .map((model) => model.slug!)
        .slice(0, 40);
      return models.length > 0 ? models : fallback;
    } catch {
      return fallback;
    }
  }

  buildExecArgs(session: ChatSession, _prompt: string, workspacePath: string) {
    const common = [
      "--json",
      "--skip-git-repo-check",
      "-m",
      session.model,
      "-c",
      `model_reasoning_effort="${intelligenceToReasoning(session.intelligence)}"`
    ];

    if (session.codexSessionId) {
      return [
        "exec",
        "resume",
        ...common,
        session.codexSessionId,
        "-"
      ];
    }

    return [
      "exec",
      "--cd",
      workspacePath,
      "--color",
      "never",
      ...common,
      ...permissionToArgs(session.permissionMode),
      "-"
    ];
  }

  spawnExec(session: ChatSession, prompt: string, workspacePath: string) {
    const child = spawn(this.executable, this.buildExecArgs(session, prompt, workspacePath), {
      cwd: workspacePath,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdin.end(prompt);
    return child;
  }

  async readStatus(workspacePath: string) {
    const state = await this.checkState();
    if (!state.installed) {
      return { code: 1, stdout: "", stderr: "Codex CLI가 설치되어 있지 않습니다." };
    }
    if (!state.loggedIn) {
      return {
        code: 1,
        stdout: "",
        stderr: "Codex 로그인이 필요합니다. 하단 터미널에서 codex login을 실행해 주세요."
      };
    }
    const appServerStatus = await readStatusFromAppServer(this.executable);
    if (appServerStatus.code === 0 && appServerStatus.appStatus) return appServerStatus;
    const tuiStatus = await readStatusFromTui(this.executable, workspacePath);
    return tuiStatus.code === 0 ? tuiStatus : appServerStatus;
  }
}

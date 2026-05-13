import { spawn } from "node:child_process";
import type { ChatSession, CodexCliState, Intelligence, PermissionMode } from "./types.js";

type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

function runCommand(command: string, args: string[], options: { cwd?: string; timeoutMs?: number } = {}) {
  return new Promise<CommandResult>((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill();
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
      resolve({ code: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

function permissionToArgs(mode: PermissionMode) {
  if (mode === "read-only") {
    return ["--sandbox", "read-only", "--ask-for-approval", "on-request"];
  }
  if (mode === "full-auto") {
    return ["--sandbox", "workspace-write", "--ask-for-approval", "never"];
  }
  return ["--sandbox", "workspace-write", "--ask-for-approval", "on-request"];
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

export class CodexCommandAdapter {
  readonly executable = "codex";

  async checkState(): Promise<CodexCliState> {
    const version = await runCommand(this.executable, ["--version"], { timeoutMs: 5000 });
    if (version.code !== 0) {
      return {
        installed: false,
        loggedIn: false,
        message: version.stderr || "Codex CLI가 설치되어 있지 않습니다."
      };
    }

    const login = await runCommand(this.executable, ["login", "status"], { timeoutMs: 5000 });
    return {
      installed: true,
      loggedIn: login.code === 0 && !/not logged in/i.test(`${login.stdout}\n${login.stderr}`),
      version: (version.stdout || version.stderr).trim(),
      message: (login.stdout || login.stderr).trim()
    };
  }

  buildExecArgs(session: ChatSession, prompt: string, workspacePath: string) {
    const args = [
      "exec",
      "--cd",
      workspacePath,
      "-m",
      session.model,
      "-c",
      `model_reasoning_effort="${intelligenceToReasoning(session.intelligence)}"`,
      ...permissionToArgs(session.permissionMode),
      prompt
    ];
    return args;
  }

  spawnExec(session: ChatSession, prompt: string, workspacePath: string) {
    return spawn(this.executable, this.buildExecArgs(session, prompt, workspacePath), {
      cwd: workspacePath,
      windowsHide: true
    });
  }

  async readStatus(workspacePath: string) {
    return runCommand(this.executable, ["exec", "--cd", workspacePath, "/status"], {
      cwd: workspacePath,
      timeoutMs: 20000
    });
  }
}

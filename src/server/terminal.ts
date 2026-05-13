import os from "node:os";
import type { IPty } from "node-pty";
import { spawn as spawnPty } from "node-pty";
import type WebSocket from "ws";

function defaultShell() {
  if (process.platform === "win32") {
    return process.env.ComSpec?.toLowerCase().includes("cmd.exe") ? "powershell.exe" : "powershell.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

export function attachTerminal(ws: WebSocket, cwd: string) {
  const pty: IPty = spawnPty(defaultShell(), [], {
    name: "xterm-color",
    cols: 100,
    rows: 24,
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color"
    }
  });

  pty.onData((data) => {
    ws.send(JSON.stringify({ type: "data", data }));
  });

  pty.onExit(({ exitCode }) => {
    ws.send(JSON.stringify({ type: "exit", exitCode }));
    ws.close();
  });

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as { type: string; data?: string; cols?: number; rows?: number };
      if (message.type === "input" && typeof message.data === "string") {
        pty.write(message.data);
      }
      if (message.type === "resize" && message.cols && message.rows) {
        pty.resize(message.cols, message.rows);
      }
    } catch {
      pty.write(raw.toString());
    }
  });

  ws.on("close", () => {
    pty.kill();
  });

  ws.send(JSON.stringify({ type: "data", data: `\r\nCodex Notebook terminal: ${cwd || os.homedir()}\r\n` }));
  return pty;
}

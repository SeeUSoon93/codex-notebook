#!/usr/bin/env node
import { spawn } from "node:child_process";
import { startServer } from "../src/server/index.js";

function openBrowser(url: string) {
  const platform = process.platform;
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = portArg ? Number(portArg.slice("--port=".length)) : Number(process.env.PORT || 3737);

const server = await startServer({ port, openUrl: true });
console.log(`Codex Notebook Local: ${server.url}`);
openBrowser(server.url);

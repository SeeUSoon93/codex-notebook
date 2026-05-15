import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

type Props = {
  sessionId?: string;
  open: boolean;
  collapsed: boolean;
  theme: "dark" | "light";
};

export function BottomTerminal({ sessionId, open, collapsed, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal>();
  const fitRef = useRef<FitAddon>();
  const wsRef = useRef<WebSocket>();

  useEffect(() => {
    if (!open || collapsed || !sessionId || !containerRef.current) return;

    const terminalFont =
      getComputedStyle(document.documentElement).getPropertyValue("--font-terminal").trim() || "\"Cascadia Mono\"";
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: `${terminalFont}, "Cascadia Mono", Consolas, monospace`,
      fontSize: 13,
      theme:
        theme === "dark"
          ? { background: "#111318", foreground: "#d7dde8", cursor: "#e6eaf2", cursorAccent: "#111318" }
          : { background: "#f8fafc", foreground: "#0f172a", cursor: "#0f172a", cursorAccent: "#ffffff", selectionBackground: "#bfdbfe" }
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (
        event.type === "keydown" &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        event.preventDefault();
      }
      return true;
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(containerRef.current);
    fit.fit();

    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${window.location.host}/ws/terminal?sessionId=${encodeURIComponent(sessionId)}`);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "data") terminal.write(message.data);
    };
    terminal.onData((data) => {
      socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "input", data }));
    });

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      socket.readyState === WebSocket.OPEN &&
        socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
    });
    resizeObserver.observe(containerRef.current);

    terminalRef.current = terminal;
    fitRef.current = fit;
    wsRef.current = socket;

    return () => {
      resizeObserver.disconnect();
      socket.close();
      terminal.dispose();
    };
  }, [open, collapsed, sessionId, theme]);

  return (
    <div
      className="terminal-view"
      ref={containerRef}
      onKeyDownCapture={(event) => {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
        }
      }}
    />
  );
}

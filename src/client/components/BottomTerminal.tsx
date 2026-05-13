import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

type Props = {
  sessionId?: string;
  open: boolean;
  collapsed: boolean;
};

export function BottomTerminal({ sessionId, open, collapsed }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal>();
  const fitRef = useRef<FitAddon>();
  const wsRef = useRef<WebSocket>();

  useEffect(() => {
    if (!open || collapsed || !sessionId || !containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "var(--font-terminal)",
      fontSize: 13,
      theme: {
        background: "#111318",
        foreground: "#d7dde8"
      }
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
  }, [open, collapsed, sessionId]);

  return <div className="terminal-view" ref={containerRef} />;
}

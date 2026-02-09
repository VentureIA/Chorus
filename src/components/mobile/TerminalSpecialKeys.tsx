import { writeStdin } from "@/lib/terminal";

interface TerminalSpecialKeysProps {
  sessionId: number;
}

/**
 * Floating touch bar with special keys (Ctrl+C, Tab, arrows, Esc)
 * for mobile users who don't have a physical keyboard.
 */
export function TerminalSpecialKeys({ sessionId }: TerminalSpecialKeysProps) {
  const send = (data: string) => {
    writeStdin(sessionId, data).catch(console.error);
  };

  const keys = [
    { label: "Ctrl+C", data: "\x03" },
    { label: "Tab", data: "\t" },
    { label: "Esc", data: "\x1b" },
    { label: "\u2191", data: "\x1b[A" }, // Up arrow
    { label: "\u2193", data: "\x1b[B" }, // Down arrow
    { label: "Enter", data: "\r" },
  ];

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-muted border-t border-border overflow-x-auto">
      {keys.map((key) => (
        <button
          key={key.label}
          type="button"
          onClick={() => send(key.data)}
          className="shrink-0 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm active:bg-muted active:translate-y-px transition-all"
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}

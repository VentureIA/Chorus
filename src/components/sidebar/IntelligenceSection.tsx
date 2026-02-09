import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileWarning,
  Lightbulb,
  MessageCircle,
  Plus,
  Radio,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntelStore, type BroadcastMessage, type FileConflict, type ScratchpadEntry } from "@/stores/useIntelStore";

const cardClass =
  "rounded-lg border border-border bg-card p-2 shadow-sm transition-shadow hover:shadow-md";

const CATEGORY_ICON: Record<string, typeof Lightbulb> = {
  discovery: Lightbulb,
  warning: AlertTriangle,
  knowledge: BookOpen,
  info: MessageCircle,
};

const CATEGORY_COLOR: Record<string, string> = {
  discovery: "text-yellow-400",
  warning: "text-orange-500",
  knowledge: "text-green-400",
  info: "text-blue-400",
};

const SCRATCHPAD_COLOR: Record<string, string> = {
  architecture: "bg-purple-400/20 text-purple-400",
  api: "bg-blue-400/20 text-blue-400",
  decision: "bg-green-400/20 text-green-400",
  note: "bg-muted-foreground/20 text-muted-foreground",
};

type IntelTab = "bus" | "conflicts" | "scratchpad";

export function IntelligenceSection() {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<IntelTab>("bus");
  const broadcasts = useIntelStore((s) => s.broadcasts);
  const conflicts = useIntelStore((s) => s.conflicts);
  const scratchpad = useIntelStore((s) => s.scratchpad);

  const totalCount = broadcasts.length + conflicts.length + scratchpad.length;
  const hasConflicts = conflicts.length > 0;
  const prevConflictCount = useRef(conflicts.length);

  // Auto-switch to Conflicts tab when new conflicts arrive
  useEffect(() => {
    if (conflicts.length > prevConflictCount.current) {
      setActiveTab("conflicts");
      setExpanded(true);
    }
    prevConflictCount.current = conflicts.length;
  }, [conflicts.length]);

  return (
    <div className={cardClass}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown size={12} className="text-muted-foreground/80" />
          ) : (
            <ChevronRight size={12} className="text-muted-foreground/80" />
          )}
        </button>
        <Radio
          size={12}
          className={hasConflicts ? "text-orange-500 animate-pulse" : "text-cyan-400"}
        />
        <span className="flex-1">Intel</span>
        {totalCount > 0 && (
          <span className="bg-cyan-400/20 text-cyan-400 text-[9px] px-1 rounded-full font-bold">
            {totalCount}
          </span>
        )}
        {hasConflicts && (
          <span className="bg-orange-500/20 text-orange-500 text-[9px] px-1 rounded-full font-bold animate-pulse">
            {conflicts.length}!
          </span>
        )}
      </div>

      {expanded && (
        <>
          {/* Compact tab pills */}
          <div className="flex gap-0.5 mb-1.5">
            {([
              { id: "bus" as const, label: "Bus", count: broadcasts.length },
              { id: "conflicts" as const, label: "Conflicts", count: conflicts.length },
              { id: "scratchpad" as const, label: "Pad", count: scratchpad.length },
            ]).map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex-1 rounded px-1 py-px text-[9px] font-medium transition-colors ${
                  activeTab === id
                    ? id === "conflicts" && count > 0
                      ? "bg-orange-500/15 text-orange-400"
                      : "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className="ml-0.5 opacity-70">({count})</span>
                )}
              </button>
            ))}
          </div>

          {/* Scrollable content — compact height */}
          <div className="max-h-[120px] overflow-y-auto">
            {activeTab === "bus" && <ContextBusContent messages={broadcasts} />}
            {activeTab === "conflicts" && <ConflictsContent conflicts={conflicts} />}
            {activeTab === "scratchpad" && <ScratchpadContent entries={scratchpad} />}
          </div>
        </>
      )}
    </div>
  );
}

function ContextBusContent({ messages }: { messages: BroadcastMessage[] }) {
  const sorted = useMemo(() => [...messages].reverse(), [messages]);

  if (messages.length === 0) {
    return (
      <div className="px-1 py-0.5 text-[10px] text-muted-foreground/60">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="space-y-px">
      {sorted.map((msg) => {
        const Icon = CATEGORY_ICON[msg.category] ?? MessageCircle;
        const color = CATEGORY_COLOR[msg.category] ?? "text-muted-foreground";
        return (
          <div
            key={msg.id}
            className="flex items-start gap-1.5 rounded px-1 py-0.5 text-foreground hover:bg-muted/40"
          >
            <Icon size={10} className={`shrink-0 mt-px ${color}`} />
            <div className="min-w-0 flex-1">
              <span className="text-[9px] text-muted-foreground">#{msg.session_id} </span>
              <span className="text-[10px] break-words">{msg.message}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConflictsContent({ conflicts }: { conflicts: FileConflict[] }) {
  if (conflicts.length === 0) {
    return (
      <div className="px-1 py-0.5 text-[10px] text-muted-foreground/60">
        No conflicts.
      </div>
    );
  }

  return (
    <div className="space-y-px">
      {conflicts.map((conflict) => (
        <div
          key={`${conflict.file_path}-${conflict.sessions.join(",")}`}
          className="flex items-start gap-1.5 rounded px-1 py-0.5 text-foreground bg-orange-500/5 hover:bg-orange-500/10"
        >
          <FileWarning size={10} className="shrink-0 mt-px text-orange-500" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium text-orange-400 truncate">
              {conflict.file_path}
            </div>
            <div className="text-[9px] text-muted-foreground">
              {conflict.sessions.map((s) => `#${s}`).join(", ")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ScratchpadContent({ entries }: { entries: ScratchpadEntry[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const { writeScratchpad, clearScratchpad } = useIntelStore();
  const sorted = useMemo(() => [...entries].reverse(), [entries]);

  const handleAdd = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const formData = new FormData(form);
      const title = formData.get("title") as string;
      const content = formData.get("content") as string;
      const category = formData.get("category") as string;

      if (title && content) {
        await writeScratchpad(category || "note", title, content);
        setShowAdd(false);
        form.reset();
      }
    },
    [writeScratchpad],
  );

  return (
    <>
      <div className="flex items-center justify-between px-1 mb-0.5">
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-0.5 text-[9px] text-primary hover:text-primary/80"
        >
          <Plus size={9} />
          Add
        </button>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={clearScratchpad}
            className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={9} />
          </button>
        )}
      </div>

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="px-1 py-1 space-y-0.5 bg-muted/30 rounded mb-1"
        >
          <select
            name="category"
            className="w-full rounded bg-background border border-border px-1 py-px text-[9px] text-foreground"
          >
            <option value="note">Note</option>
            <option value="architecture">Architecture</option>
            <option value="api">API</option>
            <option value="decision">Decision</option>
          </select>
          <input
            name="title"
            placeholder="Title"
            className="w-full rounded bg-background border border-border px-1 py-px text-[9px] text-foreground placeholder:text-muted-foreground"
            required
          />
          <textarea
            name="content"
            placeholder="Content..."
            rows={2}
            className="w-full rounded bg-background border border-border px-1 py-px text-[9px] text-foreground placeholder:text-muted-foreground resize-none"
            required
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded px-1.5 py-px text-[9px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-primary px-1.5 py-px text-[9px] text-primary-foreground"
            >
              Add
            </button>
          </div>
        </form>
      )}

      {entries.length === 0 && !showAdd ? (
        <div className="px-1 py-0.5 text-[10px] text-muted-foreground/60">
          No notes yet.
        </div>
      ) : (
        <div className="space-y-px">
          {sorted.map((entry) => (
            <div
              key={entry.id}
              className="rounded px-1 py-0.5 text-foreground hover:bg-muted/40"
            >
              <div className="flex items-center gap-1">
                <span
                  className={`shrink-0 rounded px-0.5 text-[8px] leading-tight ${
                    SCRATCHPAD_COLOR[entry.category] ?? SCRATCHPAD_COLOR.note
                  }`}
                >
                  {entry.category}
                </span>
                <span className="text-[10px] font-medium truncate flex-1">{entry.title}</span>
              </div>
              <div className="text-[9px] text-muted-foreground break-words line-clamp-2">{entry.content}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

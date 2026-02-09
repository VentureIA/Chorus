import { invoke, listen, type UnlistenFn } from "@/lib/transport";
import { create } from "zustand";

/** A broadcast message from one session to all others. */
export interface BroadcastMessage {
  id: string;
  session_id: number;
  category: string; // "discovery" | "warning" | "knowledge" | "info"
  message: string;
  metadata?: unknown;
  timestamp: string;
}

/** A file conflict between sessions. */
export interface FileConflict {
  file_path: string;
  sessions: number[];
  actions: Array<{
    session_id: number;
    file_path: string;
    action: string;
    timestamp: string;
  }>;
}

/** A shared scratchpad entry. */
export interface ScratchpadEntry {
  id: string;
  session_id: number;
  category: string; // "architecture" | "api" | "decision" | "note"
  title: string;
  content: string;
  timestamp: string;
}

interface IntelState {
  broadcasts: BroadcastMessage[];
  conflicts: FileConflict[];
  scratchpad: ScratchpadEntry[];
  fetchBroadcasts: () => Promise<void>;
  fetchConflicts: () => Promise<void>;
  fetchScratchpad: () => Promise<void>;
  writeScratchpad: (category: string, title: string, content: string) => Promise<void>;
  clearScratchpad: () => Promise<void>;
  initListeners: () => Promise<UnlistenFn>;
}

let listenerCount = 0;
let activeUnlistens: UnlistenFn[] = [];
let pendingInit: Promise<void> | null = null;

export const useIntelStore = create<IntelState>()((set, get) => ({
  broadcasts: [],
  conflicts: [],
  scratchpad: [],

  fetchBroadcasts: async () => {
    try {
      const messages = await invoke<BroadcastMessage[]>("get_intel_broadcasts");
      set({ broadcasts: messages });
    } catch (err) {
      console.error("Failed to fetch intel broadcasts:", err);
    }
  },

  fetchConflicts: async () => {
    try {
      const conflicts = await invoke<FileConflict[]>("get_intel_conflicts");
      set({ conflicts });
    } catch (err) {
      console.error("Failed to fetch intel conflicts:", err);
    }
  },

  fetchScratchpad: async () => {
    try {
      const entries = await invoke<ScratchpadEntry[]>("get_intel_scratchpad");
      set({ scratchpad: entries });
    } catch (err) {
      console.error("Failed to fetch intel scratchpad:", err);
    }
  },

  writeScratchpad: async (category: string, title: string, content: string) => {
    try {
      await invoke("write_intel_scratchpad", { category, title, content });
      // Refresh after write
      await get().fetchScratchpad();
    } catch (err) {
      console.error("Failed to write intel scratchpad:", err);
    }
  },

  clearScratchpad: async () => {
    try {
      await invoke("clear_intel_scratchpad");
      set({ scratchpad: [] });
    } catch (err) {
      console.error("Failed to clear intel scratchpad:", err);
    }
  },

  initListeners: async () => {
    listenerCount += 1;

    if (activeUnlistens.length === 0) {
      if (!pendingInit) {
        pendingInit = Promise.all([
          listen<BroadcastMessage>("intel-broadcast", (msg) => {
            set((state) => ({
              broadcasts: [...state.broadcasts, msg].slice(-200),
            }));
          }),
          listen<FileConflict[]>("intel-conflict", (conflicts) => {
            set({ conflicts });
          }),
          listen<ScratchpadEntry>("intel-scratchpad", (entry) => {
            set((state) => ({
              scratchpad: [...state.scratchpad, entry].slice(-50),
            }));
          }),
        ])
          .then((unlistens) => {
            activeUnlistens = unlistens;
          })
          .finally(() => {
            pendingInit = null;
          });
      }
      await pendingInit;
    }

    return () => {
      listenerCount = Math.max(0, listenerCount - 1);
      if (listenerCount === 0 && activeUnlistens.length > 0) {
        for (const unlisten of activeUnlistens) {
          unlisten();
        }
        activeUnlistens = [];
      }
    };
  },
}));

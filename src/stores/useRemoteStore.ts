import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  getRemoteConfig,
  getRemoteStatus,
  startRemoteBot,
  stopRemoteBot,
  saveRemotePairing,
  clearRemoteConfig,
  type RemoteConfig,
  type RemoteStatus,
} from "@/lib/remote";

interface BotReadyEvent {
  type: "ready";
  botUsername: string;
}

interface BotPairedEvent {
  type: "paired";
  userId: number;
  username: string;
  firstName: string;
}

interface BotPromptEvent {
  type: "prompt";
  userId: number;
  text: string;
}

interface BotResultEvent {
  type: "result";
  userId: number;
  prompt: string;
  text: string;
  sessionId?: string;
}

interface BotErrorEvent {
  type: "error";
  message: string;
}

interface BotStoppedEvent {
  type: "stopped";
}

type BotIpcEvent =
  | BotReadyEvent
  | BotPairedEvent
  | BotPromptEvent
  | BotResultEvent
  | BotErrorEvent
  | BotStoppedEvent;

export interface RemoteHistoryEntry {
  id: string;
  prompt: string;
  result: string | null;
  timestamp: number;
  status: "running" | "done" | "error";
}

type RemoteState = {
  config: RemoteConfig | null;
  status: RemoteStatus | null;
  pairingCode: string | null;
  isLoading: boolean;
  error: string | null;
  history: RemoteHistoryEntry[];
};

type RemoteActions = {
  initialize: () => Promise<void>;
  startBot: (token: string, projectDir: string) => Promise<void>;
  stopBot: () => Promise<void>;
  disconnect: () => Promise<void>;
  initListeners: () => Promise<UnlistenFn>;
};

let historyCounter = 0;

export const useRemoteStore = create<RemoteState & RemoteActions>()((set, get) => ({
  config: null,
  status: null,
  pairingCode: null,
  isLoading: false,
  error: null,
  history: [],

  initialize: async () => {
    try {
      const [config, status] = await Promise.all([
        getRemoteConfig(),
        getRemoteStatus(),
      ]);
      set({ config, status });
    } catch (err) {
      console.error("[useRemoteStore] initialize failed:", err);
    }
  },

  startBot: async (token: string, projectDir: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await startRemoteBot(token, projectDir);
      set({
        pairingCode: result.pairing_code,
        isLoading: false,
      });
      const status = await getRemoteStatus();
      set({ status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
    }
  },

  stopBot: async () => {
    try {
      await stopRemoteBot();
      const status = await getRemoteStatus();
      set({ status, pairingCode: null });
    } catch (err) {
      console.error("[useRemoteStore] stopBot failed:", err);
    }
  },

  disconnect: async () => {
    try {
      await clearRemoteConfig();
      set({
        config: { token: null, user_id: null, username: null, bot_username: null, enabled: false },
        status: { running: false, bot_username: null, paired: false, user_id: null, username: null },
        pairingCode: null,
      });
    } catch (err) {
      console.error("[useRemoteStore] disconnect failed:", err);
    }
  },

  initListeners: async () => {
    const unlisten = await listen<BotIpcEvent>("remote-bot-event", async (event) => {
      const data = event.payload;

      switch (data.type) {
        case "prompt": {
          // Bot received a prompt — add to history as "running"
          const id = `remote-${Date.now()}-${++historyCounter}`;
          set((state) => ({
            history: [
              { id, prompt: data.text, result: null, timestamp: Date.now(), status: "running" as const },
              ...state.history,
            ].slice(0, 50), // Keep last 50 entries
          }));
          break;
        }

        case "result": {
          // Bot finished execution — update the running entry with result
          set((state) => {
            const history = [...state.history];
            const running = history.find((h) => h.status === "running" && h.prompt === data.prompt);
            if (running) {
              running.result = data.text;
              running.status = data.text.startsWith("Error:") ? "error" : "done";
            } else {
              // No matching prompt found — add as a new entry
              history.unshift({
                id: `remote-${Date.now()}-${++historyCounter}`,
                prompt: data.prompt,
                result: data.text,
                timestamp: Date.now(),
                status: data.text.startsWith("Error:") ? "error" : "done",
              });
            }
            return { history: history.slice(0, 50) };
          });
          break;
        }

        case "ready":
          set((state) => ({
            status: {
              ...(state.status ?? { running: true, paired: false, user_id: null, username: null, bot_username: null }),
              running: true,
              bot_username: data.botUsername,
            },
          }));
          break;

        case "paired":
          await saveRemotePairing(
            data.userId,
            data.username || data.firstName,
            get().status?.bot_username ?? null
          );
          set((state) => ({
            status: {
              ...(state.status ?? { running: true, paired: false, user_id: null, username: null, bot_username: null }),
              paired: true,
              user_id: data.userId,
              username: data.username || data.firstName,
            },
            pairingCode: null,
          }));
          try {
            const config = await getRemoteConfig();
            set({ config });
          } catch { /* ok */ }
          break;

        case "stopped":
          set((state) => ({
            status: {
              ...(state.status ?? { running: false, paired: false, user_id: null, username: null, bot_username: null }),
              running: false,
            },
            pairingCode: null,
          }));
          break;

        case "error":
          set({ error: data.message });
          break;
      }
    });

    return unlisten;
  },
}));

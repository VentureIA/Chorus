/**
 * Storage abstraction layer for Zustand persist middleware.
 *
 * In Tauri: uses LazyStore (plugin-store) for disk persistence.
 * In browser: uses localStorage with a prefix.
 */

import type { StateStorage } from "zustand/middleware";
import { isTauri } from "./transport";

/**
 * Creates a Zustand-compatible StateStorage adapter.
 *
 * @param fileName - The store file name (e.g. "store.json", "terminal-settings.json").
 *   In Tauri mode this maps to a file in the app-data directory.
 *   In browser mode it's used as a localStorage key prefix.
 */
export function createStorage(fileName: string): StateStorage {
  if (isTauri()) {
    return createTauriStorage(fileName);
  }
  return createBrowserStorage(fileName);
}

// ---------------------------------------------------------------------------
// Tauri LazyStore adapter
// ---------------------------------------------------------------------------

function createTauriStorage(fileName: string): StateStorage {
  // Lazy-load LazyStore to avoid import errors in browser
  let storePromise: Promise<import("@tauri-apps/plugin-store").LazyStore> | null = null;

  function getStore() {
    if (!storePromise) {
      storePromise = import("@tauri-apps/plugin-store").then(
        (mod) => new mod.LazyStore(fileName),
      );
    }
    return storePromise;
  }

  return {
    getItem: async (name: string): Promise<string | null> => {
      try {
        const store = await getStore();
        const value = await store.get<string>(name);
        return value ?? null;
      } catch (err) {
        console.error(`tauriStorage.getItem("${name}") failed:`, err);
        return null;
      }
    },
    setItem: async (name: string, value: string): Promise<void> => {
      try {
        const store = await getStore();
        await store.set(name, value);
        await store.save();
      } catch (err) {
        console.error(`tauriStorage.setItem("${name}") failed:`, err);
        throw err;
      }
    },
    removeItem: async (name: string): Promise<void> => {
      try {
        const store = await getStore();
        await store.delete(name);
        await store.save();
      } catch (err) {
        console.error(`tauriStorage.removeItem("${name}") failed:`, err);
        throw err;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Browser storage adapter — proxies through the backend WebSocket
// so the mobile browser reads the same store files as the desktop.
// ---------------------------------------------------------------------------

function createBrowserStorage(fileName: string): StateStorage {
  return {
    getItem: async (name: string): Promise<string | null> => {
      try {
        const { invoke: wsInvoke } = await import("./transport");
        const value = await wsInvoke<string | null>("store_get", { fileName, key: name });
        return value ?? null;
      } catch (err) {
        console.error(`browserStorage.getItem("${name}") failed:`, err);
        return null;
      }
    },
    setItem: async (name: string, value: string): Promise<void> => {
      try {
        const { invoke: wsInvoke } = await import("./transport");
        await wsInvoke("store_set", { fileName, key: name, value });
      } catch (err) {
        console.error(`browserStorage.setItem("${name}") failed:`, err);
      }
    },
    removeItem: async (name: string): Promise<void> => {
      try {
        const { invoke: wsInvoke } = await import("./transport");
        await wsInvoke("store_set", { fileName, key: name, value: null });
      } catch (err) {
        console.error(`browserStorage.removeItem("${name}") failed:`, err);
      }
    },
  };
}

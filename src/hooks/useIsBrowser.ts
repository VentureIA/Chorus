import { isTauri } from "@/lib/transport";

/** Returns true when running in a plain browser (not inside Tauri webview). */
export function useIsBrowser(): boolean {
  return !isTauri();
}

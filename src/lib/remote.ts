/**
 * Tauri invoke wrappers for the remote Telegram bot feature.
 */
import { invoke } from "@tauri-apps/api/core";

export interface RemoteConfig {
  token: string | null;
  user_id: number | null;
  username: string | null;
  bot_username: string | null;
  enabled: boolean;
}

export interface RemoteStatus {
  running: boolean;
  bot_username: string | null;
  paired: boolean;
  user_id: number | null;
  username: string | null;
}

export interface StartBotResult {
  pairing_code: string | null;
  already_paired: boolean;
}

export async function getRemoteConfig(): Promise<RemoteConfig> {
  return invoke<RemoteConfig>("get_remote_config");
}

export async function saveRemoteConfig(config: RemoteConfig): Promise<void> {
  return invoke("save_remote_config", { config });
}

export async function startRemoteBot(
  token: string,
  projectDir: string
): Promise<StartBotResult> {
  return invoke<StartBotResult>("start_remote_bot", { token, projectDir });
}

export async function stopRemoteBot(): Promise<void> {
  return invoke("stop_remote_bot");
}

export async function getRemoteStatus(): Promise<RemoteStatus> {
  return invoke<RemoteStatus>("get_remote_status");
}

export async function saveRemotePairing(
  userId: number,
  username: string,
  botUsername: string | null
): Promise<void> {
  return invoke("save_remote_pairing", { userId, username, botUsername });
}

export async function clearRemoteConfig(): Promise<void> {
  return invoke("clear_remote_config");
}

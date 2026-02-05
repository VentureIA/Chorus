import { Bot } from "grammy";
import { runClaude, cancelSession, getActiveSession, type StreamEvent } from "./claude.js";
import { escapeHtml, formatOutput, splitMessage, stripAnsi } from "./format.js";

// ─── Config (CLI args > env vars > defaults) ────────────────────────

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

const TOKEN = arg("token") || process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("Usage: chorus-remote --token=<BOT_TOKEN> [--user-id=<ID>] [--project=<PATH>]");
  process.exit(1);
}

const MAX_TIME = parseInt(arg("max-time") || process.env.MAX_EXECUTION_TIME || "300", 10);
const DEFAULT_PROJECT = arg("project") || process.env.PROJECT_DIR || process.cwd();

// ─── IPC: communicate with parent process (Chorus) ──────────────────

type IpcEvent =
  | { type: "ready"; botUsername: string }
  | { type: "paired"; userId: number; username: string; firstName: string }
  | { type: "prompt"; userId: number; text: string }
  | { type: "result"; userId: number; prompt: string; text: string; sessionId?: string }
  | { type: "error"; message: string }
  | { type: "stopped" };

function ipc(event: IpcEvent) {
  // Write JSON to stdout for parent process, logs go to stderr
  process.stdout.write(JSON.stringify(event) + "\n");
}

function log(...args: unknown[]) {
  console.error("[chorus-remote]", ...args);
}

// ─── Auto-registration (pairing) ────────────────────────────────────

const PAIRING_CODE = arg("pairing-code");
let ownerId: number | null = null;

const configuredUserId = arg("user-id") || process.env.ALLOWED_USER_IDS;
if (configuredUserId) {
  ownerId = parseInt(configuredUserId.split(",")[0].trim(), 10) || null;
}

// ─── State ───────────────────────────────────────────────────────────

const chatState = new Map<number, { projectDir: string; lastSessionId?: string }>();

function getState(chatId: number) {
  if (!chatState.has(chatId)) {
    chatState.set(chatId, { projectDir: DEFAULT_PROJECT });
  }
  return chatState.get(chatId)!;
}

// ─── Bot Setup ───────────────────────────────────────────────────────

const bot = new Bot(TOKEN);

// Auth middleware
bot.use(async (ctx, next) => {
  // If no owner set and no pairing code, allow all (dev mode)
  if (!ownerId && !PAIRING_CODE) {
    await next();
    return;
  }

  // If owner is set, check against it
  if (ownerId && ctx.from?.id === ownerId) {
    await next();
    return;
  }

  // Not authorized
  if (!ownerId && PAIRING_CODE) {
    // In pairing mode — only /start with code is allowed
    // Let /start through so the pairing handler works
    if (ctx.message?.text?.startsWith("/start")) {
      await next();
      return;
    }
    await ctx.reply("Send /start <code>your pairing code</code> to connect.", {
      parse_mode: "HTML",
    });
    return;
  }

  await ctx.reply(
    `Unauthorized. This bot is linked to another account.`
  );
});

// ─── Commands ────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  const code = ctx.match?.trim();

  // Pairing mode: verify code
  if (!ownerId && PAIRING_CODE) {
    if (!code) {
      await ctx.reply(
        "Welcome! Send /start <code>your_pairing_code</code> to connect this bot to your Chorus.",
        { parse_mode: "HTML" }
      );
      return;
    }
    if (code !== PAIRING_CODE) {
      await ctx.reply("Invalid pairing code. Check your Chorus app and try again.");
      return;
    }

    // Pair successfully
    ownerId = ctx.from!.id;
    const username = ctx.from!.username || "";
    const firstName = ctx.from!.first_name || "";

    ipc({
      type: "paired",
      userId: ownerId,
      username,
      firstName,
    });

    await ctx.reply(
      [
        `<b>Connected!</b>`,
        "",
        `You're now linked to Chorus. Send any message and Claude will execute it in your project.`,
        "",
        `<b>Project:</b> <code>${escapeHtml(DEFAULT_PROJECT)}</code>`,
        "",
        "Type /help for commands.",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return;
  }

  // Normal start
  await ctx.reply(
    [
      "<b>Chorus Remote</b>",
      "",
      "Send any message — Claude will execute it in your project and return the result.",
      "",
      `<b>Project:</b> <code>${escapeHtml(getState(ctx.chat.id).projectDir)}</code>`,
      "",
      "<b>Commands:</b>",
      "/project <code>&lt;path&gt;</code> — change project",
      "/pwd — show current project",
      "/new — fresh conversation",
      "/cancel — abort running task",
      "/status — session info",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "<b>Usage</b>",
      "",
      "Just type your prompt like in Claude Code:",
      '<i>"fix the bug in auth.ts"</i>',
      '<i>"add tests for the user service"</i>',
      '<i>"explain the payment flow"</i>',
      "",
      "Conversations persist automatically. Use /new for a fresh session.",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

bot.command("project", async (ctx) => {
  const path = ctx.match?.trim();
  if (!path) {
    const state = getState(ctx.chat.id);
    await ctx.reply(`Project: <code>${escapeHtml(state.projectDir)}</code>`, {
      parse_mode: "HTML",
    });
    return;
  }
  const state = getState(ctx.chat.id);
  state.projectDir = path;
  state.lastSessionId = undefined;
  await ctx.reply(`Project set: <code>${escapeHtml(path)}</code>`, {
    parse_mode: "HTML",
  });
});

bot.command("pwd", async (ctx) => {
  const state = getState(ctx.chat.id);
  const session = state.lastSessionId ? `\nSession: <code>${state.lastSessionId.slice(0, 12)}...</code>` : "";
  await ctx.reply(
    `<code>${escapeHtml(state.projectDir)}</code>${session}`,
    { parse_mode: "HTML" }
  );
});

bot.command("new", async (ctx) => {
  const state = getState(ctx.chat.id);
  state.lastSessionId = undefined;
  await ctx.reply("Fresh session started.");
});

bot.command("cancel", async (ctx) => {
  if (cancelSession(ctx.chat.id)) {
    await ctx.reply("Task cancelled.");
  } else {
    await ctx.reply("No active task.");
  }
});

bot.command("status", async (ctx) => {
  const session = getActiveSession(ctx.chat.id);
  const state = getState(ctx.chat.id);
  if (session) {
    await ctx.reply(`<b>Active</b> — <code>${escapeHtml(state.projectDir)}</code>`, {
      parse_mode: "HTML",
    });
  } else {
    await ctx.reply(`<b>Idle</b> — <code>${escapeHtml(state.projectDir)}</code>`, {
      parse_mode: "HTML",
    });
  }
});

// ─── Message Handler ─────────────────────────────────────────────────

/** Send a result (plain terminal output or Claude structured output) to Telegram. */
async function sendResultToTelegram(
  ctx: import("grammy").Context,
  chatId: number,
  resultText: string,
  statusMsgId: number,
) {
  try { await ctx.api.deleteMessage(chatId, statusMsgId); } catch { /* ok */ }

  if (!resultText.trim()) {
    await ctx.reply("Done (no output).");
    return;
  }

  const formatted = formatOutput(resultText);
  const chunks = splitMessage(formatted);

  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk, { parse_mode: "HTML" });
    } catch {
      // HTML parse failed — send plain
      await ctx.reply(resultText.slice(0, 4000));
      break;
    }
  }
}

bot.on("message:text", async (ctx) => {
  const prompt = ctx.message.text;
  const chatId = ctx.chat.id;
  const state = getState(chatId);

  if (getActiveSession(chatId)) {
    await ctx.reply("A task is already running. /cancel to abort.");
    return;
  }

  // Always notify Chorus about the prompt (if connected, it will open a session)
  ipc({ type: "prompt", userId: ctx.from.id, text: prompt });

  const statusMsg = await ctx.reply("Starting Claude...");

  // ─── Standalone mode: run Claude CLI locally ─────────────────────
  let lastUpdate = 0;
  let toolLines: string[] = [];
  let resultText = "";

  const updateStatus = async (text: string) => {
    const now = Date.now();
    if (now - lastUpdate < 1500) return;
    lastUpdate = now;
    try {
      await ctx.api.editMessageText(chatId, statusMsg.message_id, text, {
        parse_mode: "HTML",
      });
    } catch { /* rate limited or unchanged */ }
  };

  const onEvent = async (event: StreamEvent) => {
    switch (event.type) {
      case "progress":
        await updateStatus(escapeHtml(event.content));
        break;
      case "tool": {
        toolLines.push(event.content);
        const visible = toolLines.slice(-6);
        await updateStatus(
          "<b>Working...</b>\n\n" + visible.map((l) => escapeHtml(l)).join("\n")
        );
        break;
      }
      case "text":
        resultText = event.content;
        break;
      case "result":
        resultText = event.content;
        if (event.sessionId) state.lastSessionId = event.sessionId;
        break;
      case "error":
        resultText = `Error: ${event.content}`;
        break;
    }
  };

  try {
    await runClaude(chatId, prompt, state.projectDir, onEvent, state.lastSessionId, MAX_TIME);
    await sendResultToTelegram(ctx, chatId, resultText, statusMsg.message_id);

    // Report result to parent process
    ipc({ type: "result", userId: ctx.from.id, prompt, text: resultText, sessionId: state.lastSessionId || undefined });

    // Footer with metadata
    if (state.lastSessionId) {
      const parts: string[] = [];
      if (toolLines.length > 0) parts.push(`${toolLines.length} tools`);
      parts.push(state.lastSessionId.slice(0, 8));
      await ctx.reply(`<i>${escapeHtml(parts.join(" | "))}</i>`, { parse_mode: "HTML" });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await ctx.api.editMessageText(
        chatId, statusMsg.message_id,
        `<b>Error:</b> ${escapeHtml(msg)}`,
        { parse_mode: "HTML" }
      );
    } catch {
      await ctx.reply(`Error: ${msg}`);
    }
  }
});

// ─── Start ───────────────────────────────────────────────────────────

log("Starting...");
log(`Project: ${DEFAULT_PROJECT}`);
log(`Owner: ${ownerId || "pairing mode"}`);

bot.start({
  onStart: async (botInfo) => {
    log(`Bot @${botInfo.username} is running.`);
    ipc({ type: "ready", botUsername: botInfo.username });
  },
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log(`${signal} received, stopping...`);
    ipc({ type: "stopped" });
    bot.stop();
    process.exit(0);
  });
}

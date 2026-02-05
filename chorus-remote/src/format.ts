/**
 * Telegram HTML formatting utilities.
 * We use HTML parse mode (much saner escaping than MarkdownV2).
 */

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (ch) => HTML_ENTITIES[ch] || ch);
}

/**
 * Strip ANSI escape sequences from terminal output.
 */
export function stripAnsi(text: string): string {
  return text
    // CSI sequences (colors, cursor movement, etc.)
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    // OSC sequences (title, hyperlinks)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    // Other escape sequences
    .replace(/\x1b[^[\]].?/g, "")
    // Carriage returns (terminal overwrites)
    .replace(/\r/g, "");
}

/**
 * Format Claude's output for Telegram.
 * Preserves markdown code blocks as <pre> and inline code as <code>.
 */
export function formatOutput(text: string): string {
  if (!text.trim()) return "<i>No output</i>";

  // Split by code blocks, process each segment
  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts
    .map((part) => {
      if (part.startsWith("```")) {
        // Code block — extract language and code
        const match = part.match(/^```(\w+)?\n?([\s\S]*?)```$/);
        if (match) {
          const lang = match[1] || "";
          const code = match[2].trimEnd();
          return lang
            ? `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`
            : `<pre>${escapeHtml(code)}</pre>`;
        }
        return `<pre>${escapeHtml(part)}</pre>`;
      }
      // Regular text — escape HTML but preserve inline code
      return part.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${escapeHtml(code)}</code>`)
        .replace(/(?<![`<])([&<>])(?![^<]*>)/g, (ch) => HTML_ENTITIES[ch] || ch);
    })
    .join("");
}

/**
 * Split a message into Telegram-safe chunks (max 4096 chars).
 * Tries to split at natural boundaries (newlines, paragraphs).
 */
export function splitMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Find a good split point
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

/**
 * Format a duration in ms to human readable.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs > 0 ? `${m}m${rs}s` : `${m}m`;
}

/**
 * Format cost in USD.
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

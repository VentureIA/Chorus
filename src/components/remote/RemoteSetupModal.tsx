import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, X } from "lucide-react";
import { useRemoteStore } from "@/stores/useRemoteStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface RemoteSetupModalProps {
  onClose: () => void;
}

type Step = "token" | "pairing" | "done";

export function RemoteSetupModal({ onClose }: RemoteSetupModalProps) {
  const { config, status, pairingCode, isLoading, error, startBot } = useRemoteStore();
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.active);
  const projectDir = activeTab?.projectPath ?? "";

  const [token, setToken] = useState(config?.token ?? "");
  const [step, setStep] = useState<Step>("token");
  const [copied, setCopied] = useState(false);

  // If already paired, skip to done
  useEffect(() => {
    if (status?.paired && status?.running) {
      setStep("done");
    }
  }, [status?.paired, status?.running]);

  // Move to pairing step when code is available
  useEffect(() => {
    if (pairingCode && step === "token") {
      setStep("pairing");
    }
  }, [pairingCode, step]);

  // Move to done when paired
  useEffect(() => {
    if (status?.paired && step === "pairing") {
      setStep("done");
    }
  }, [status?.paired, step]);

  const handleStart = async () => {
    if (!token.trim()) return;
    await startBot(token.trim(), projectDir);
  };

  const copyCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(`/start ${pairingCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract bot username for link
  const botUsername = status?.bot_username;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <X size={16} />
        </button>

        <h2 className="mb-1 text-base font-semibold text-foreground">
          Telegram Remote Access
        </h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Control Chorus from your phone
        </p>

        {/* Steps indicator */}
        <div className="mb-5 flex gap-2">
          {(["token", "pairing", "done"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= ["token", "pairing", "done"].indexOf(step)
                  ? "bg-primary"
                  : "bg-muted/40"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Token */}
        {step === "token" && (
          <div className="space-y-4">
            <div>
              <div className="mb-3 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">Create your bot:</p>
                <ol className="list-inside list-decimal space-y-1">
                  <li>
                    Open{" "}
                    <span className="font-medium text-primary">@BotFather</span>{" "}
                    on Telegram
                  </li>
                  <li>Send <code className="rounded bg-muted px-1">/newbot</code></li>
                  <li>Choose a name (e.g. "My Chorus")</li>
                  <li>Copy the token and paste below</li>
                </ol>
              </div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Bot Token
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="7123456789:AAxx..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleStart();
                }}
                autoFocus
              />
            </div>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <button
              type="button"
              onClick={handleStart}
              disabled={!token.trim() || isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect Bot"
              )}
            </button>
          </div>
        )}

        {/* Step 2: Pairing */}
        {step === "pairing" && pairingCode && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="mb-3 text-sm text-foreground">
                Open your bot on Telegram and send:
              </p>

              <div
                className="group relative mx-auto inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-5 py-3 font-mono text-lg font-bold text-primary transition-colors hover:bg-primary/20"
                onClick={copyCode}
              >
                /start {pairingCode}
                {copied ? (
                  <Check size={16} className="text-green-500" />
                ) : (
                  <Copy size={16} className="opacity-50 group-hover:opacity-100" />
                )}
              </div>

              {botUsername && (
                <a
                  href={`https://t.me/${botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open @{botUsername}
                  <ExternalLink size={10} />
                </a>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Waiting for pairing...
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === "done" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <Check size={24} className="text-green-500" />
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">
                Remote access is live!
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Send any prompt to{" "}
                {botUsername ? (
                  <span className="font-medium text-primary">@{botUsername}</span>
                ) : (
                  "your bot"
                )}{" "}
                on Telegram.
              </p>
            </div>

            {status?.username && (
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Connected as <span className="font-medium text-foreground">{status.username}</span>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

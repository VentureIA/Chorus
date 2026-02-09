import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Globe, Loader2, RefreshCw, Smartphone, Unplug, X } from "lucide-react";
import { invoke } from "@/lib/transport";

interface WebAccessTokenResult {
  url: string;
  token: string;
  expiresInSecs: number;
}

interface WebAccessStatus {
  running: boolean;
  port: number;
  connectedClients: number;
  hasValidToken: boolean;
}

interface TunnelStatus {
  running: boolean;
  url: string | null;
}

interface WebAccessModalProps {
  onClose: () => void;
}

export function WebAccessModal({ onClose }: WebAccessModalProps) {
  const [tokenResult, setTokenResult] = useState<WebAccessTokenResult | null>(null);
  const [status, setStatus] = useState<WebAccessStatus | null>(null);
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStartingTunnel, setIsStartingTunnel] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTunnel = useCallback(async () => {
    setIsStartingTunnel(true);
    setError(null);
    try {
      const url = await invoke<string>("start_web_tunnel");
      setTunnelStatus({ running: true, url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start tunnel");
      setTunnelStatus({ running: false, url: null });
    } finally {
      setIsStartingTunnel(false);
    }
  }, []);

  const generateToken = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await invoke<WebAccessTokenResult>("generate_web_access_token");
      setTokenResult(result);
      setSecondsLeft(result.expiresInSecs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate token");
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const s = await invoke<WebAccessStatus>("get_web_access_status");
      setStatus(s);
    } catch {
      // Ignore poll errors
    }
  }, []);

  const handleRevoke = useCallback(async () => {
    setIsRevoking(true);
    try {
      await invoke("revoke_web_access");
      setTokenResult(null);
      setSecondsLeft(0);
      await pollStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setIsRevoking(false);
    }
  }, [pollStatus]);

  // Start tunnel + generate token on mount
  useEffect(() => {
    // Check tunnel status first
    invoke<TunnelStatus>("get_web_tunnel_status")
      .then((ts) => {
        setTunnelStatus(ts);
        if (!ts.running) {
          // Start tunnel, then generate token
          startTunnel().then(() => generateToken());
        } else {
          generateToken();
        }
      })
      .catch(() => {
        // Fallback: just generate token with LAN URL
        generateToken();
      });
    pollStatus();
  }, [startTunnel, generateToken, pollStatus]);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [secondsLeft]);

  // Poll status every 3s
  useEffect(() => {
    statusPollRef.current = setInterval(pollStatus, 3000);
    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, [pollStatus]);

  // Auto-regenerate when token expires
  useEffect(() => {
    if (secondsLeft === 0 && tokenResult && !isGenerating) {
      generateToken();
    }
  }, [secondsLeft, tokenResult, isGenerating, generateToken]);

  const fullUrl = tokenResult ? `${tokenResult.url}/#token=${tokenResult.token}` : "";

  const copyUrl = () => {
    if (!fullUrl) return;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isConnected = (status?.connectedClients ?? 0) > 0;
  const isTunnelReady = tunnelStatus?.running && tunnelStatus?.url;
  const isLoading = isStartingTunnel || (isGenerating && !tokenResult);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-primary/15 p-2">
            <Smartphone size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Mobile Access</h2>
            <p className="text-xs text-muted-foreground">Scan to open Chorus on your phone</p>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Loading state: tunnel starting */}
        {isLoading ? (
          <div className="flex h-52 flex-col items-center justify-center gap-3">
            <Loader2 size={24} className="animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              {isStartingTunnel ? "Starting secure tunnel..." : "Generating access token..."}
            </span>
          </div>
        ) : tokenResult ? (
          <div className="flex flex-col items-center gap-4">
            {/* Tunnel badge */}
            {isTunnelReady && (
              <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-[11px] font-medium text-green-500">
                <Globe size={12} />
                Public HTTPS tunnel active
              </div>
            )}

            {/* QR code with white padding for scanning */}
            <div className="rounded-xl bg-white p-4">
              <QRCodeSVG
                value={fullUrl}
                size={200}
                level="M"
                marginSize={0}
              />
            </div>

            {/* URL + copy */}
            <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
              <code className="flex-1 truncate text-[11px] text-foreground">{fullUrl}</code>
              <button
                type="button"
                onClick={copyUrl}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
                title="Copy URL"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>

            {/* Timer + status */}
            <div className="flex w-full items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-muted-foreground"}`} />
                <span className={isConnected ? "text-green-500 font-medium" : "text-muted-foreground"}>
                  {isConnected
                    ? `${status!.connectedClients} connected`
                    : "Waiting for connection..."}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Expires in {formatTime(secondsLeft)}</span>
                <button
                  type="button"
                  onClick={generateToken}
                  disabled={isGenerating}
                  className="rounded p-1 transition-colors hover:bg-border hover:text-foreground"
                  title="Generate new token"
                >
                  <RefreshCw size={12} className={isGenerating ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {/* Revoke button */}
            {isConnected && (
              <button
                type="button"
                onClick={handleRevoke}
                disabled={isRevoking}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-xs text-destructive transition-colors hover:bg-destructive/10"
              >
                <Unplug size={14} />
                {isRevoking ? "Disconnecting..." : "Disconnect Mobile"}
              </button>
            )}
          </div>
        ) : null}

        {/* Server info */}
        {status && (
          <div className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <div className="flex justify-between">
              <span>Server</span>
              <span>{status.running ? `Port ${status.port}` : "Not running"}</span>
            </div>
            {isTunnelReady && (
              <div className="mt-1 flex justify-between">
                <span>Tunnel</span>
                <span className="truncate ml-4 text-green-500">{tunnelStatus!.url}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

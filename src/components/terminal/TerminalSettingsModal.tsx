import { Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { clearFontCache, EMBEDDED_FONT } from "@/lib/fonts";
import { useTerminalSettingsStore } from "@/stores/useTerminalSettingsStore";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";

interface TerminalSettingsModalProps {
  onClose: () => void;
}

export function TerminalSettingsModal({ onClose }: TerminalSettingsModalProps) {
  const {
    settings,
    availableFonts,
    isLoading,
    isInitialized,
    initialize,
    setSetting,
    resetToDefaults,
  } = useTerminalSettingsStore();

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  const handleRefreshFonts = async () => {
    setIsRefreshing(true);
    clearFontCache();
    await initialize();
    setIsRefreshing(false);
  };

  const nerdFonts = availableFonts.filter((f) => f.is_nerd_font && f.family !== EMBEDDED_FONT);
  const monoFonts = availableFonts.filter((f) => !f.is_nerd_font && f.family !== EMBEDDED_FONT);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Terminal Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isLoading && !isInitialized ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Font Family */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Font Family</Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRefreshFonts}
                    disabled={isRefreshing}
                    className="h-6 w-6"
                  >
                    {isRefreshing ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                  </Button>
                </div>
                <Select
                  value={settings.fontFamily}
                  onValueChange={(value) => setSetting("fontFamily", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a font" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMBEDDED_FONT}>
                      {EMBEDDED_FONT} (Embedded)
                    </SelectItem>
                    {nerdFonts.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Nerd Fonts</SelectLabel>
                        {nerdFonts.map((font) => (
                          <SelectItem key={font.family} value={font.family}>
                            {font.family}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {monoFonts.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Monospace Fonts</SelectLabel>
                        {monoFonts.map((font) => (
                          <SelectItem key={font.family} value={font.family}>
                            {font.family}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>

                {/* Font preview */}
                <Card className="p-3">
                  <div
                    className="text-xs text-foreground"
                    style={{ fontFamily: settings.fontFamily }}
                  >
                    The quick brown fox jumps over the lazy dog
                    <br />
                    <span className="text-muted-foreground">0123456789 !@#$%^&*()</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {availableFonts.find((f) => f.family === settings.fontFamily)?.is_nerd_font && (
                      <Badge variant="secondary">Nerd Font</Badge>
                    )}
                    {settings.fontFamily === EMBEDDED_FONT && (
                      <Badge variant="secondary" className="bg-green-500/20 text-green-500">
                        Embedded
                      </Badge>
                    )}
                  </div>
                </Card>
              </div>

              {/* Font Size */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Font Size</Label>
                  <span className="text-xs font-medium text-foreground">
                    {settings.fontSize}px
                  </span>
                </div>
                <Slider
                  value={[settings.fontSize]}
                  onValueChange={([value]) => setSetting("fontSize", value)}
                  min={10}
                  max={20}
                  step={1}
                />
              </div>

              {/* Line Height */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Line Height</Label>
                  <span className="text-xs font-medium text-foreground">
                    {settings.lineHeight.toFixed(1)}
                  </span>
                </div>
                <Slider
                  value={[settings.lineHeight]}
                  onValueChange={([value]) => setSetting("lineHeight", value)}
                  min={1.0}
                  max={2.0}
                  step={0.1}
                />
              </div>

              {/* Reset */}
              <div className="flex justify-end pt-2">
                <Button variant="ghost" size="sm" onClick={resetToDefaults}>
                  <RotateCcw size={12} />
                  Reset to Defaults
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

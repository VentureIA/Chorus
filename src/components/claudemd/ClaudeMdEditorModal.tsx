import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { writeClaudeMd } from "@/lib/claudemd";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ClaudeMdEditorModalProps {
  projectPath: string;
  exists: boolean;
  initialContent?: string;
  onClose: () => void;
  onSaved?: () => void;
}

const DEFAULT_TEMPLATE = `# Project Context

<!-- Add project-specific instructions for Claude here -->

## Overview
[Describe your project briefly]

## Coding Standards
[Any specific coding standards or patterns to follow]

## Important Notes
[Any important context Claude should know]
`;

export function ClaudeMdEditorModal({
  projectPath,
  exists,
  initialContent,
  onClose,
  onSaved,
}: ClaudeMdEditorModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [content, setContent] = useState(
    exists && initialContent ? initialContent : DEFAULT_TEMPLATE
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);

    try {
      await writeClaudeMd(projectPath, content);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {exists ? "Edit CLAUDE.md" : "Create CLAUDE.md"}
          </DialogTitle>
          <DialogDescription>
            {exists
              ? "Edit the project context file that provides instructions to Claude."
              : "Create a CLAUDE.md file to provide project-specific context and instructions to Claude."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter project context..."
            className="h-80 resize-none font-mono text-xs"
            spellCheck={false}
          />

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Saving...
              </>
            ) : exists ? (
              "Save Changes"
            ) : (
              "Create File"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

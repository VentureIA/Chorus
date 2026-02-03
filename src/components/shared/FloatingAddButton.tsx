import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FloatingAddButtonProps {
  onClick: () => void;
}

export function FloatingAddButton({ onClick }: FloatingAddButtonProps) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      className="fixed bottom-16 right-4 z-20 h-12 w-12 rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
      aria-label="Add session"
      title="Add new session"
    >
      <Plus size={24} strokeWidth={1.5} />
    </Button>
  );
}

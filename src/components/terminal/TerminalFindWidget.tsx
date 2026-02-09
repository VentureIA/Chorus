import { type SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useRef, useState } from "react";

interface TerminalFindWidgetProps {
  searchAddon: SearchAddon;
  onClose: () => void;
}

export function TerminalFindWidget({ searchAddon, onClose }: TerminalFindWidgetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [resultIndex, setResultIndex] = useState(-1);
  const [resultCount, setResultCount] = useState(0);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Listen for result count changes
  useEffect(() => {
    const disposable = searchAddon.onDidChangeResults?.((e) => {
      if (e) {
        setResultIndex(e.resultIndex);
        setResultCount(e.resultCount);
      } else {
        setResultIndex(-1);
        setResultCount(0);
      }
    });
    return () => disposable?.dispose();
  }, [searchAddon]);

  const searchOptions = { caseSensitive, regex };

  const findNext = useCallback(() => {
    if (query) searchAddon.findNext(query, searchOptions);
  }, [query, searchAddon, searchOptions]);

  const findPrevious = useCallback(() => {
    if (query) searchAddon.findPrevious(query, searchOptions);
  }, [query, searchAddon, searchOptions]);

  // Trigger search on query/options change
  useEffect(() => {
    if (query) {
      searchAddon.findNext(query, searchOptions);
    } else {
      searchAddon.clearDecorations();
      setResultIndex(-1);
      setResultCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, regex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      searchAddon.clearDecorations();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        findPrevious();
      } else {
        findNext();
      }
    }
  };

  const toggleClass = (active: boolean) =>
    `flex h-[22px] w-[22px] items-center justify-center rounded text-xs ${
      active
        ? "bg-[#0e639c] text-white"
        : "text-[#cccccc] hover:bg-[#3c3c3c]"
    }`;

  return (
    <div
      className="absolute top-1 right-2 z-50 flex items-center gap-1 rounded border border-[#3c3c3c] bg-[#252526] px-2 py-1 shadow-lg"
      onKeyDown={handleKeyDown}
    >
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find"
        className="h-[22px] w-[160px] rounded-sm border border-[#3c3c3c] bg-[#3c3c3c] px-1.5 text-xs text-[#cccccc] outline-none placeholder:text-[#666] focus:border-[#0e639c]"
      />

      {/* Case sensitive toggle */}
      <button
        type="button"
        title="Match Case"
        className={toggleClass(caseSensitive)}
        onClick={() => setCaseSensitive((v) => !v)}
      >
        Aa
      </button>

      {/* Regex toggle */}
      <button
        type="button"
        title="Use Regular Expression"
        className={toggleClass(regex)}
        onClick={() => setRegex((v) => !v)}
      >
        .*
      </button>

      {/* Results counter */}
      <span className="min-w-[50px] text-center text-xs text-[#999]">
        {query
          ? resultCount > 0
            ? `${resultIndex + 1}/${resultCount}`
            : "No results"
          : ""}
      </span>

      {/* Previous */}
      <button
        type="button"
        title="Previous Match (Shift+Enter)"
        className="flex h-[22px] w-[22px] items-center justify-center rounded text-[#cccccc] hover:bg-[#3c3c3c]"
        onClick={findPrevious}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3.5l-5 5h3v4h4v-4h3l-5-5z" />
        </svg>
      </button>

      {/* Next */}
      <button
        type="button"
        title="Next Match (Enter)"
        className="flex h-[22px] w-[22px] items-center justify-center rounded text-[#cccccc] hover:bg-[#3c3c3c]"
        onClick={findNext}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 12.5l5-5h-3v-4H6v4H3l5 5z" />
        </svg>
      </button>

      {/* Close */}
      <button
        type="button"
        title="Close (Escape)"
        className="flex h-[22px] w-[22px] items-center justify-center rounded text-[#cccccc] hover:bg-[#3c3c3c]"
        onClick={() => {
          searchAddon.clearDecorations();
          onClose();
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 8.7l-3.65 3.65-.7-.7L7.3 8 3.65 4.35l.7-.7L8 7.3l3.65-3.65.7.7L8.7 8l3.65 3.65-.7.7L8 8.7z" />
        </svg>
      </button>
    </div>
  );
}

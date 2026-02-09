import { invoke } from "@/lib/transport";
import { create } from "zustand";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  extension: string | null;
}

export interface OpenFile {
  path: string;
  name: string;
  extension: string | null;
  content: string;
  originalContent: string;
  isLoading: boolean;
}

interface FileExplorerState {
  /** Cached directory contents keyed by path */
  tree: Map<string, FileEntry[]>;
  /** Set of currently expanded folder paths */
  expanded: Set<string>;
  /** Set of paths currently being loaded */
  isLoading: Set<string>;
  /** Currently open files */
  openFiles: OpenFile[];
  /** Index of the active file tab */
  activeFileIndex: number;

  loadDirectory: (path: string) => Promise<void>;
  toggleExpand: (path: string) => Promise<void>;
  collapseAll: () => void;
  refresh: (rootPath: string) => Promise<void>;
  openFile: (entry: FileEntry) => Promise<void>;
  closeFile: (path: string) => void;
  setActiveFile: (index: number) => void;
  updateFileContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
}

export const useFileExplorerStore = create<FileExplorerState>()((set, get) => ({
  tree: new Map(),
  expanded: new Set(),
  isLoading: new Set(),
  openFiles: [],
  activeFileIndex: -1,

  loadDirectory: async (path: string) => {
    if (get().isLoading.has(path)) return;

    set({ isLoading: new Set([...get().isLoading, path]) });

    try {
      const entries = await invoke<FileEntry[]>("read_directory", { path });
      const newTree = new Map(get().tree);
      newTree.set(path, entries);
      const newLoading = new Set(get().isLoading);
      newLoading.delete(path);
      set({ tree: newTree, isLoading: newLoading });
    } catch (err) {
      console.error("Failed to load directory:", err);
      const newLoading = new Set(get().isLoading);
      newLoading.delete(path);
      set({ isLoading: newLoading });
    }
  },

  toggleExpand: async (path: string) => {
    const { expanded, tree, loadDirectory } = get();
    const newExpanded = new Set(expanded);

    if (newExpanded.has(path)) {
      newExpanded.delete(path);
      set({ expanded: newExpanded });
    } else {
      newExpanded.add(path);
      set({ expanded: newExpanded });
      if (!tree.has(path)) {
        await loadDirectory(path);
      }
    }
  },

  collapseAll: () => {
    set({ expanded: new Set() });
  },

  refresh: async (rootPath: string) => {
    set({ tree: new Map(), expanded: new Set() });
    await get().loadDirectory(rootPath);
  },

  openFile: async (entry: FileEntry) => {
    const { openFiles } = get();

    // If already open, just focus it
    const existingIndex = openFiles.findIndex((f) => f.path === entry.path);
    if (existingIndex !== -1) {
      set({ activeFileIndex: existingIndex });
      return;
    }

    // Add placeholder while loading
    const newFile: OpenFile = {
      path: entry.path,
      name: entry.name,
      extension: entry.extension,
      content: "",
      originalContent: "",
      isLoading: true,
    };
    const newFiles = [...openFiles, newFile];
    set({ openFiles: newFiles, activeFileIndex: newFiles.length - 1 });

    try {
      const content = await invoke<string>("read_file_content", { path: entry.path });
      const files = get().openFiles.map((f) =>
        f.path === entry.path ? { ...f, content, originalContent: content, isLoading: false } : f,
      );
      set({ openFiles: files });
    } catch (err) {
      console.error("Failed to read file:", err);
      // Remove the failed file
      set({
        openFiles: get().openFiles.filter((f) => f.path !== entry.path),
        activeFileIndex: Math.max(0, get().activeFileIndex - 1),
      });
    }
  },

  closeFile: (path: string) => {
    const { openFiles, activeFileIndex } = get();
    const idx = openFiles.findIndex((f) => f.path === path);
    if (idx === -1) return;

    const newFiles = openFiles.filter((f) => f.path !== path);
    let newActive = activeFileIndex;
    if (idx <= activeFileIndex) {
      newActive = Math.max(0, activeFileIndex - 1);
    }
    if (newFiles.length === 0) newActive = -1;

    set({ openFiles: newFiles, activeFileIndex: newActive });
  },

  setActiveFile: (index: number) => {
    set({ activeFileIndex: index });
  },

  updateFileContent: (path: string, content: string) => {
    set({
      openFiles: get().openFiles.map((f) => (f.path === path ? { ...f, content } : f)),
    });
  },

  saveFile: async (path: string) => {
    const file = get().openFiles.find((f) => f.path === path);
    if (!file) return;

    try {
      await invoke("write_file_content", { path, content: file.content });
      set({
        openFiles: get().openFiles.map((f) =>
          f.path === path ? { ...f, originalContent: file.content } : f,
        ),
      });
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  },
}));

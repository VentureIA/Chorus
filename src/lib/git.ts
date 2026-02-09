import { invoke } from "@/lib/transport";
import { listWorktrees } from "./worktreeManager";

/** Branch info from the backend. */
export interface BranchInfo {
  name: string;
  is_remote: boolean;
  is_current: boolean;
}

/** Extended branch info with worktree status for UI display. */
export interface BranchWithWorktreeStatus {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  hasWorktree: boolean;
}

/**
 * Fetches all branches for a repository.
 * @param repoPath - Path to the git repository
 * @returns List of branch info from the backend
 */
export async function getBranches(repoPath: string): Promise<BranchInfo[]> {
  return invoke<BranchInfo[]>("git_branches", { repoPath });
}

/**
 * Fetches branches with worktree status indicators.
 * Combines branch list with worktree info to show which branches already have worktrees.
 *
 * @param repoPath - Path to the git repository
 * @returns List of branches with worktree status
 */
export async function getBranchesWithWorktreeStatus(
  repoPath: string
): Promise<BranchWithWorktreeStatus[]> {
  const [branches, worktrees] = await Promise.all([
    getBranches(repoPath),
    listWorktrees(repoPath).catch(() => []), // Gracefully handle non-git repos
  ]);

  const worktreeBranches = new Set(
    worktrees.map((wt) => wt.branch).filter((b): b is string => b !== null)
  );

  return branches.map((branch) => ({
    name: branch.name,
    isRemote: branch.is_remote,
    isCurrent: branch.is_current,
    hasWorktree: worktreeBranches.has(branch.name),
  }));
}

/**
 * Gets the current branch name for a repository.
 * @param repoPath - Path to the git repository
 * @returns Current branch name or short commit hash if detached
 */
export async function getCurrentBranch(repoPath: string): Promise<string> {
  return invoke<string>("git_current_branch", { repoPath });
}

/** File change status from git status. */
export type FileChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "unknown";

/** A file with changes in the working directory. */
export interface WorkingChange {
  path: string;
  /** Status in the index (staged changes). Null if unchanged. */
  index_status: FileChangeStatus | null;
  /** Status in the worktree (unstaged changes). Null if unchanged. */
  worktree_status: FileChangeStatus | null;
  /** Original path for renamed files. */
  old_path: string | null;
}

/**
 * Gets all working directory changes (staged and unstaged).
 * @param repoPath - Path to the git repository
 * @returns List of files with their change status
 */
export async function getWorkingChanges(
  repoPath: string
): Promise<WorkingChange[]> {
  return invoke<WorkingChange[]>("git_working_changes", { repoPath });
}

/**
 * Stages files for commit.
 * @param repoPath - Path to the git repository
 * @param paths - Files to stage
 */
export async function stageFiles(
  repoPath: string,
  paths: string[]
): Promise<void> {
  return invoke<void>("git_stage_files", { repoPath, paths });
}

/**
 * Unstages files (removes from index but keeps changes).
 * @param repoPath - Path to the git repository
 * @param paths - Files to unstage
 */
export async function unstageFiles(
  repoPath: string,
  paths: string[]
): Promise<void> {
  return invoke<void>("git_unstage_files", { repoPath, paths });
}

/**
 * Discards changes in files (restores to HEAD).
 * Warning: This is destructive!
 * @param repoPath - Path to the git repository
 * @param paths - Files to discard
 */
export async function discardFiles(
  repoPath: string,
  paths: string[]
): Promise<void> {
  return invoke<void>("git_discard_files", { repoPath, paths });
}

/**
 * Removes untracked files from the working directory.
 * Warning: This is destructive!
 * @param repoPath - Path to the git repository
 * @param paths - Files to clean
 */
export async function cleanFiles(
  repoPath: string,
  paths: string[]
): Promise<void> {
  return invoke<void>("git_clean_files", { repoPath, paths });
}

/**
 * Creates a commit with the staged changes.
 * @param repoPath - Path to the git repository
 * @param message - Commit message
 * @returns Hash of the created commit
 */
export async function createCommit(
  repoPath: string,
  message: string
): Promise<string> {
  return invoke<string>("git_create_commit", { repoPath, message });
}

/**
 * Pushes commits to the remote repository.
 * @param repoPath - Path to the git repository
 * @param remote - Remote name (optional, defaults to origin)
 * @param branch - Branch name (optional, defaults to current)
 * @param setUpstream - Whether to set upstream tracking
 */
export async function pushChanges(
  repoPath: string,
  remote?: string,
  branch?: string,
  setUpstream = false
): Promise<void> {
  return invoke<void>("git_push", { repoPath, remote, branch, setUpstream });
}

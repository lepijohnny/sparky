import type { StateCreator } from "zustand";
import type { Workspace, WorkspaceSpace } from "../types/workspace";

export interface WorkspaceSlice {
  workspace: Workspace | null;
  setWorkspace: (w: Workspace | null) => void;
  workspaceSpace: WorkspaceSpace | null;
  setWorkspaceSpace: (s: WorkspaceSpace | null) => void;
}

export const createWorkspaceSlice: StateCreator<WorkspaceSlice, [], [], WorkspaceSlice> = (set) => ({
  workspace: null,
  setWorkspace: (w) => set({ workspace: w }),
  workspaceSpace: null,
  setWorkspaceSpace: (s) => set({ workspaceSpace: s }),
});

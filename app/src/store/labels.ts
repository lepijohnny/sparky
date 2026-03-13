import type { StateCreator } from "zustand";
import type { Label } from "../types/label";

export interface LabelsSlice {
  labels: Label[];
  setLabels: (labels: Label[]) => void;
}

export const createLabelsSlice: StateCreator<LabelsSlice, [], [], LabelsSlice> = (set) => ({
  labels: [],
  setLabels: (labels) => set({ labels }),
});

import type { StateCreator } from "zustand";
import type { Skill } from "../types/skill";

export interface SkillFileData {
  name: string;
  content: string;
}

export interface SkillsSlice {
  skills: Skill[];
  selectedSkillId: string | null;
  skillFiles: Record<string, SkillFileData[]>;
  setSkills: (skills: Skill[]) => void;
  selectSkill: (id: string | null) => void;
  setSkillFiles: (id: string, files: SkillFileData[]) => void;
}

export const createSkillsSlice: StateCreator<SkillsSlice> = (set) => ({
  skills: [],
  selectedSkillId: null,
  skillFiles: {},
  setSkills: (skills) => set({ skills }),
  selectSkill: (id) => set({ selectedSkillId: id }),
  setSkillFiles: (id, files) => set((s) => ({ skillFiles: { ...s.skillFiles, [id]: files } })),
});

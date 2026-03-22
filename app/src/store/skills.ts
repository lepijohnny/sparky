import type { StateCreator } from "zustand";
import type { Skill } from "../types/skill";

export interface SkillsSlice {
  skills: Skill[];
  selectedSkillId: string | null;
  setSkills: (skills: Skill[]) => void;
  selectSkill: (id: string | null) => void;
}

export const createSkillsSlice: StateCreator<SkillsSlice> = (set) => ({
  skills: [],
  selectedSkillId: null,
  setSkills: (skills) => set({ skills }),
  selectSkill: (id) => set({ selectedSkillId: id }),
});

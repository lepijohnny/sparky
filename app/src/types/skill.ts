export type SkillState = "draft" | "pending" | "verified" | "rejected" | "active";

export interface SkillBin {
  name: string;
  install: string;
  required: boolean;
  installed: boolean;
}

export interface SkillEnvVar {
  name: string;
  required: boolean;
  group?: string;
  hint?: string;
  present: boolean;
}

export interface SkillEnvGroup {
  min: number;
  hint?: string;
  satisfied: boolean;
}

export interface SkillRequirements {
  bins: SkillBin[];
  env: SkillEnvVar[];
  groups: Record<string, SkillEnvGroup>;
  safe: boolean;
  notes: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  license: string;
  author: string;
  icon: string;
  state: SkillState;
  source: string;
  files: SkillFile[];
  requirements: SkillRequirements | null;
  binsMissing: boolean;
  secretsMissing: boolean;
}

export interface SkillFile {
  name: string;
  isDir: boolean;
  children?: SkillFile[];
}

import type { Grant } from "./grants";

export interface AuthFlowField {
  name: string;
  label: string;
  placeholder?: string;
  url?: string;
}

export interface AuthFlowDefinition {
  domain: string;
  provider: string;
  grant: Grant;
  label: string;
  fields?: AuthFlowField[];
}

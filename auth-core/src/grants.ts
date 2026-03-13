export type Grant = "pkce" | "oauth" | "device" | "pat" | "local";

export interface AuthRequestField {
  type: "url" | "code" | "text";
  label: string;
  value: string;
}

export interface AuthRequest {
  grant: Grant;
  display: AuthRequestField[];
}

export interface AuthVerdict {
  ok: boolean;
  creds?: Record<string, string>;
}

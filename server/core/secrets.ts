export interface KeychainProvider {
  resolve(account: string): Promise<string>;
  store(account: string, value: string): Promise<void>;
  remove(account: string): Promise<void>;
}

/** @deprecated Use Credentials from ./cred instead */
export type { Credentials as SecretsProvider } from "./cred";

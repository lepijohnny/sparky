import type { AuthFlowDefinition } from "./definition";
import type { AuthRequest, AuthVerdict } from "./grants";
import type { Logger } from "./logger";
import type { OAuthTokens, OAuthExchangeParams } from "./oauth";

export interface AuthFlow {
  readonly definition: AuthFlowDefinition;
  request(redirectUri?: string, params?: Record<string, string>): Promise<AuthRequest>;
  verify(params?: Record<string, string>): Promise<AuthVerdict>;
  onSuccess?(): Promise<void>;
  dispose?(): void;
}

export interface AuthPluginContext {
  log: Logger;
  exchange(params: OAuthExchangeParams): Promise<OAuthTokens>;
}

export type AuthPluginFactory = (ctx: AuthPluginContext) => AuthFlow[];

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface OAuthExchangeParams {
  tokenUrl: string;
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier?: string;
  state?: string;
  /** Body encoding. Defaults to "json". Use "form" for GitHub and most other providers. */
  bodyEncoding?: "json" | "form";
}

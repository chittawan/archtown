export type TokenScope = 'read' | 'write';

export type SyncAuth = {
  tokenHash: string;
  tokenId: string;
  googleId: string;
  scope: TokenScope;
};

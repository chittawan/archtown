export type ArchtownMcpContext = {
  baseUrl: string;
  userId: string;
  /** Full Authorization header value, e.g. "Bearer atkn_…", or null if absent */
  authHeader: string | null;
};

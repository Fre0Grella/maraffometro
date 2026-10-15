export type Bindings = {
  db: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FRONTEND_URL: string;
  /** "local" only under `wrangler dev --env local`; enables the demo sign-in. */
  ENVIRONMENT: string;
};

export type Variables = {
  /** The signed-in player, or null for an anonymous read. */
  playerId: string | null;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };

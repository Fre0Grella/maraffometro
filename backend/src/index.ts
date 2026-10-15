import { Hono } from "hono";
import type { AppEnv } from "./env";
import auth, { session } from "./routes/auth";
import api from "./routes/api";
import { fail } from "./routes/errors";

/**
 * The Worker behind maraffometro. It is only ever reached through the Pages
 * Function proxy (or the Vite proxy in development), so the app and the API
 * share one origin and need no CORS.
 */
export function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", session);
  app.get("/", (c) => c.json({ name: "maraffometro-api", ok: true }));
  app.route("/auth", auth);
  app.route("/api/v1", api);
  app.onError((err, c) => {
    console.error(err);
    return fail(c, "server_error");
  });
  return app;
}

export default createApp();

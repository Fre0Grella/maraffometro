import { Hono, type Context } from "hono";
import { googleAuth } from "@hono/oauth-providers/google";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import type { AppEnv } from "../env";
import { upsertGoogleUser } from "../services/players";
import { fail } from "./errors";

const COOKIE = "session_token";
const SESSION_DAYS = 30;

/** Accepts a bare host as well as a URL, as FantasyWiki's FRONTEND_URL does. */
export function resolveFrontendUrl(env: { FRONTEND_URL?: string }): string {
  let url = env.FRONTEND_URL || "localhost:5173";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    const isLocal = url.startsWith("localhost") || url.startsWith("127.");
    url = (isLocal ? "http://" : "https://") + url;
  }
  return url.replace(/\/$/, "");
}

/**
 * The one session: a signed JWT whose subject is the player id, in an
 * HttpOnly cookie. The Pages Function (and the Vite proxy locally) serve the
 * app and the API from one origin, so the cookie is first-party and Lax is
 * enough. Secure follows the frontend's scheme so it also works on localhost.
 */
async function issueSession(c: Context<AppEnv>, playerId: string): Promise<void> {
  const token = await sign(
    { sub: playerId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * SESSION_DAYS },
    c.env.JWT_SECRET,
    "HS256",
  );
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: resolveFrontendUrl(c.env).startsWith("https://"),
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

/** Reads the session if there is one. Never refuses: reads are public. */
export const session = createMiddleware<AppEnv>(async (c, next) => {
  c.set("playerId", null);
  const token = getCookie(c, COOKIE);
  if (token && c.env.JWT_SECRET) {
    try {
      const payload = await verify(token, c.env.JWT_SECRET, "HS256");
      if (typeof payload.sub === "string") c.set("playerId", payload.sub);
    } catch {
      // Expired or tampered: carry on as anonymous.
    }
  }
  await next();
});

export function clearSession(c: Context<AppEnv>): void {
  deleteCookie(c, COOKIE, { path: "/" });
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.playerId) return fail(c, "unauthenticated");
  await next();
});

const auth = new Hono<AppEnv>();

auth.use("/google", async (c, next) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return fail(c, "google_not_configured");
  }
  return googleAuth({
    client_id: c.env.GOOGLE_CLIENT_ID,
    client_secret: c.env.GOOGLE_CLIENT_SECRET,
    scope: ["openid", "email", "profile"],
    redirect_uri: `${resolveFrontendUrl(c.env)}/auth/google`,
  })(c, next);
});

auth.get("/google", async (c) => {
  const frontend = resolveFrontendUrl(c.env);
  const user = c.get("user-google");
  if (!user?.id || !c.env.JWT_SECRET) return c.redirect(`${frontend}/login?error=auth`);

  const player = await upsertGoogleUser(c.env.db, {
    sub: user.id,
    email: user.email ?? null,
    name: user.given_name || user.name || "",
    picture: user.picture ?? null,
  });
  await issueSession(c, player.id);
  return c.redirect(`${frontend}/`);
});

/**
 * Sign-in without Google, for running the app on your own machine. Answers 404
 * anywhere but `wrangler dev --env local`, so production does not even admit it
 * exists. `?name=` picks which demo player, so one browser profile per name lets
 * you seat four people while testing.
 */
auth.get("/dev", async (c) => {
  if (c.env.ENVIRONMENT !== "local") return c.notFound();
  const name = (c.req.query("name") || "Demo").slice(0, 30);
  const player = await upsertGoogleUser(c.env.db, {
    sub: `dev-${name.toLowerCase()}`,
    email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}@demo.local`,
    name,
    picture: null,
  });
  await issueSession(c, player.id);
  return c.redirect(`${resolveFrontendUrl(c.env)}/`);
});

export default auth;

interface Env {
  BACKEND: { fetch(request: Request): Promise<Response> };
}

/** Both the start of the Google sign-in and the address Google redirects back to. */
export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  return env.BACKEND.fetch(request);
}

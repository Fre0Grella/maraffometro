interface Env {
  BACKEND: { fetch(request: Request): Promise<Response> };
}

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  return env.BACKEND.fetch(request);
}

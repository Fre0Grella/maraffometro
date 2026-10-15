import { DELETED_PLAYER_NAME, errorMessage } from "./errors";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The API's error code, e.g. `claim_code_invalid`; `network_error` when offline. */
    readonly code: string,
  ) {
    super(errorMessage(code));
  }
}

/**
 * Gives every deleted player the same display name, wherever a player appears
 * in a response, so no view has to remember to check.
 */
function nameDeletedPlayers(value: unknown): unknown {
  if (Array.isArray(value)) value.forEach(nameDeletedPlayers);
  else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.deleted === true && typeof obj.name === "string") obj.name = DELETED_PLAYER_NAME;
    Object.values(obj).forEach(nameDeletedPlayers);
  }
  return value;
}

/** Same-origin JSON calls to the Worker under /api/v1. Status 0 means the network failed. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error");
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "server_error");
  return nameDeletedPlayers(data) as T;
}

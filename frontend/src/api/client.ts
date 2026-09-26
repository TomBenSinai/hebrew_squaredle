import type {
  AuthInfo, CellCounts, CheckResult, DayProgress, DaysResponse, Definition, FoundWord, PublicBoard, User,
} from "./types";

export class ApiError extends Error {
  /** `detail` is the server's short reason when it gave one, e.g. "too_many" */
  constructor(public status: number, message: string, public detail?: string) {
    super(message);
  }
}

type Headers = Record<string, string>;

async function request<T>(path: string, init: RequestInit & { headers?: Headers } = {}): Promise<T> {
  const res = await fetch("/api" + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { detail?: unknown } | null;
    throw new ApiError(res.status, `${init.method ?? "GET"} ${path}: ${res.status}`,
      typeof body?.detail === "string" ? body.detail : undefined);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown, headers?: Headers) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body), headers });

export const api = {
  days: () => request<DaysResponse>("/days"),
  board: (date: string) => request<PublicBoard>(`/boards/${date}`),
  /** path: cell indexes on the stored (unrotated) board */
  check: (date: string, path: number[]) => post<CheckResult>(`/boards/${date}/check`, { path }),
  liveCells: (date: string, found: string[]) =>
    post<CellCounts>(`/boards/${date}/live-cells`, { found }),
  define: (word: string, signal?: AbortSignal) =>
    request<Definition>(`/define/${encodeURIComponent(word)}`, { signal }),

  /** The session is an HttpOnly cookie: the browser sends it by itself. */
  auth: {
    me: () => request<AuthInfo>("/auth/me", { cache: "no-store" }),
    /** Not fetched: the page goes there, and Google sends it back to /?login=... */
    googleStart: "/api/auth/google/start",
    emailStart: (email: string) => post<{ ok: true }>("/auth/email/start", { email }),
    emailVerify: (token: string) => post<{ user: User }>("/auth/email/verify", { token }),
    /** Move this browser's anonymous progress into the account. */
    claim: (player: string) => post<{ moved: string[] }>("/auth/claim", {}, { "X-Player-Id": player }),
    logout: () => post<{ ok: true }>("/auth/logout", {}),
    deleteAccount: () => request<{ ok: true }>("/auth/me", { method: "DELETE", body: "{}" }),
  },

  progress: {
    all: (player: string) =>
      request<Record<string, DayProgress>>("/progress", { headers: { "X-Player-Id": player } }),
    put: (player: string, date: string, found: FoundWord[], rot: number) =>
      request<DayProgress>(`/progress/${date}`, {
        method: "PUT",
        body: JSON.stringify({ found, rot }),
        headers: { "X-Player-Id": player },
      }),
  },
};

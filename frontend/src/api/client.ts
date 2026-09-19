import type {
  CheckResult, DayProgress, DaysResponse, Definition, FoundWord, PublicBoard,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Headers = Record<string, string>;

async function request<T>(path: string, init: RequestInit & { headers?: Headers } = {}): Promise<T> {
  const res = await fetch("/api" + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new ApiError(res.status, `${init.method ?? "GET"} ${path}: ${res.status}`);
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
    post<{ cells: number[] }>(`/boards/${date}/live-cells`, { found }),
  define: (word: string, signal?: AbortSignal) =>
    request<Definition>(`/define/${encodeURIComponent(word)}`, { signal }),

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

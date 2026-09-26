import { api, ApiError } from "../api/client";
import type { AuthInfo } from "../api/types";
import { forgetDevice, playerId, progressStore } from "./progressStore";

/**
 * Optional login. The server keeps the session in an HttpOnly cookie and files
 * progress under the account whenever it's there, so all the app does is log in,
 * hand the account what this device played so far (claim), and on logout wipe
 * the device.
 */

/** What the page load has to tell the player about logging in, if anything. */
export type AuthNotice =
  | "welcome"          // just logged in
  | "link-expired"     // an email link that was used or too old
  | "google-failed"
  | "offline";

export interface AuthState {
  info: AuthInfo;
  notice: AuthNotice | null;
}

const OFF: AuthInfo = { providers: { google: false, email: false }, user: null };

/**
 * At page load, before the first sync: finish a login the page came back from
 * (an email link's #login=<token>, or Google's /?login=...), then, logged in,
 * claim this device's anonymous progress. Never throws: no backend or no login
 * just means login is hidden.
 */
export async function bootAuth(): Promise<AuthState> {
  let notice: AuthNotice | null = null;

  const url = new URL(location.href);
  const token = new URLSearchParams(url.hash.slice(1)).get("login");
  const back = url.searchParams.get("login");
  if (token || back) {
    // the token is spent either way; keep it out of history and bookmarks
    url.hash = "";
    url.searchParams.delete("login");
    history.replaceState(history.state, "", url.pathname + url.search);
  }
  if (token) {
    try {
      await api.auth.emailVerify(token);
      notice = "welcome";
    } catch (e) {
      notice = e instanceof ApiError ? "link-expired" : "offline";
    }
  } else if (back === "google") notice = "welcome";
  else if (back === "failed") notice = "google-failed";

  let info: AuthInfo;
  try { info = await api.auth.me(); } catch { return { info: OFF, notice: null }; }
  if (info.user) {
    // every load, not just after login: a claim that didn't get through is retried
    await api.auth.claim(playerId()).catch(() => {});
  }
  return { info, notice: info.user || notice !== "welcome" ? notice : null };
}

export class NotSyncedError extends Error {}

/**
 * Log out and wipe this device, then reload as a new anonymous player. Refuses
 * (NotSyncedError) while something played here hasn't reached the account,
 * since the wipe would lose it.
 */
export async function logOut(): Promise<void> {
  await progressStore.sync();
  if (!progressStore.allSent) throw new NotSyncedError();
  await api.auth.logout();
  restart();
}

/** Delete the account and everything saved in it, then start this device afresh. */
export async function deleteAccount(): Promise<void> {
  await api.auth.deleteAccount();
  restart();
}

function restart() {
  forgetDevice();
  location.replace("/");
}

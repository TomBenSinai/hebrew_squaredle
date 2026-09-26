import { api, ApiError } from "../api/client";
import type { AuthInfo } from "../api/types";
import {
  forgetProgress, playerId, progressStore, restartDevice, setLoggedIn, wasLoggedIn,
} from "./progressStore";

/**
 * Optional login. The server keeps the session in an HttpOnly cookie and files
 * progress under the account whenever it's there, so all the app does is log in,
 * hand the account what this device played so far (claim), and on logout wipe
 * the device.
 */

/** What the page load has to tell the player about logging in, if anything. */
export type AuthNotice =
  | "welcome"          // just made the account, with this device's progress in it
  | "welcome-back"     // just logged in to an account that already existed
  | "link-expired"     // an email link that was used or too old
  | "google-failed"
  | "offline";

export interface AuthState {
  info: AuthInfo;
  notice: AuthNotice | null;
  /**
   * false: a login just finished but the server couldn't say into which account,
   * so this device's progress stays on it (no sync) until a later load knows
   */
  settled: boolean;
}

const OFF: AuthInfo = { providers: { google: false, email: false }, user: null, newAccount: false };

// a Google login came back but it isn't known yet whether its account was new
const LOGIN_PENDING = "ribuon:login-pending";

function loginPending(): boolean {
  try { return localStorage.getItem(LOGIN_PENDING) === "1"; } catch { return false; }
}

function setLoginPending(on: boolean) {
  try {
    if (on) localStorage.setItem(LOGIN_PENDING, "1");
    else localStorage.removeItem(LOGIN_PENDING);
  } catch { /* private mode etc. */ }
}

/**
 * At page load, before the first sync: finish a login the page came back from
 * (an email link's #login=<token>, or Google's /?login=...), then, logged in,
 * claim this device's anonymous progress. Never throws: no backend or no login
 * just means login is hidden.
 */
export async function bootAuth(): Promise<AuthState> {
  let notice: AuthNotice | null = null;
  const wasIn = wasLoggedIn();

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
      const { newAccount } = await api.auth.emailVerify(token);
      setLoggedIn(true);
      // back in an account made elsewhere: it brings its own progress, this device's stays out.
      // Settled here, so it holds even if the next request fails.
      if (!newAccount) forgetProgress();
      notice = newAccount ? "welcome" : "welcome-back";
    } catch (e) {
      notice = e instanceof ApiError ? "link-expired" : "offline";
    }
  } else if (back === "google") {
    notice = "welcome";
    // only /api/auth/me tells whether it was new: remember to ask until it answers
    if (!wasIn) setLoginPending(true);
  } else if (back === "failed") notice = "google-failed";

  let info: AuthInfo;
  try {
    info = await api.auth.me();
  } catch {
    return { info: OFF, notice: null, settled: !loginPending() };
  }
  if (!info.user && wasIn) {
    // the session ended while away (the account was deleted on another device,
    // or it expired): what this device holds is that account's
    restartDevice();
    return new Promise(() => {});
  }
  setLoggedIn(!!info.user);
  if (loginPending()) {
    setLoginPending(false);
    if (info.user && !info.newAccount) forgetProgress();
  }
  if (notice === "welcome" && info.user && !info.newAccount) notice = "welcome-back";
  if (info.user && info.newAccount) {
    // every load until one gets through (the server then stops calling the account new)
    await api.auth.claim(playerId()).catch(() => {});
  }
  return { info, notice: info.user || notice !== "welcome" ? notice : null, settled: true };
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
  restartDevice();
}

/** Delete the account and everything saved in it, then start this device afresh. */
export async function deleteAccount(): Promise<void> {
  await api.auth.deleteAccount();
  restartDevice();
}

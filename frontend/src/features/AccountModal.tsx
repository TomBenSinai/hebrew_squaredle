import { useState, type CSSProperties, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { AuthInfo, User } from "../api/types";
import { Button, GoogleLogo, Modal, SheetBody } from "../components";
import { deleteAccount, logOut, NotSyncedError, type AuthNotice } from "../state/auth";
import "./AccountModal.css";

interface Props {
  open: boolean;
  onClose: () => void;
  auth: AuthInfo;
  notice: AuthNotice | null;
  /** days this device has progress on */
  savedDays: number;
}

const NOTICES: Record<AuthNotice, { text: string; bad?: boolean }> = {
  "welcome": { text: "התחברתם. מה ששיחקתם במכשיר הזה עבר לחשבון." },
  "link-expired": { text: "הקישור כבר לא בתוקף: הוא עובד פעם אחת ורק 15 דקות. בקשו קישור חדש.", bad: true },
  "google-failed": { text: "ההתחברות עם Google לא הצליחה. נסו שוב.", bad: true },
  "offline": { text: "אין חיבור לשרת. נסו שוב בעוד רגע.", bad: true },
};

/** Log in to keep progress on every device, or, logged in, the account itself. */
export function AccountModal({ open, onClose, auth, notice, savedDays }: Props) {
  const note = notice && NOTICES[notice];
  return (
    <Modal open={open} onClose={onClose} title={auth.user ? "החשבון" : "התחברות"} sheetClassName="acctcard">
      <SheetBody className="acctbody">
        {note && <p className={"acctnote" + (note.bad ? " bad" : "")} role="status">{note.text}</p>}
        {auth.user
          ? <SignedIn user={auth.user} savedDays={savedDays} />
          : <SignIn providers={auth.providers} />}
      </SheetBody>
    </Modal>
  );
}

// --- logged out ----------------------------------------------------------------

const EMAIL_ERRORS: Record<string, string> = {
  bad_email: "זו לא נראית כמו כתובת מייל.",
  too_many: "ביקשתם כמה קישורים ברצף. נסו שוב בעוד כמה דקות.",
  send_failed: "לא הצלחנו לשלוח את המייל. נסו שוב מאוחר יותר.",
};

function SignIn({ providers }: { providers: AuthInfo["providers"] }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const to = email.trim();
    if (!to || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.auth.emailStart(to);
      setSentTo(to);
    } catch (err) {
      setError(err instanceof ApiError
        ? EMAIL_ERRORS[err.detail ?? ""] ?? EMAIL_ERRORS.send_failed
        : "אין חיבור. בדקו את האינטרנט ונסו שוב.");
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="acctsent" style={{ "--i": 0 } as CSSProperties}>
        <Envelope />
        <h3 className="accthead">בדקו את המייל</h3>
        <p>שלחנו קישור כניסה אל <b dir="ltr">{sentTo}</b>.<br />הוא תקף ל־15 דקות. אפשר לפתוח אותו גם ממכשיר אחר.</p>
        {error && <p className="accterr" role="alert">{error}</p>}
        <p className="acctfine">
          לא הגיע? בדקו בתיקיית הספאם, או{" "}
          <button type="button" className="linkish" onClick={() => send()} disabled={busy}>שלחו שוב</button>
          {" · "}
          <button type="button" className="linkish" onClick={() => { setSentTo(null); setError(null); }}>
            כתובת אחרת
          </button>
        </p>
      </div>
    );
  }

  return (
    <>
      <SyncPicture />
      <p className="acctlead" style={{ "--i": 1 } as CSSProperties}>
        התחברו, וההתקדמות שלכם תחכה לכם בכל מכשיר. מה ששיחקתם עד עכשיו כאן יישמר בחשבון.
      </p>

      <div className="acctways" style={{ "--i": 2 } as CSSProperties}>
        {providers.google && (
          <a className="btn gbtn" href={api.auth.googleStart}>
            <GoogleLogo />
            <span>המשך עם Google</span>
          </a>
        )}
        {providers.google && providers.email && <div className="acctor"><span>או עם קישור במייל</span></div>}
        {providers.email && (
          <form className="acctform" onSubmit={send} noValidate>
            <input aria-label="כתובת מייל" className="acctinput" type="email" inputMode="email" autoComplete="email"
              dir="ltr" placeholder="name@example.com" value={email} required
              aria-invalid={!!error || undefined} aria-describedby={error ? "acct-email-err" : undefined}
              onChange={e => setEmail(e.target.value)} />
            <Button type="submit" variant="primary" disabled={busy || !email.trim()}>
              {busy ? "שולחים…" : "שלחו לי קישור"}
            </Button>
          </form>
        )}
        {error && <p id="acct-email-err" className="accterr" role="alert">{error}</p>}
      </div>

      <p className="acctfine" style={{ "--i": 3 } as CSSProperties}>
        בלי סיסמאות. שומרים רק את כתובת המייל ואת המשחקים שלכם, ואפשר למחוק את החשבון בכל רגע.
      </p>
    </>
  );
}

/**
 * The idea in one picture: a word swiped on the phone draws itself, travels
 * along the arc, and lights up on the laptop too. Same board, same path as the
 * rules' demo, so it reads as the game's own drawing.
 */
function SyncPicture() {
  // 3x3, cell 0 at the top right (Hebrew reads from the right); the path spells שמור
  const letters = ["ש", "מ", "א", "ב", "ו", "ר", "ת", "ה", "נ"];
  const path = [0, 1, 4, 5];
  const cell = 20, gap = 4;
  const board = (x: number, y: number, cls: string) => {
    const at = (i: number) => ({ cx: x + (2 - (i % 3)) * (cell + gap), cy: y + Math.floor(i / 3) * (cell + gap) });
    return (
      <g className={cls}>
        <polyline pathLength={100}
          points={path.map(i => { const { cx, cy } = at(i); return `${cx + cell / 2},${cy + cell / 2}`; }).join(" ")} />
        {letters.map((l, i) => {
          const { cx, cy } = at(i);
          return (
            <g key={i} className={path.includes(i) ? "on" : undefined}
              style={{ "--k": path.indexOf(i) } as CSSProperties}>
              <rect x={cx} y={cy} width={cell} height={cell} rx={4} />
              <text x={cx + cell / 2} y={cy + cell / 2 + 4.5} textAnchor="middle">{l}</text>
            </g>
          );
        })}
      </g>
    );
  };
  return (
    <svg className="acctpic" viewBox="0 0 300 150" role="img" aria-label="אותו לוח, בטלפון ובמחשב">
      {/* laptop, left */}
      <rect className="frame" x="22" y="22" width="132" height="88" rx="7" />
      <path className="frame" d="M8 118h160l-8 10H16z" />
      {board(54, 30, "mini late")}
      {/* phone, right */}
      <rect className="frame" x="208" y="8" width="78" height="134" rx="14" />
      <path className="frame notch" d="M236 16h22" />
      {board(211, 40, "mini")}
      {/* what travels between them */}
      <path className="arc" d="M204 46C186 8 128 0 112 16" pathLength={100} />
      <circle className="spark" r="3.2" />
    </svg>
  );
}

function Envelope() {
  return (
    <svg className="acctenv" viewBox="0 0 64 48" aria-hidden="true">
      <rect x="3" y="5" width="58" height="40" rx="5" />
      <path d="M5 8l27 21L59 8" />
    </svg>
  );
}

// --- logged in -----------------------------------------------------------------

function SignedIn({ user, savedDays }: { user: User; savedDays: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const shown = user.name || user.email || "";
  const initial = [...shown.trim()][0]?.toUpperCase() ?? "?";

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();                         // reloads the page on success
    } catch (err) {
      setError(err instanceof NotSyncedError
        ? "חלק מההתקדמות עוד לא הגיע לשרת. בדקו את החיבור ונסו שוב, כדי שלא יאבד."
        : "אין חיבור לשרת. נסו שוב בעוד רגע.");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="acctid" style={{ "--i": 0 } as CSSProperties}>
        <span className="acctavatar" aria-hidden="true">{initial}</span>
        <div className="acctwho">
          <b>{shown}</b>
          {user.name && user.email && <span dir="ltr">{user.email}</span>}
        </div>
      </div>

      <div className="acctsaved" style={{ "--i": 1 } as CSSProperties}>
        <span className="acctcount">{savedDays}</span>
        <span>{savedDays === 1 ? "יום שמור בחשבון" : "ימים שמורים בחשבון"}, ומחכים לכם בכל מכשיר שתתחברו ממנו.</span>
      </div>

      {error && <p className="accterr" role="alert">{error}</p>}

      <div className="acctactions" style={{ "--i": 2 } as CSSProperties}>
        <Button onClick={() => run(logOut)} disabled={busy}>התנתקות</Button>
        <p className="acctfine">ההתקדמות נשארת בחשבון, והמכשיר הזה יתחיל מחדש.</p>
      </div>

      <div className="acctdanger" style={{ "--i": 3 } as CSSProperties}>
        {confirming ? (
          <div className="acctconfirm" role="group" aria-label="מחיקת החשבון">
            <p>למחוק את החשבון ואת כל ההתקדמות השמורה בו? אי אפשר לבטל את זה.</p>
            <div className="acctrow">
              <Button className="danger" onClick={() => run(deleteAccount)} disabled={busy}>מחיקה לצמיתות</Button>
              <Button onClick={() => setConfirming(false)} disabled={busy}>ביטול</Button>
            </div>
          </div>
        ) : (
          <button type="button" className="linkish muted" onClick={() => setConfirming(true)}>מחיקת החשבון</button>
        )}
      </div>
    </>
  );
}

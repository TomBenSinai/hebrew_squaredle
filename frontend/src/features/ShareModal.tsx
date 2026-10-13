import { useEffect, useRef, useState } from "react";
import { Button, Modal, SheetBody, ShareIcon } from "../components";
import { canShareFile, saveFile, share, shareFile } from "../lib/share";
import { shareImage, type ShareCard } from "../lib/shareImage";
import "./ShareModal.css";

interface Props {
  open: boolean;
  onClose: () => void;
  /** the picture's content and the same result in words; null while it's closed */
  data: { card: ShareCard; text: string } | null;
}

/**
 * The result as a picture, ready to post: a story-sized card with the board
 * and the count. A phone sends it through its share menu (Instagram among
 * them); a computer saves it. The text and link go on their own button.
 */
export function ShareModal({ open, onClose, data }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  // a retry draws it again
  const [attempt, setAttempt] = useState(0);
  const card = data?.card;
  const cardRef = useRef(card);
  cardRef.current = card;

  // drawn on opening, so the tap that shares has the file in hand
  useEffect(() => {
    const card = cardRef.current;
    if (!open || !card) return;
    let live = true, made: string | null = null;
    setFile(null); setUrl(null); setFailed(false); setCopied(false);
    shareImage(card).then(blob => {
      if (!live) return;
      made = URL.createObjectURL(blob);
      setFile(new File([blob], `ribuon-${card.number ?? "mini"}.png`, { type: "image/png" }));
      setUrl(made);
    }, () => live && setFailed(true));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [open, attempt]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  const menu = !!file && canShareFile(file);
  const sendImage = () => {
    if (!file) return;
    // a share menu that turns the picture down: save it instead, so the tap does something
    if (menu) shareFile(file).then(ok => { if (!ok) saveFile(file); });
    else saveFile(file);
  };
  const sendText = () => { if (data) share(data.text).then(r => setCopied(r === "copied")); };

  return (
    <Modal open={open} onClose={onClose} sheetClassName="sharecard" layer={40} title="שיתוף התוצאה">
      <SheetBody className="sharebody">
        <div className={"sharepreview" + (url ? " ready" : "")}>
          {url
            ? <img src={url} alt="תמונת התוצאה לשיתוף" />
            : <span className="sharewait">{failed ? "לא הצלחנו להכין תמונה" : "מכינים תמונה…"}</span>}
        </div>
        <div className="shareactions">
          {failed
            ? <Button onClick={() => setAttempt(a => a + 1)}>לנסות שוב</Button>
            : <>
                <Button variant="primary" className="sharemain" disabled={!file} onClick={sendImage}>
                  <ShareIcon />
                  <span>{menu || !file ? "שיתוף התמונה" : "שמירת התמונה"}</span>
                </Button>
                <p className="sharenote">
                  {menu || !file
                    ? "בתפריט שייפתח בחרו אינסטגרם, וואטסאפ או כל אפליקציה אחרת"
                    : "שמרו אותה והעלו לאינסטגרם, או לכל מקום אחר"}
                </p>
              </>}
          <Button onClick={sendText}>
            {/* read out when it changes: on a computer the copy is all that happens */}
            <span aria-live="polite">{copied ? "הועתק, אפשר להדביק" : "שיתוף בטקסט עם קישור"}</span>
          </Button>
        </div>
      </SheetBody>
    </Modal>
  );
}

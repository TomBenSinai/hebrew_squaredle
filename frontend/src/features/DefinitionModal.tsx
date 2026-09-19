import { useEffect, useState } from "react";
import { Button, LinkButton, Modal } from "../components";
import { api } from "../api/client";
import type { Definition } from "../api/types";
import "./DefinitionModal.css";

interface Props {
  word: string | null;
  onClose: () => void;
  onShow: (word: string) => void;
}

const milogUrl = (w: string) => "https://milog.co.il/" + encodeURIComponent(w);

/** A found word's meaning from Milog (through the backend), and a link to the full entry. */
export function DefinitionModal({ word, onClose, onShow }: Props) {
  // keep the last word while the card animates closed
  const [shown, setShown] = useState<string | null>(word);
  const [def, setDef] = useState<Definition | null | "loading">("loading");
  useEffect(() => {
    if (!word) return;
    setShown(word);
    setDef("loading");
    const ctl = new AbortController();
    api.define(word, ctl.signal).then(setDef).catch(() => { if (!ctl.signal.aborted) setDef(null); });
    return () => ctl.abort();
  }, [word]);

  const w = shown ?? "";
  const entry = def && def !== "loading" ? def.entries[0] : undefined;
  const sense = entry?.senses[0];

  return (
    <Modal open={!!word} onClose={onClose} title={w} sheetClassName="defcard" layer={30}>
      <div className="defbody">
        {def === "loading" ? (
          <p className="deftext loading">מחפש הגדרה</p>
        ) : entry && sense ? (
          <>
            <p className="defmeta"><b>{entry.title}</b>{entry.info && ` · ${entry.info}`}</p>
            {sense.text && <p className="deftext">{sense.text}</p>}
            {sense.examples[0] && <p className="defex">{sense.examples[0]}</p>}
            {entry.senses.length > 1 && (
              <ol className="defmore" start={2}>
                {entry.senses.slice(1).filter(s => s.text).map(s => <li key={s.text}>{s.text}</li>)}
              </ol>
            )}
            <p className="defnote">מתוך מילוג</p>
          </>
        ) : (
          <p className="deftext">ההגדרה המלאה נמצאת במילוג.</p>
        )}
        <div className="defactions">
          <LinkButton variant="primary" external href={milogUrl(w)}>למילוג ↗</LinkButton>
          <Button onClick={() => onShow(w)}>הצגה על הלוח</Button>
        </div>
      </div>
    </Modal>
  );
}

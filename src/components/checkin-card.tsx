"use client";

import { useState, useTransition } from "react";
import { Capacity, CAPACITY_META, STRESS_SCALE } from "@/lib/domain";
import { clearCheckIn, submitCheckIn } from "@/app/actions/capacity";

type CheckInView = {
  capacity: Capacity;
  stress: number | null;
  shareLevel: string;
  note: string | null;
  updatedLabel: string;
} | null;

const capacityOrder: Capacity[] = ["high", "normal", "reduced", "protected", "unavailable"];

// Il check-in è volontario: dice come stai, non cosa devi. Alimenta il carico e la ricerca di alternative.
export function CheckinCard({ current }: { current: CheckInView }) {
  const [open, setOpen] = useState(!current);
  const [capacity, setCapacity] = useState<Capacity>(current?.capacity ?? "normal");
  const [shareLevel, setShareLevel] = useState(current?.shareLevel ?? "band");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        await submitCheckIn(formData);
        setOpen(false);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile salvare il check-in.");
      }
    });
  }

  function reset() {
    setError("");
    startTransition(async () => {
      try {
        await clearCheckIn();
        setOpen(true);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile annullare il check-in.");
      }
    });
  }

  return (
    <section className="cb-card">
      <div className="cb-card-head">
        <div>
          <h2>Come stai oggi?</h2>
          <p>Un gesto volontario e privato. Aiuta il nucleo a non caricarti senza saperlo.</p>
        </div>
        {!open && current && <span className={`capacity-chip capacity-${current.capacity}`}>{CAPACITY_META[current.capacity].label}</span>}
      </div>

      {!open && current ? (
        <div>
          <div className="person-row">
            <div className="person-grow">
              <span className="person-name">{CAPACITY_META[current.capacity].label}</span>
              <span className="person-sub">{CAPACITY_META[current.capacity].behavior}</span>
            </div>
          </div>
          {current.stress != null && <p className="muted-note">Stress dichiarato: {current.stress}/5 · aggiornato {current.updatedLabel}</p>}
          <div className="cb-hello-actions" style={{ marginTop: 12 }}>
            <button className="outline-button small-button" type="button" onClick={() => setOpen(true)}>Aggiorna</button>
            <button className="danger-button small-button" type="button" onClick={reset} disabled={pending}>Annulla check-in</button>
          </div>
          {error && <div className="error-banner" role="alert">{error}</div>}
        </div>
      ) : (
        <form action={save}>
          <div className="field-label">La tua capacità oggi
            <div className="checkin-scale">
              {capacityOrder.map((level) => (
                <label className="checkin-option" key={level}>
                  <input type="radio" name="capacity" value={level} checked={capacity === level} onChange={() => setCapacity(level)} />
                  <span>{CAPACITY_META[level].label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label className="field-label">Stress percepito
              <select name="stress" defaultValue={current?.stress != null ? String(current.stress) : "1"}>
                {STRESS_SCALE.map((entry) => <option value={entry.level} key={entry.level}>{entry.level} · {entry.label}</option>)}
              </select>
            </label>
            <label className="field-label">Chi vede questo dato
              <select name="shareLevel" value={shareLevel} onChange={(event) => setShareLevel(event.target.value)}>
                <option value="private">Solo io</option>
                <option value="band">Il nucleo vede solo una fascia</option>
                <option value="detail">Il nucleo vede il dettaglio</option>
              </select>
            </label>
          </div>

          <label className="field-label">Nota (facoltativa)
            <textarea name="note" maxLength={400} placeholder="Vuoi aggiungere un contesto? Resta sotto il tuo controllo." defaultValue={current?.note ?? ""} />
          </label>

          <label className="checkbox-row">
            <input type="checkbox" name="needPause" value="true" />
            Oggi avrei bisogno di una pausa dalle nuove richieste.
          </label>

          {error && <div className="error-banner" role="alert">{error}</div>}
          <div className="form-footer">
            {current && <button className="outline-button" type="button" onClick={() => setOpen(false)} disabled={pending}>Chiudi</button>}
            <button className="primary-button" type="submit" disabled={pending}>{pending ? "Salvo…" : "Salva check-in"}</button>
          </div>
        </form>
      )}
    </section>
  );
}

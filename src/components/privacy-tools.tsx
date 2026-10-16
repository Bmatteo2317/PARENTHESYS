"use client";

import { useState, useTransition } from "react";
import { leaveNucleus, requestDeletion, requestExport } from "@/app/actions/privacy";

// Privacy relazionale: i tuoi dati restano tuoi, e ogni accesso sensibile è tracciato.
export function PrivacyTools({ canExportHousehold, canDeleteHousehold }: { canExportHousehold: boolean; canDeleteHousehold: boolean }) {
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function runExport(scope: "me" | "household") {
    setError("");
    setFeedback("");
    const formData = new FormData();
    formData.set("scope", scope);
    startTransition(async () => {
      try {
        const result = await requestExport(formData);
        const blob = new Blob([JSON.stringify(result.payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = result.filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setFeedback("Esportazione pronta: il download è appena iniziato.");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile esportare i dati.");
      }
    });
  }

  function deletion(formData: FormData) {
    setError("");
    setFeedback("");
    startTransition(async () => {
      try {
        await requestDeletion(formData);
        setFeedback("Richiesta registrata: resta tracciata e verificabile finché non viene evasa.");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile inviare la richiesta.");
      }
    });
  }

  function leave(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        await leaveNucleus(formData);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile completare l'uscita.");
      }
    });
  }

  return (
    <div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {feedback && <div className="success-banner" role="status">{feedback}</div>}

      <div className="privacy-grid">
        <article className="privacy-card">
          <h3>Esporta i tuoi dati</h3>
          <p>Scarica un file leggibile con eventi, attività, check-in e richieste che ti riguardano.</p>
          <div className="cb-hello-actions">
            <button className="primary-button small-button" type="button" disabled={pending} onClick={() => runExport("me")}>Esporta solo i miei</button>
            {canExportHousehold && <button className="outline-button small-button" type="button" disabled={pending} onClick={() => runExport("household")}>Esporta il nucleo</button>}
          </div>
        </article>

        <article className="privacy-card">
          <h3>Chiedi la cancellazione</h3>
          <p>La richiesta è tracciata e verificabile: sai sempre a che punto è.</p>
          <form action={deletion}>
            <label className="field-label">Cosa vuoi cancellare
              <select name="scope" defaultValue="personal">
                <option value="personal">I miei dati personali</option>
                <option value="account">Il mio account</option>
                {canDeleteHousehold && <option value="household">I dati dell&apos;intero nucleo</option>}
              </select>
            </label>
            <label className="field-label">Motivo (facoltativo)<textarea name="reason" maxLength={400} placeholder="Puoi spiegare, o lasciare vuoto." /></label>
            <div className="form-footer"><button className="danger-button small-button" type="submit" disabled={pending}>Invia richiesta</button></div>
          </form>
        </article>

        <article className="privacy-card">
          <h3>Lascia il nucleo</h3>
          <p>La tua presenza è tua: puoi uscire in qualsiasi momento. I tuoi contributi restano tracciati nell&apos;audit.</p>
          <form action={leave}>
            <label className="field-label">Motivo (facoltativo)<input name="reason" maxLength={200} placeholder="Puoi lasciar stare." /></label>
            <div className="form-footer"><button className="danger-button small-button" type="submit" disabled={pending}>Esci dal nucleo</button></div>
          </form>
        </article>
      </div>
    </div>
  );
}

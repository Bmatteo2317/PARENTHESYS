"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelSupportRequest, claimSupportRequest, createSupportRequest, releaseSupportRequest } from "@/app/actions/tasks";

type SupportRequest = {
  id: string;
  title: string;
  description: string | null;
  neededBy: string;
  status: "OPEN" | "CLAIMED";
  createdById: string;
  createdByName: string;
  claimedById: string | null;
  claimedByName: string | null;
};

export function SupportRequestsBoard({
  requests,
  currentUserId,
}: {
  requests: SupportRequest[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  async function submitRequest(formData: FormData) {
    setError("");
    setPendingId("new");
    try {
      await createSupportRequest(formData);
      setShowForm(false);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Non è stato possibile pubblicare la richiesta.");
    } finally {
      setPendingId("");
    }
  }

  async function updateRequest(
    formData: FormData,
    action: typeof claimSupportRequest | typeof cancelSupportRequest | typeof releaseSupportRequest,
    id: string,
  ) {
    setError("");
    setPendingId(id);
    try {
      await action(formData);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Non è stato possibile aggiornare la richiesta.");
    } finally {
      setPendingId("");
    }
  }

  return (
    <section className="panel support-requests-panel">
      <div className="panel-heading">
        <div><h2>Serve una mano?</h2><p>Chiedere aiuto è parte dell’organizzazione: nessuno viene assegnato senza il suo consenso.</p></div>
        <button className="outline-button small-button" type="button" onClick={() => { setShowForm(!showForm); setError(""); }}>
          {showForm ? "Chiudi" : "＋ Chiedi aiuto"}
        </button>
      </div>
      {showForm && <form className="support-request-form" action={submitRequest}>
        <label className="field-label">Di cosa hai bisogno?<input name="title" required minLength={3} maxLength={120} placeholder="Es. Qualcuno può ritirare Alex da scuola?" /></label>
        <div className="form-row">
          <label className="field-label">Entro quando?<input type="date" name="neededBy" required defaultValue={todayKey} /></label>
          <label className="field-label">Dettagli facoltativi<textarea name="description" rows={2} maxLength={500} placeholder="Aggiungi solo le informazioni utili alla richiesta." /></label>
        </div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <button className="primary-button small-button" type="submit" disabled={pendingId === "new"}>{pendingId === "new" ? "Pubblicazione…" : "Pubblica richiesta"}</button>
      </form>}
      {error && !showForm && <div className="error-banner" role="alert">{error}</div>}
      {requests.length === 0 ? (
        <div className="support-empty"><strong>Nessuna richiesta aperta.</strong><span>Se ti serve supporto, puoi chiedere qui; ogni familiare sceglie liberamente se offrirsi.</span></div>
      ) : (
        <div className="support-request-list">{requests.map((request) => {
          const neededBy = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "UTC" })
            .format(new Date(`${request.neededBy}T12:00:00Z`));
          const isCreator = request.createdById === currentUserId;
          return (
            <article className="support-request-card" key={request.id}>
              <div className="support-request-copy">
                <div className="support-request-title">{request.title}</div>
                {request.description && <p>{request.description}</p>}
                <div className="task-meta"><span>Chiesto da {request.createdByName}</span><span>Entro il {neededBy}</span></div>
                {request.status === "CLAIMED" && <span className="support-claimed-status">Disponibile: {request.claimedByName ?? "familiare"}</span>}
              </div>
              <div className="support-request-actions">
                {request.status === "OPEN" && !isCreator && <form action={(formData) => updateRequest(formData, claimSupportRequest, request.id)}>
                  <input type="hidden" name="id" value={request.id} />
                  <button className="primary-button small-button" type="submit" disabled={pendingId === request.id}>{pendingId === request.id ? "Invio…" : "Posso aiutare"}</button>
                </form>}
                {request.status === "CLAIMED" && request.claimedById === currentUserId && <form action={(formData) => updateRequest(formData, releaseSupportRequest, request.id)}>
                  <input type="hidden" name="id" value={request.id} />
                  <button className="outline-button small-button" type="submit" disabled={pendingId === request.id}>{pendingId === request.id ? "Aggiornamento…" : "Rinuncia"}</button>
                </form>}
                {isCreator && <form action={(formData) => updateRequest(formData, cancelSupportRequest, request.id)}>
                  <input type="hidden" name="id" value={request.id} />
                  <button className="outline-button small-button" type="submit" disabled={pendingId === request.id}>{pendingId === request.id ? "Ritiro…" : "Ritira richiesta"}</button>
                </form>}
              </div>
            </article>
          );
        })}</div>
      )}
    </section>
  );
}

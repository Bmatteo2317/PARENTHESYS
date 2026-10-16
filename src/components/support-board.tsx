"use client";

import { useState, useTransition } from "react";
import { createSupportRequest, respondToSupportRequest } from "@/app/actions/activities";

export type SupportItem = {
  id: string;
  message: string;
  reasonType: string;
  createdAtLabel: string;
  authorName: string;
  authorColor: string;
  taskTitle: string | null;
  isMine: boolean;
  status: string;
  responses: { id: string; response: string; message: string | null; responderName: string }[];
};

const reasonLabels: Record<string, string> = {
  need_help: "Serve una mano",
  cannot_attend: "Non riesco a esserci",
  need_company: "Serve una persona presente",
  need_equipment: "Manca qualcosa",
  need_time: "Serve più tempo",
};

// Chiedere aiuto è un atto di coordinamento, non un fallimento da nascondere.
export function SupportBoard({ openItems, resolvedItems, tasks, canRespond }: { openItems: SupportItem[]; resolvedItems: SupportItem[]; tasks: { id: string; title: string }[]; canRespond: boolean }) {
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function create(formData: FormData) {
    setError("");
    setFeedback("");
    startTransition(async () => {
      try {
        await createSupportRequest(formData);
        setMessage("");
        setFeedback("Richiesta aperta: il nucleo è stato avvisato.");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile aprire la richiesta.");
      }
    });
  }

  function respond(requestId: string, response: "accept" | "alternative" | "decline", note?: string) {
    setError("");
    setFeedback("");
    const formData = new FormData();
    formData.set("requestId", requestId);
    formData.set("response", response);
    if (note) formData.set("message", note);
    startTransition(async () => {
      try {
        await respondToSupportRequest(formData);
        setFeedback(response === "accept" ? "Hai raccolto la richiesta." : response === "alternative" ? "Hai proposto un'alternativa." : "Hai risposto alla richiesta.");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile rispondere.");
      }
    });
  }

  function renderItem(item: SupportItem) {
    return (
      <article className={`support-card ${item.status === "open" ? "open" : ""}`} key={item.id}>
        <div className="inbox-item-head">
          <span className="person-avatar" style={{ background: item.authorColor }}>{item.authorName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
          <div>
            <span className="person-name">{item.isMine ? "La tua richiesta" : item.authorName}</span>
            <span className="person-sub">{item.createdAtLabel}</span>
          </div>
          <span className={`chip ${item.status === "open" ? "chip-warn" : "chip-ok"}`} style={{ marginLeft: "auto" }}>{reasonLabels[item.reasonType] ?? item.reasonType}</span>
        </div>
        {item.taskTitle && <p className="muted-note">Collegata a: {item.taskTitle}</p>}
        <p className="support-quote">{item.message}</p>

        {item.responses.length > 0 && (
          <div className="support-responses">
            {item.responses.map((entry) => (
              <div className="support-response" key={entry.id}>
                <strong>{entry.responderName}</strong>
                <span>{entry.response === "accept" ? "ha raccolto la richiesta" : entry.response === "alternative" ? "ha proposto un'alternativa" : "ha risposto"}</span>
                {entry.message && <span className="muted-note">· {entry.message}</span>}
              </div>
            ))}
          </div>
        )}

        {item.status === "open" && canRespond && !item.isMine && (
          <div className="support-actions" style={{ marginTop: 11 }}>
            <button className="primary-button small-button" type="button" disabled={pending} onClick={() => respond(item.id, "accept")}>Me ne occupo io</button>
            <button className="outline-button small-button" type="button" disabled={pending} onClick={() => respond(item.id, "alternative", "Posso farlo, ma a un orario o in un modo diverso.")}>Proponi un'alternativa</button>
            <button className="outline-button small-button" type="button" disabled={pending} onClick={() => respond(item.id, "decline", "Non riesco questa volta.")}>Non posso</button>
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="cb-grid">
      <div>
        <section className="panel">
          <div className="panel-heading"><div><h2>Richieste aperte</h2><p>Problemi già visibili, prima che scoppino.</p></div><span className="count-badge">{openItems.length}</span></div>
          {openItems.length ? openItems.map(renderItem) : <div className="empty-inline">Nessuna richiesta aperta. Va bene così.</div>}
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>Già risolte</h2><p>Piccole cose andate a buon fine.</p></div><span className="count-badge">{resolvedItems.length}</span></div>
          {resolvedItems.length ? resolvedItems.map(renderItem) : <div className="empty-inline">Ancora nessuna richiesta risolta.</div>}
        </section>
      </div>

      <div>
        <section className="panel">
          <div className="panel-heading"><div><h2>Chiedi aiuto</h2><p>Descrivi cosa serve. Non devi giustificarti: basta dirlo.</p></div></div>
          <form action={create}>
            <label className="field-label">Cosa ti serve<textarea name="message" required minLength={3} maxLength={600} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Es. Giovedì non riesco ad accompagnare Giulia dal dentista: qualcuno può?" /></label>
            <div className="form-row">
              <label className="field-label">Tipo di bisogno
                <select name="reasonType" defaultValue="need_help">
                  {Object.entries(reasonLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <label className="field-label">Collega a un'attività (facoltativo)
                <select name="taskId" defaultValue="">
                  <option value="">Nessuna attività specifica</option>
                  {tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}
                </select>
              </label>
            </div>
            {error && <div className="error-banner" role="alert">{error}</div>}
            {feedback && <div className="success-banner" role="status">{feedback}</div>}
            <div className="form-footer"><button className="primary-button small-button" type="submit" disabled={pending}>{pending ? "Invio…" : "Chiedi aiuto"}</button></div>
          </form>
        </section>
      </div>
    </div>
  );
}

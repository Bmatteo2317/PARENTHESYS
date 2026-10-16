"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { extractInbox, resolveInboxItem } from "@/app/actions/inbox";
import { CATEGORY_META } from "@/lib/categories";
import { Category } from "@/lib/domain";

export type InboxDraftItem = {
  kind: string;
  title: string;
  category: string;
  startIso: string | null;
  endIso: string | null;
  estimatedMinutes: number | null;
  assigneeName: string | null;
  location: string | null;
  notes: string | null;
  missing: string[];
};

export type InboxDraft = {
  id: string;
  rawText: string;
  createdAtLabel: string;
  authorName: string;
  confidence: number;
  explanation: string | null;
  items: InboxDraftItem[];
};

const dateFormat = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" });

// Il Care Orchestrator trasforma testo confuso in una bozza ordinata. Non scrive nulla: propone.
export function CareInbox({ drafts, configured, canConfirm }: { drafts: InboxDraft[]; configured: boolean; canConfirm: boolean }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function interpret() {
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.set("text", text);
    startTransition(async () => {
      const result = await extractInbox(formData);
      if (result.ok) {
        setText("");
        setMessage("Bozza pronta: controlla e conferma solo ciò che ha senso.");
      } else {
        setError(result.error);
      }
    });
  }

  function resolve(id: string, decision: "accept" | "reject") {
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.set("inboxItemId", id);
    formData.set("decision", decision);
    startTransition(async () => {
      try {
        await resolveInboxItem(formData);
        setMessage(decision === "accept" ? "Elementi aggiunti al vostro calendario e alle attività." : "Bozza scartata. Nessun dato è stato scritto.");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile gestire la bozza.");
      }
    });
  }

  return (
    <div className="inbox-layout">
      <div>
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Incolla un testo</h2><p>Un messaggio, un volantino, un appunto. Il Care Orchestrator lo legge e propone una bozza.</p></div>
          </div>
          <div className="inbox-compose">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Es. «Giovedì alle 17 visita dal dentista per Giulia, serve qualcuno che la accompagni. Devo anche prendere le medicine in farmacia prima di venerdì.»"
            />
          </div>
          <div className="cb-hello-actions" style={{ marginTop: 12 }}>
            <button className="primary-button small-button" type="button" onClick={interpret} disabled={pending || !configured || text.trim().length < 4}>
              {pending ? "Il Care Orchestrator legge…" : "Interpreta con il Care Orchestrator"}
            </button>
            <Link className="outline-button small-button" href="/summary">Vai al riepilogo settimanale</Link>
          </div>
          <div className="ai-banner" style={{ marginTop: 12 }}>
            <span>✳</span>
            <span>
              {configured
                ? "I nomi vengono sostituiti con token prima di raggiungere il modello, e mai restituiti. Il risultato non scrive nulla: resta una bozza che solo tu puoi confermare."
                : "Il Care Orchestrator non è configurato: imposta OPENROUTER_API_KEY sul server per abilitarlo. Le altre funzioni restano disponibili."}
            </span>
          </div>
          {error && <div className="error-banner" role="alert">{error}</div>}
          {message && <div className="success-banner" role="status">{message}</div>}
        </section>
      </div>

      <div>
        <div className="page-heading" style={{ marginBottom: 13 }}>
          <div><h2 className="section-title">Bozze da confermare</h2><p className="section-sub">Anche se il Care Orchestrator propone un responsabile, la scelta resta sempre vostra.</p></div>
          <span className="count-badge">{drafts.length}</span>
        </div>
        {drafts.length ? drafts.map((draft) => (
          <article className="inbox-item" key={draft.id}>
            <div className="inbox-item-head">
              <span className="chip chip-purple">Bozza · {Math.round(draft.confidence * 100)}%</span>
              <span className="audit-time" style={{ marginLeft: "auto" }}>{draft.authorName} · {draft.createdAtLabel}</span>
            </div>
            {draft.items.map((item, index) => {
              const meta = CATEGORY_META[item.category as Category];
              return (
                <div className="draft-item" key={index}>
                  <h4>{item.kind === "event" ? "Evento" : "Attività"} · {item.title}</h4>
                  <div className="draft-meta">
                    <span className="chip" style={meta ? { background: meta.soft, color: meta.color } : undefined}>{meta?.label ?? item.category}</span>
                    {item.startIso && <span className="chip chip-neutral">{dateFormat.format(new Date(item.startIso))}</span>}
                    {item.estimatedMinutes != null && <span className="chip chip-neutral">{item.estimatedMinutes} min</span>}
                    <span className="chip chip-neutral">{item.assigneeName ? `Proposto: ${item.assigneeName}` : "Nessun responsabile"}</span>
                  </div>
                  {item.location && <p className="muted-note" style={{ marginTop: 7 }}>Luogo: {item.location}</p>}
                  {item.notes && <p className="muted-note" style={{ marginTop: 4 }}>{item.notes}</p>}
                  {item.missing.length > 0 && (
                    <div className="draft-meta">
                      {item.missing.map((missing, missingIndex) => <span className="chip chip-warn" key={missingIndex}>Da chiarire: {missing}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="muted-note" style={{ marginTop: 9 }}>
              <strong>Perché questa lettura:</strong> {draft.explanation ?? "Nessuna spiegazione fornita."}
            </p>
            {canConfirm && (
              <div className="cb-hello-actions" style={{ marginTop: 11 }}>
                <button className="primary-button small-button" type="button" disabled={pending} onClick={() => resolve(draft.id, "accept")}>Conferma e crea</button>
                <button className="outline-button small-button" type="button" disabled={pending} onClick={() => resolve(draft.id, "reject")}>Scarta</button>
              </div>
            )}
          </article>
        )) : <div className="empty-inline">Nessuna bozza in attesa. Incolla un testo per farne nascere una.</div>}
      </div>
    </div>
  );
}

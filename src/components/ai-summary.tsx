"use client";

import { useState, useTransition } from "react";
import { generateWeekSummary, type SummaryResult } from "@/app/actions/inbox";

type SummaryOk = Extract<SummaryResult, { ok: true }>;

// Il riepilogo narrativo non classifica e non giudica: mette in parole ciò che i numeri mostrano.
export function AiSummary({ configured }: { configured: boolean }) {
  const [result, setResult] = useState<SummaryOk | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run() {
    setError("");
    startTransition(async () => {
      const outcome = await generateWeekSummary();
      if (outcome.ok) setResult(outcome);
      else setError(outcome.error);
    });
  }

  return (
    <section className="summary-block">
      <div className="cb-card-head">
        <div><h2>Riepilogo narrativo</h2><p>Il Care Orchestrator legge solo dati aggregati e anonimi: mai nomi, mai giudizi.</p></div>
        <button className="primary-button small-button" type="button" onClick={run} disabled={pending || !configured}>
          {pending ? "Scrivo…" : "Genera il riepilogo"}
        </button>
      </div>

      {!configured && <div className="empty-inline">Il Care Orchestrator non è configurato: imposta OPENROUTER_API_KEY sul server per generare il riepilogo.</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}

      {result && (
        <div>
          <h3 className="summary-headline">{result.headline}</h3>

          <div className="summary-section">
            <h3>Cosa è successo</h3>
            <ul>{result.highlights.map((entry, index) => <li key={index}>{entry}</li>)}</ul>
          </div>

          {result.imbalances.length > 0 && (
            <div className="summary-section">
              <h3>Squilibri da guardare</h3>
              <ul>{result.imbalances.map((entry, index) => <li key={index}>{entry}</li>)}</ul>
            </div>
          )}

          {result.invisibleWork.length > 0 && (
            <div className="summary-section invisible">
              <h3>Lavoro invisibile</h3>
              <ul>{result.invisibleWork.map((entry, index) => <li key={index}>{entry}</li>)}</ul>
            </div>
          )}

          {result.suggestions.length > 0 && (
            <div className="summary-section">
              <h3>Passi concreti</h3>
              <ul>{result.suggestions.map((entry, index) => <li key={index}>{entry}</li>)}</ul>
            </div>
          )}

          <p className="muted-note" style={{ marginTop: 12 }}>Confidenza del modello: {Math.round(result.confidence * 100)}% · nomi anonimizzati: {result.redactions}. Nessun dato è stato salvato oltre al riepilogo stesso.</p>
        </div>
      )}
    </section>
  );
}

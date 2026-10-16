"use client";

import { useState, useTransition } from "react";
import { deleteScenario, saveScenario } from "@/app/actions/scenarios";
import { formatMinutes } from "@/lib/workload";
import type { ScenarioVariantResult } from "@/lib/scenarios";

export type SavedScenario = {
  id: string;
  name: string;
  question: string | null;
  createdAtLabel: string;
  variantCount: number;
};

// La scenario room non elegge un vincitore: mostra varianti da confrontare e lascia la scelta alle persone.
export function ScenarioRoom({ variants, saved, canSave }: { variants: ScenarioVariantResult[]; saved: SavedScenario[]; canSave: boolean }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save(formData: FormData) {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await saveScenario(formData);
        setMessage("Scenario salvato: le varianti sono state congelate per essere rilette con calma.");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile salvare lo scenario.");
      }
    });
  }

  function remove(scenarioId: string) {
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.set("scenarioId", scenarioId);
    startTransition(async () => {
      try {
        await deleteScenario(formData);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile eliminare lo scenario.");
      }
    });
  }

  return (
    <div>
      <div className="scenario-grid">
        {variants.map((variant) => {
          const max = Math.max(1, ...variant.perMember.map((member) => member.minutes));
          return (
            <article className={`scenario-card ${variant.kind === "current" ? "current" : ""}`} key={variant.label}>
              <h3>{variant.label}</h3>
              <p>{variant.summary}</p>
              <div className="scenario-metrics">
                <div className="scenario-metric"><strong>{formatMinutes(variant.metrics.totalMinutes)}</strong><span>Carico totale</span></div>
                <div className="scenario-metric"><strong>{variant.metrics.concentration}%</strong><span>Concentrazione</span></div>
                <div className="scenario-metric"><strong>{variant.metrics.estimatedStress}</strong><span>Stress stimato</span></div>
                <div className="scenario-metric"><strong>{variant.metrics.renunciations}</strong><span>Rinunce</span></div>
                <div className="scenario-metric"><strong>{variant.metrics.uncoveredCount}</strong><span>Senza copertura</span></div>
                <div className="scenario-metric"><strong>{formatMinutes(variant.metrics.spreadMinutes)}</strong><span>Differenza tra estremi</span></div>
              </div>
              <div className="scenario-bars">
                {variant.perMember.map((member) => (
                  <div className="scenario-bar-row" key={member.userId}>
                    <span className="scenario-bar-name">{member.name}</span>
                    <span className="meter"><span className="meter-fill" style={{ width: `${(member.minutes / max) * 100}%`, background: member.color }} /></span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <p className="scenario-note">
        Nessuna di queste varianti è "la migliore". Ogni scelta ha un costo e un beneficio: ridurre il carico di una persona può aumentare le rinunce,
        il supporto esterno ha un costo, proteggere chi è in difficoltà può lasciare scoperto qualcosa. Parenthesys rende visibili le conseguenze; la decisione resta a voi.
      </p>

      {canSave && (
        <div className="split-2" style={{ marginTop: 16 }}>
          <section className="panel">
            <div className="panel-heading"><div><h2>Salva questo confronto</h2><p>Congela le varianti per rileggerle più tardi o discuterne insieme.</p></div></div>
            <form action={save}>
              <label className="field-label">Nome dello scenario<input name="name" required minLength={2} maxLength={120} placeholder="Es. Settimana con il turno di notte" /></label>
              <label className="field-label">Domanda che vi ponete<textarea name="question" maxLength={300} placeholder="Es. Come copriamo la settimana senza scaricare tutto su una persona?" /></label>
              {error && <div className="error-banner" role="alert">{error}</div>}
              {message && <div className="success-banner" role="status">{message}</div>}
              <div className="form-footer"><button className="primary-button small-button" type="submit" disabled={pending}>{pending ? "Salvo…" : "Salva scenario"}</button></div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><h2>Scenari salvati</h2><p>Un archivio delle decisioni già esplorate.</p></div><span className="count-badge">{saved.length}</span></div>
            {saved.length ? saved.map((scenario) => (
              <div className="inbox-item" key={scenario.id}>
                <div className="inbox-item-head"><strong>{scenario.name}</strong><span className="chip chip-neutral">{scenario.variantCount} varianti</span></div>
                {scenario.question && <p className="muted-note">{scenario.question}</p>}
                <div className="inbox-item-head" style={{ marginTop: 9, marginBottom: 0 }}>
                  <span className="audit-time">{scenario.createdAtLabel}</span>
                  <button className="danger-button small-button" type="button" style={{ marginLeft: "auto" }} disabled={pending} onClick={() => remove(scenario.id)}>Elimina</button>
                </div>
              </div>
            )) : <div className="empty-inline">Non hai ancora salvato nessuno scenario.</div>}
          </section>
        </div>
      )}
    </div>
  );
}

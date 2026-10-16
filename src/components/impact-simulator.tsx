"use client";

import { useState, useTransition } from "react";
import { applyAlternative, assignActivity, previewAssignment, type AssignmentPreview } from "@/app/actions/activities";
import { CATEGORY_META } from "@/lib/categories";
import { CAPACITY_META, Capacity, Category, FLEXIBILITY_META, Flexibility } from "@/lib/domain";
import { formatMinutes } from "@/lib/workload";
import type { AlternativeKind } from "@/lib/equity";

export type SimActivity = {
  id: string;
  title: string;
  category: Category;
  estimatedMinutes: number;
  preparationMinutes: number;
  travelMinutes: number;
  coordinationMinutes: number;
  flexibility: Flexibility;
  rotates: boolean;
  assignedToName: string | null;
};

// Il simulatore mostra le conseguenze di una scelta, senza mai scegliere al posto del nucleo.
export function ImpactSimulator({ activities, canAssign }: { activities: SimActivity[]; canAssign: boolean }) {
  const [selectedId, setSelectedId] = useState(activities[0]?.id ?? "");
  const [duration, setDuration] = useState<number>(activities[0]?.estimatedMinutes ?? 30);
  const [prep, setPrep] = useState<number>(activities[0]?.preparationMinutes ?? 0);
  const [travel, setTravel] = useState<number>(activities[0]?.travelMinutes ?? 0);
  const [preview, setPreview] = useState<AssignmentPreview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const selected = activities.find((activity) => activity.id === selectedId) ?? null;

  function choose(id: string) {
    setSelectedId(id);
    const activity = activities.find((entry) => entry.id === id);
    if (activity) {
      setDuration(activity.estimatedMinutes || 30);
      setPrep(activity.preparationMinutes || 0);
      setTravel(activity.travelMinutes || 0);
    }
    setPreview(null);
    setMessage("");
  }

  function simulate() {
    if (!selected) return;
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.set("title", selected.title);
    formData.set("category", selected.category);
    formData.set("estimatedMinutes", String(duration));
    formData.set("preparationMinutes", String(prep));
    formData.set("travelMinutes", String(travel));
    formData.set("coordinationMinutes", String(selected.coordinationMinutes));
    formData.set("flexibility", selected.flexibility);
    formData.set("rotates", selected.rotates ? "true" : "false");
    startTransition(async () => {
      try {
        setPreview(await previewAssignment(formData));
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile calcolare l'impatto.");
      }
    });
  }

  function assign(assigneeId: string, explanation: string) {
    if (!selected) return;
    setError("");
    const formData = new FormData();
    formData.set("activityId", selected.id);
    formData.set("assigneeId", assigneeId);
    formData.set("source", "equity");
    formData.set("explanation", explanation);
    startTransition(async () => {
      try {
        await assignActivity(formData);
        setMessage("Proposta inviata. La persona può accettare, chiedere supporto o declinare.");
        setPreview(null);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile assegnare l'attività.");
      }
    });
  }

  function alternative(kind: AlternativeKind) {
    if (!selected) return;
    setError("");
    const formData = new FormData();
    formData.set("activityId", selected.id);
    formData.set("kind", kind);
    startTransition(async () => {
      try {
        await applyAlternative(formData);
        setMessage(kind === "rotate" ? "Rotazione applicata: il turno cambia persona." : "Richiesta di supporto aperta per il nucleo.");
        setPreview(null);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile applicare l'alternativa.");
      }
    });
  }

  if (!activities.length) {
    return <div className="empty-inline">Non ci sono ancora attività su cui ragionare. Creane una nuova dal pannello Attività.</div>;
  }

  return (
    <div>
      <div className="split-2">
        <label className="field-label">Attività da valutare
          <select value={selectedId} onChange={(event) => choose(event.target.value)}>
            {activities.map((activity) => (
              <option value={activity.id} key={activity.id}>
                {activity.title} · {CATEGORY_META[activity.category]?.label ?? activity.category}{activity.assignedToName ? ` · ora con ${activity.assignedToName}` : " · senza responsabile"}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label className="field-label">Durata (min)<input type="number" min={0} max={1440} step={5} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
          <label className="field-label">Preparazione<input type="number" min={0} max={240} step={5} value={prep} onChange={(event) => setPrep(Number(event.target.value))} /></label>
          <label className="field-label">Spostamento<input type="number" min={0} max={240} step={5} value={travel} onChange={(event) => setTravel(Number(event.target.value))} /></label>
        </div>
      </div>

      <div className="cb-hello-actions" style={{ margin: "4px 0 14px" }}>
        <button className="primary-button small-button" type="button" onClick={simulate} disabled={pending}>
          {pending ? "Calcolo…" : "Simula l'impatto"}
        </button>
        {selected && <span className="muted-note" style={{ alignSelf: "center" }}>{FLEXIBILITY_META[selected.flexibility]?.label ?? selected.flexibility}</span>}
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {message && <div className="success-banner" role="status">{message}</div>}

      {preview && (
        <div>
          <p className="muted-note">
            Stima: {formatMinutes(preview.durationMinutes)} di lavoro complessivo. Nessuna decisione è stata presa: stai guardando delle possibilità.
          </p>

          {preview.unassigned && (
            <div className="signal warn" style={{ marginTop: 10 }}>
              <span className="signal-icon">✳</span>
              <div><strong>Nessuna persona è pienamente disponibile</strong><p>Serve una decisione esplicita del nucleo, oppure un supporto esterno.</p></div>
            </div>
          )}

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {preview.options.map((option) => (
              <article className={`equity-option ${preview.recommendedUserId === option.userId ? "recommended" : ""}`} key={option.userId}>
                <div className="equity-head">
                  <span className="person-avatar" style={{ background: option.color }}>{option.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                  <div>
                    <span className="person-name">{option.name}</span>
                    <span className="person-sub"><span className={`capacity-chip capacity-${option.capacity}`}>{CAPACITY_META[option.capacity as Capacity].label}</span></span>
                  </div>
                  <span className="equity-score">{option.score}</span>
                </div>
                {option.reasons.length > 0 && <ul className="equity-reasons">{option.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
                {option.tradeoffs.length > 0 && <ul className="equity-tradeoffs">{option.tradeoffs.map((tradeoff, index) => <li key={index}>{tradeoff}</li>)}</ul>}
                {option.blockers.length > 0 && <ul className="equity-blockers">{option.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul>}
                {canAssign && option.eligible && (
                  <div className="cb-hello-actions" style={{ marginTop: 10 }}>
                    <button className="primary-button small-button" type="button" disabled={pending} onClick={() => assign(option.userId, option.reasons[0] ?? "")}>
                      Proponi a {option.name.split(/\s+/)[0]}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>

          <div className="summary-section">
            <h3>Conseguenze sulla distribuzione</h3>
            <ul>
              {preview.impacts.map((impact) => (
                <li key={impact.userId}>{impact.narrative}{impact.becomesLessBalanced ? " (meno equilibrata)" : ""}</li>
              ))}
            </ul>
          </div>

          <div className="summary-section">
            <h3>Altre mosse possibili</h3>
            <div className="alternatives">
              {preview.alternatives.map((option) => (
                <div className="alternative" key={option.kind}>
                  <strong>{option.title}</strong>
                  <p>{option.detail}</p>
                  {canAssign && option.kind === "rotate" && <button className="outline-button small-button" type="button" style={{ marginTop: 8 }} disabled={pending} onClick={() => alternative("rotate")}>Applica rotazione</button>}
                  {canAssign && option.kind === "support" && <button className="outline-button small-button" type="button" style={{ marginTop: 8 }} disabled={pending} onClick={() => alternative("support")}>Apri richiesta di aiuto</button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

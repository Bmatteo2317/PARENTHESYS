"use client";

import { TaskStatus } from "@prisma/client";
import { useState } from "react";
import { createTask, toggleTask } from "@/app/actions/tasks";

type TaskView = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string;
  points: number;
  assignedToId: string;
  assignedTo: { id: string; name: string; avatarColor: string };
};

export function TaskBoard({ tasks, people, canManage }: { tasks: TaskView[]; people: { id: string; name: string }[]; canManage: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [pendingId, setPendingId] = useState("");

  async function saveTask(formData: FormData) {
    setFormError("");
    try {
      await createTask(formData);
      setShowForm(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Non è stato possibile creare l’attività.");
    }
  }

  async function changeTask(formData: FormData, taskId: string) {
    setPendingId(taskId);
    try {
      await toggleTask(formData);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Non è stato possibile aggiornare l’attività.");
    } finally {
      setPendingId("");
    }
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <>
      {canManage && <section className="panel">
        <div className="panel-heading"><div><h2>Assegna una nuova attività</h2><p>Spesa, compiti, preparativi o piccole cose di casa.</p></div><button className="outline-button small-button" type="button" onClick={() => setShowForm(!showForm)}>{showForm ? "Chiudi" : "＋ Nuova attività"}</button></div>
        {showForm && <form className="task-create-form" action={saveTask}>
          <label className="field-label">Attività<input name="title" required minLength={2} maxLength={120} placeholder="Es. Preparare lo zaino per domani" /></label>
          <div className="form-row"><label className="field-label">Assegna a<select name="assignedToId" required defaultValue=""><option value="" disabled>Seleziona un familiare</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label><label className="field-label">Entro il<input name="dueDate" type="date" required defaultValue={todayKey} /></label><label className="field-label">Punti<input name="points" type="number" min={0} max={100} defaultValue={0} /></label></div>
          {formError && <div className="error-banner" role="alert">{formError}</div>}
          <button className="primary-button small-button" type="submit">Crea attività</button>
        </form>}
      </section>}
      <section className="panel task-panel">
        <div className="panel-heading"><div><h2>Le attività della famiglia</h2><p>Un piccolo passo alla volta, ognuno secondo le proprie possibilità.</p></div></div>
        {formError && !showForm && <div className="error-banner" role="alert">{formError}</div>}
        {!tasks.length ? <div className="empty-task"><span>✳</span><strong>Ancora tutto da organizzare.</strong><p>Quando aggiungerai un’attività, la troverai qui.</p></div> : <div className="task-list">{tasks.map((task) => {
          const completed = task.status === "COMPLETED";
          const due = new Date(task.dueDate);
          const dateLabel = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(due);
          const overdue = !completed && task.dueDate.slice(0, 10) < todayKey;
          return <article className={`task-card ${completed ? "completed" : ""}`} key={task.id}>
            <form action={async (formData) => changeTask(formData, task.id)}><input type="hidden" name="id" value={task.id} /><button type="submit" className="task-check" aria-label={completed ? "Segna come da fare" : "Segna come completata"} disabled={pendingId === task.id}>{completed ? "✓" : ""}</button></form>
            <div className="task-content"><div className="task-title">{task.title}</div>{task.description && <p className="task-description">{task.description}</p>}<div className="task-meta"><span>Per {task.assignedTo.name}</span><span className={overdue ? "overdue" : ""}>{overdue ? "In ritardo · " : "Entro il "}{dateLabel}</span></div></div>
            {task.points > 0 && <span className="points-pill">✦ {task.points} pt</span>}
          </article>;
        })}</div>}
      </section>
    </>
  );
}

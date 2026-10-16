"use client";

import { useState } from "react";
import { addKid, linkMemberToKid, updateMemberRole, updateWorkSchedule } from "@/app/actions/family";

const weekdays = [
  { value: "1", label: "Lun" },
  { value: "2", label: "Mar" },
  { value: "3", label: "Mer" },
  { value: "4", label: "Gio" },
  { value: "5", label: "Ven" },
];

export function AddKidForm() {
  return (
    <form className="compact-form" action={addKid}>
      <div className="form-row"><label className="field-label">Nome<input name="name" required minLength={2} maxLength={60} placeholder="Nome del profilo" /></label><label className="field-label">Data di nascita<input type="date" name="birthDate" /></label><input type="hidden" name="avatarColor" value="#cf7d9c" /></div>
      <button className="primary-button small-button" type="submit">Aggiungi profilo</button>
    </form>
  );
}

export function MemberRoleForm({ member }: { member: { id: string; roleName: string; permission: "ADMIN" | "HELPER" | "MEMBER" } }) {
  return (
    <form className="member-role-form" action={updateMemberRole}>
      <input type="hidden" name="memberId" value={member.id} />
      <input className="role-input" name="roleName" aria-label="Nome in famiglia" defaultValue={member.roleName} maxLength={40} required />
      <select className="role-select" name="permission" aria-label="Permesso del familiare" defaultValue={member.permission}>
        <option value="ADMIN">Amministratore</option><option value="HELPER">Aiuto</option><option value="MEMBER">Membro</option>
      </select>
      <button className="outline-button small-button" type="submit">Salva</button>
    </form>
  );
}

export function LinkKidForm({ memberId, kidProfileId, kids }: { memberId: string; kidProfileId: string | null; kids: { id: string; name: string }[] }) {
  if (!kids.length) return null;
  return (
    <form action={linkMemberToKid}>
      <input type="hidden" name="memberId" value={memberId} />
      <select className="role-select kid-link-select" name="kidProfileId" aria-label="Collega account al profilo del figlio" defaultValue={kidProfileId ?? ""}>
        <option value="">Nessun profilo figlio</option>
        {kids.map((kid) => <option value={kid.id} key={kid.id}>{kid.name}</option>)}
      </select>
      <button className="outline-button small-button" type="submit">Collega</button>
    </form>
  );
}

export function WorkScheduleForm({ schedule }: { schedule: unknown }) {
  const [saved, setSaved] = useState(false);
  const unavailable = schedule && typeof schedule === "object" && "unavailable" in schedule && Array.isArray(schedule.unavailable)
    ? schedule.unavailable as { day: number; start: string; end: string }[]
    : [];
  const current = unavailable[0];
  const activeDays = new Set(unavailable.map((item) => String(item.day)));

  return (
    <form className="schedule-form" action={async (formData) => { await updateWorkSchedule(formData); setSaved(true); }}>
      <div className="schedule-days" aria-label="Giorni lavorativi">
        {weekdays.map((day) => <label className="day-choice" key={day.value}><input type="checkbox" name="day" value={day.value} defaultChecked={activeDays.has(day.value)} /><span>{day.label}</span></label>)}
      </div>
      <div className="schedule-hours">
        <label className="field-label">Dalle<input type="time" name="start" required defaultValue={current?.start ?? "09:00"} /></label>
        <label className="field-label">Alle<input type="time" name="end" required defaultValue={current?.end ?? "17:00"} /></label>
        <button className="outline-button small-button" type="submit">Salva turni</button>
      </div>
      {saved && <span className="schedule-saved" role="status">Orari aggiornati.</span>}
    </form>
  );
}

export function CopyInviteButton({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="outline-button small-button" type="button" onClick={async () => {
      try {
        await navigator.clipboard.writeText(inviteCode);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        setCopied(false);
      }
    }}>{copied ? "Copiato!" : "Copia codice"}</button>
  );
}

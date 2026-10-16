"use client";

import { useState, useTransition } from "react";
import { createInvitation, revokeInvitation, updateMemberAccess } from "@/app/actions/members";
import { PERMISSION_META, PERMISSIONS, ROLE_META, RoleKey } from "@/lib/domain";

export type AccessMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  color: string;
  roleKey: RoleKey;
  roleName: string;
  permission: "ADMIN" | "HELPER" | "MEMBER";
  granted: string[];
  isMe: boolean;
};

export type MemberInvitation = {
  id: string;
  label: string | null;
  roleKey: RoleKey;
  shortCode: string;
  roleLabel: string;
  usesLabel: string;
  expiresLabel: string;
  expired: boolean;
};

const roleKeys = Object.keys(ROLE_META) as RoleKey[];

// Il ruolo descrive cosa una persona può fare, mai chi è. I permessi si rifiniscono uno per uno.
export function AccessManager({ members, invitations }: { members: AccessMember[]; invitations: MemberInvitation[] }) {
  const [selectedId, setSelectedId] = useState(members[0]?.id ?? "");
  const [roleKey, setRoleKey] = useState<RoleKey>(members[0]?.roleKey ?? "member");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = members.find((member) => member.id === selectedId) ?? null;

  function pickMember(id: string) {
    setSelectedId(id);
    const member = members.find((entry) => entry.id === id);
    if (member) setRoleKey(member.roleKey);
    setFeedback("");
    setError("");
  }

  function saveAccess(formData: FormData) {
    setFeedback("");
    setError("");
    startTransition(async () => {
      try {
        await updateMemberAccess(formData);
        setFeedback("Accesso aggiornato.");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile aggiornare l'accesso.");
      }
    });
  }

  function invite(formData: FormData) {
    setFeedback("");
    setError("");
    startTransition(async () => {
      try {
        const result = await createInvitation(formData);
        setFeedback(`Invito creato. Codice: ${result.shortCode}`);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile creare l'invito.");
      }
    });
  }

  function revoke(invitationId: string) {
    setFeedback("");
    setError("");
    const formData = new FormData();
    formData.set("invitationId", invitationId);
    startTransition(async () => {
      try {
        await revokeInvitation(formData);
        setFeedback("Invito revocato.");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Non è stato possibile revocare l'invito.");
      }
    });
  }

  const groups = [...new Set(PERMISSIONS.map((key) => PERMISSION_META[key].group))];

  return (
    <div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {feedback && <div className="success-banner" role="status">{feedback}</div>}

      <div className="pill-row" style={{ marginBottom: 14 }}>
        {members.map((member) => (
          <button className={`chip chip-btn ${member.id === selectedId ? "chip-purple" : "chip-neutral"}`} type="button" key={member.id} onClick={() => pickMember(member.id)}>
            <span className="chip-dot" style={{ background: member.color }} />{member.name}{member.isMe ? " (tu)" : ""}
          </button>
        ))}
      </div>

      {selected && (
        <form action={saveAccess}>
          <input type="hidden" name="memberId" value={selected.id} />
          <input type="hidden" name="roleKey" value={roleKey} />

          <div className="split-2">
            <label className="field-label">Nome nel nucleo
              <input name="roleName" defaultValue={selected.roleName} maxLength={40} required />
            </label>
            <label className="field-label">Livello di accesso storico
              <select name="permission" defaultValue={selected.permission}>
                <option value="ADMIN">Amministrazione</option>
                <option value="HELPER">Coordinamento</option>
                <option value="MEMBER">Accesso limitato</option>
              </select>
            </label>
          </div>

          <div className="role-grid" style={{ marginBottom: 13 }}>
            {roleKeys.map((key) => (
              <button className={`role-card ${roleKey === key ? "active" : ""}`} type="button" key={key} onClick={() => setRoleKey(key)}>
                <strong>{ROLE_META[key].label}</strong>
                <p>{ROLE_META[key].description}</p>
              </button>
            ))}
          </div>

          {groups.map((group) => (
            <div className="perm-group" key={group}>
              <h3>{group}</h3>
              {PERMISSIONS.filter((key) => PERMISSION_META[key].group === group).map((key) => (
                <label className="perm-row" key={key}>
                  <input
                    type="checkbox"
                    name="permission"
                    value={key}
                    defaultChecked={selected.granted.includes(key)}
                    key={`${selected.id}-${key}`}
                  />
                  <span>{PERMISSION_META[key].label}{PERMISSION_META[key].sensitive ? <span className="sensitive"> · sensibile</span> : ""}</span>
                </label>
              ))}
            </div>
          ))}

          <div className="form-footer">
            <button className="primary-button small-button" type="submit" disabled={pending}>{pending ? "Salvo…" : "Salva accesso"}</button>
          </div>
        </form>
      )}

      <div className="kid-add-wrap" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><h2>Inviti attivi</h2><p>Ogni invito dichiara in anticipo ruolo e accesso: chi entra sa cosa troverà.</p></div></div>

        <form className="compact-form" action={invite}>
          <div className="form-row">
            <label className="field-label">Etichetta<input name="label" maxLength={80} placeholder="Es. Nonna, per il martedì" /></label>
            <label className="field-label">Ruolo
              <select name="roleKey" defaultValue="caregiver">{roleKeys.map((key) => <option value={key} key={key}>{ROLE_META[key].label}</option>)}</select>
            </label>
            <label className="field-label">Livello
              <select name="permission" defaultValue="HELPER">
                <option value="ADMIN">Amministrazione</option>
                <option value="HELPER">Coordinamento</option>
                <option value="MEMBER">Accesso limitato</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label className="field-label">Utilizzi massimi<input type="number" name="maxUses" min={1} max={20} defaultValue={1} /></label>
            <label className="field-label">Scade tra (giorni)<input type="number" name="expiresInDays" min={1} max={90} defaultValue={14} /></label>
            <div style={{ alignSelf: "flex-end" }}><button className="primary-button small-button" type="submit" disabled={pending}>Crea invito</button></div>
          </div>
        </form>

        <div style={{ marginTop: 13 }}>
          {invitations.length ? invitations.map((invitation) => (
            <div className="member-row" key={invitation.id} style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,.9fr) minmax(0,.9fr) auto" }}>
              <div className="member-info"><strong>{invitation.label ?? "Invito senza etichetta"}</strong><small>{invitation.roleLabel} · codice {invitation.shortCode}</small></div>
              <span className="role-pill">{invitation.usesLabel}</span>
              <span className={`chip ${invitation.expired ? "chip-danger" : "chip-ok"}`}>{invitation.expiresLabel}</span>
              <button className="danger-button small-button" type="button" disabled={pending} onClick={() => revoke(invitation.id)}>Revoca</button>
            </div>
          )) : <div className="empty-inline">Nessun invito attivo.</div>}
        </div>
      </div>
    </div>
  );
}

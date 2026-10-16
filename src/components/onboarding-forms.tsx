"use client";

import { useActionState } from "react";
import { createFamily, joinFamily, type FamilyActionState } from "@/app/actions/family";

const initialState: FamilyActionState = {};

export function CreateFamilyForm() {
  const [state, action, pending] = useActionState(createFamily, initialState);
  return (
    <form className="auth-form" action={action}>
      {state.error && <div className="error-banner" role="alert">{state.error}</div>}
      <label className="field-label">Come si chiama la vostra famiglia?<input name="familyName" required minLength={2} maxLength={80} placeholder="Es. Casa Rossi" /></label>
      <label className="field-label">Come ti chiami in famiglia?<input name="roleName" required minLength={2} maxLength={40} placeholder="Es. Tutore, Mamma 1, Papà 2…" /></label>
      <button className="primary-button" type="submit" disabled={pending}>{pending ? "Creo il vostro spazio…" : "Crea lo spazio famiglia"}</button>
    </form>
  );
}

export function JoinFamilyForm() {
  const [state, action, pending] = useActionState(joinFamily, initialState);
  return (
    <form className="auth-form" action={action}>
      {state.error && <div className="error-banner" role="alert">{state.error}</div>}
      <label className="field-label">Codice invito<input name="inviteCode" required minLength={6} maxLength={20} autoCapitalize="characters" placeholder="ES. A1B2C3D4" /></label>
      <label className="field-label">Come ti chiami in famiglia?<input name="roleName" required minLength={2} maxLength={40} placeholder="Es. Nonna, Babysitter, Papà 2…" /></label>
      <label className="field-label">Il tuo accesso<select name="permission" defaultValue="HELPER"><option value="HELPER">Rete di supporto — accompagna e aiuta</option><option value="MEMBER">Membro — visualizza e completa attività</option></select></label>
      <button className="primary-button" type="submit" disabled={pending}>{pending ? "Verifico il codice…" : "Unisciti alla famiglia"}</button>
    </form>
  );
}

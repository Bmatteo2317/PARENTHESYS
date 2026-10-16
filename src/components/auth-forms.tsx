"use client";

import { useActionState } from "react";
import { loginUser, registerUser, type LoginState, type RegistrationState } from "@/app/actions/auth";

const initialLoginState: LoginState = {};
const initialRegistrationState: RegistrationState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginUser, initialLoginState);

  return (
    <form className="auth-form" action={action}>
      {state.error && <div className="error-banner" role="alert">{state.error}</div>}
      <label className="field-label">Email<input name="email" type="email" autoComplete="email" required placeholder="tu@email.it" /></label>
      <label className="field-label">Password<input name="password" type="password" autoComplete="current-password" required placeholder="La tua password" /></label>
      <button className="primary-button" type="submit" disabled={pending}>{pending ? "Accesso in corso…" : "Accedi al tuo spazio"}</button>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerUser, initialRegistrationState);

  return (
    <form className="auth-form" action={action}>
      {state.error && <div className="error-banner" role="alert">{state.error}</div>}
      <label className="field-label">Come ti chiami?<input name="name" autoComplete="name" required minLength={2} maxLength={60} placeholder="Il tuo nome" /></label>
      <label className="field-label">Email<input name="email" type="email" autoComplete="email" required placeholder="tu@email.it" /></label>
      <label className="field-label">Password<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required placeholder="Almeno 8 caratteri" /></label>
      <button className="primary-button" type="submit" disabled={pending}>{pending ? "Creazione account…" : "Crea il tuo account"}</button>
    </form>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Brand } from "@/components/brand";
import { RegisterForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/onboarding");

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <h1>Un po’ più<br />di tempo per voi.</h1>
          <p>Crea il tuo spazio condiviso. Invita chi vuoi: genitori, figli, nonni, amici e persone di supporto.</p>
          <blockquote className="story-quote">
            Una famiglia non è un modello da spuntare. È la rete di persone che si prende cura l’una dell’altra.
            <strong>Parenthesys — insieme, a modo vostro.</strong>
          </blockquote>
        </div>
        <div className="auth-story-footer">Il tuo spazio è privato e accessibile solo alle persone invitate.</div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-brand-mobile"><Brand /></div>
          <h2>Cominciamo da te.</h2>
          <p className="auth-subtitle">Crea un account per organizzare la tua rete familiare.</p>
          <RegisterForm />
          <div className="auth-links">Hai già un account? <Link href="/login">Accedi</Link></div>
        </div>
      </section>
    </main>
  );
}

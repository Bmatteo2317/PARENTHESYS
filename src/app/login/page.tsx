import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/auth-forms";
import { SocialSignIn } from "@/components/social-sign-in";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/calendar");
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <h1>La famiglia,<br />in sincronia.</h1>
          <p>Il tempo insieme vale di più. Organizza impegni, passaggi e piccoli traguardi in un unico spazio condiviso.</p>
          <blockquote className="story-quote">
            «Non serve fare tutto da soli. Basta sapere chi c’è, e quando.»
            <strong>La vita di famiglia, un po’ più leggera.</strong>
          </blockquote>
        </div>
        <div className="auth-story-footer">Uno spazio privato, costruito attorno alla tua famiglia.</div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-brand-mobile"><Brand /></div>
          <h2>Che bello rivederti.</h2>
          <p className="auth-subtitle">Accedi al tuo spazio famiglia per ritrovare i piani di tutti.</p>
          {params.registered === "1" && <div className="success-banner">Account creato. Ora puoi accedere e creare o raggiungere la tua famiglia.</div>}
          <LoginForm />
          <SocialSignIn />
          <div className="auth-links">Non hai ancora un account? <Link href="/register">Creane uno</Link></div>
        </div>
      </section>
    </main>
  );
}

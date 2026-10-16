import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Brand } from "@/components/brand";
import { CreateFamilyForm, JoinFamilyForm } from "@/components/onboarding-forms";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [membership] = await db`SELECT "id" FROM "FamilyMember" WHERE "userId" = ${session.user.id} LIMIT 1`;
  if (membership) redirect("/careboard");

  return (
    <main className="onboarding-shell">
      <div className="onboarding-card">
        <Brand />
        <div className="onboarding-intro">
          <span className="modal-eyebrow">IL VOSTRO SPAZIO, A MODO VOSTRO</span>
          <h1>La famiglia è fatta di chi c’è.</h1>
          <p>Puoi creare il vostro spazio privato o raggiungere una famiglia che ti ha già invitato. Non esiste un modello giusto: scegli il vostro.</p>
        </div>
        <div className="onboarding-columns">
          <section>
            <h2>Inizia un nuovo spazio</h2>
            <p>Diventerai amministratore e potrai invitare le persone della tua rete.</p>
            <CreateFamilyForm />
          </section>
          <section>
            <h2>Hai già un invito?</h2>
            <p>Inserisci il codice che ti ha condiviso la tua famiglia.</p>
            <JoinFamilyForm />
          </section>
        </div>
      </div>
    </main>
  );
}

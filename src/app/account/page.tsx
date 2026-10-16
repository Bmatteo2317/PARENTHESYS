import { AppPage } from "@/components/app-page";
import { updateAccount } from "@/app/actions/family";
import { getFamilyContext } from "@/lib/family";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const context = await getFamilyContext();
  const [user] = await db`SELECT "name", "email", "phone", "avatarColor" FROM "User" WHERE "id" = ${context.userId} LIMIT 1`;
  return (
    <AppPage>
      <div className="content-page account-page">
        <div className="page-heading"><div><span className="eyebrow">SPAZIO PERSONALE</span><h1>Il mio account</h1><p>Personalizza come compari nel calendario della tua famiglia.</p></div><span className="role-pill">{context.membership.roleName}</span></div>
        <section className="account-hero panel"><div className="account-hero-copy"><span className="account-avatar" style={{ background: user?.avatarColor ?? "#7855dc" }}>{user?.name?.trim().split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase() ?? "P"}</span><div><strong>Il tuo profilo condiviso</strong><p>Nome, colore e cellulare aiutano tutti a capire chi è disponibile a prendere in carico un impegno.</p></div></div><span className="account-status"><span className="sync-dot" />Sincronizzato</span></section>
        <section className="panel"><div className="panel-heading"><div><h2>Informazioni personali</h2><p>Questi dati sono visibili solo ai membri della tua famiglia.</p></div></div>
          <form className="account-form" action={updateAccount}>
            <div className="form-row"><label className="field-label">Nome visualizzato<input name="name" defaultValue={user?.name ?? ""} required minLength={2} maxLength={80} /></label><label className="field-label">Colore calendario<input className="color-input" type="color" name="avatarColor" defaultValue={user?.avatarColor ?? "#7855dc"} /></label></div>
            <label className="field-label">Email<input value={user?.email ?? ""} disabled readOnly /></label>
            <label className="field-label">Cellulare<input name="phone" type="tel" defaultValue={user?.phone ?? ""} placeholder="+39 333 123 4567" /></label>
            <div className="account-tip"><strong>Figli dai 14 anni</strong><span>Se un figlio ha un cellulare e un account personale, collegalo dalla sezione La famiglia: potrà aggiungere e aggiornare i propri impegni.</span></div>
            <div className="form-footer"><button className="primary-button" type="submit">Salva personalizzazione</button></div>
          </form>
        </section>
      </div>
    </AppPage>
  );
}

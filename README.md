# PARENTHESYS

Spazio condiviso per calendari, accompagnamenti e attività familiari. La struttura si adatta a famiglie monoparentali, omogenitoriali, allargate e a reti di supporto.

## Stack

- Next.js App Router, React e TypeScript
- PostgreSQL su Neon tramite driver serverless e query SQL
- Auth.js: email/password; Google e Apple sono opzionali
- Vercel per l’hosting

## Sviluppo locale

Richiede Node.js 20.9 o successivo.

1. Installa le dipendenze: `npm install`.
2. Copia `.env.example` in `.env`.
3. Imposta `DATABASE_URL` usando la stringa di connessione Neon; `AUTH_SECRET` è consigliata per l’autenticazione in produzione.
4. Inizializza o aggiorna il database: `npm run db:migrate`.
5. Avvia l’app: `npm run dev`.

L’app e le migrazioni usano la sola variabile `DATABASE_URL` e il driver serverless Neon; non è richiesto un ORM né un secondo URL diretto. Le migrazioni SQL versionate si trovano in `database/migrations`.

I comandi `npm run lint`, `npm run typecheck` e `npm run build` verificano codice, tipi e produzione.

## Deploy su Vercel e Neon

1. Crea un progetto PostgreSQL su Neon e configura `DATABASE_URL` e `AUTH_SECRET` in Vercel. Genera un nuovo segreto casuale per ogni ambiente.
2. Prima del primo deploy, applica lo schema al database di destinazione con `npm run db:migrate`.
3. Collega il repository a Vercel. Lo script di build compila Next.js; non richiede accesso al database.
4. Se abiliti Google o Apple, aggiungi `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` o `AUTH_APPLE_ID` / `AUTH_APPLE_SECRET` e configura il callback OAuth `https://<dominio>/api/auth/callback/<provider>`.

Non inserire credenziali nel repository. `.env.example` contiene solo valori segnaposto.

## Funzionalità incluse

- Registrazione, accesso con password cifrata e OAuth facoltativo.
- Creazione di una famiglia oppure accesso tramite codice invito.
- Ruoli amministratore, rete di supporto e membro; i profili dei figli possono essere collegati a un account.
- Calendario mese, settimana, giorno, agenda e family timeline affiancata.
- Creazione, modifica, cancellazione, spostamento, filtri e verifica delle sovrapposizioni degli impegni.
- Suggerimento deterministico del responsabile in base a turni, conflitti e carico della giornata.
- Attività assegnate e punti facoltativi.
- Richieste di aiuto familiari senza assegnazione automatica: ogni persona può offrirsi, rinunciare o ritirare la propria richiesta.

L’assegnazione intelligente è locale e deterministica: non invia nomi o calendari familiari a un servizio AI esterno. Notifiche email/push e suggerimenti basati su modelli linguistici non sono attivati.

Le richieste di aiuto usano la migrazione SQL `003_support_requests.sql`. Per applicarla, esegui `npm run db:migrate` con `DATABASE_URL` configurata; il comando applica in ordine soltanto le migrazioni non ancora registrate.

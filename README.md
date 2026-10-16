# PARENTHESYS

Spazio condiviso per calendari, accompagnamenti e attività familiari. La struttura si adatta a famiglie monoparentali, omogenitoriali, allargate e a reti di supporto.

## Stack

- Next.js App Router, React e TypeScript
- PostgreSQL su Neon tramite Prisma
- Auth.js: email/password; Google e Apple sono opzionali
- Vercel per l’hosting

## Sviluppo locale

Richiede Node.js 20.9 o successivo.

1. Installa le dipendenze: `npm install`.
2. Copia `.env.example` in `.env`.
3. Imposta `DATABASE_URL`, `DIRECT_URL` e `AUTH_SECRET`.
4. Applica lo schema al database: `npm run db:push`.
5. Genera il client Prisma: `npm run db:generate`.
6. Avvia l’app: `npm run dev`.

`DATABASE_URL` dovrebbe usare l’endpoint pooled di Neon per l’applicazione. `DIRECT_URL` dovrebbe usare l’endpoint diretto e serve ai comandi di migrazione Prisma. Se si preferiscono migrazioni versionate, crearle durante lo sviluppo con `npm run db:migrate` e applicarle all’ambiente di deploy con `npm run db:deploy`.

I comandi `npm run lint`, `npm run typecheck` e `npm run build` verificano codice, tipi e produzione.

## Deploy su Vercel e Neon

1. Crea un progetto PostgreSQL su Neon e configura le variabili `DATABASE_URL`, `DIRECT_URL` e `AUTH_SECRET` in Vercel. Genera un nuovo segreto casuale per ogni ambiente.
2. Prima del primo deploy, inizializza lo schema sul database di destinazione con `npm run db:push` oppure applica le migrazioni con `npm run db:deploy`.
3. Collega il repository a Vercel. Lo script di build genera Prisma Client e compila Next.js.
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

L’assegnazione intelligente è locale e deterministica: non invia nomi o calendari familiari a un servizio AI esterno. Notifiche email/push e suggerimenti basati su modelli linguistici non sono attivati.

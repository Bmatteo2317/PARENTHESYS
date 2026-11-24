"use strict";exports.id=261,exports.ids=[261],exports.modules={31109:(a,b,c)=>{c.d(b,{WF:()=>D,uN:()=>G,k6:()=>F});var d=c(91488);c(27806);var e=c(91837),f=c(39493),g=c(98891),h=c(78324),i=c(67697),j=c(98764),k=c(89275);let l={extract:()=>process.env.OPENROUTER_MODEL_FAST??"openai/gpt-4o-mini",summary:()=>process.env.OPENROUTER_MODEL_ECONOMY??"google/gemini-flash-1.5",simulate:()=>process.env.OPENROUTER_MODEL_REASONING??"anthropic/claude-3.5-sonnet",negotiate:()=>process.env.OPENROUTER_MODEL_REASONING??"anthropic/claude-3.5-sonnet"};class m extends Error{constructor(a,b){super(b),this.name="AiUnavailableError",this.code=a}}function n(){return!!process.env.OPENROUTER_API_KEY}async function o(a){let b,c,d=process.env.OPENROUTER_API_KEY;if(!d)throw new m("missing_key","Il Care Orchestrator non \xe8 configurato: manca la chiave OpenRouter sul server.");let e=process.env.OPENROUTER_BASE_URL??"https://openrouter.ai/api/v1",f=l[a.operation](),g=Date.now();try{b=await fetch(`${e}/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${d}`,"Content-Type":"application/json","HTTP-Referer":process.env.APP_URL??"https://parenthesys.app","X-Title":process.env.OPENROUTER_APP_NAME??"Parenthesys"},body:JSON.stringify({model:f,temperature:a.temperature??.2,response_format:{type:"json_object"},messages:[{role:"system",content:a.system},{role:"user",content:a.user}]}),signal:AbortSignal.timeout(3e4)})}catch(b){throw await p(a,f,!1,Date.now()-g,a.user.length,"network"),new m("network",b instanceof Error?b.message:"Rete non disponibile.")}if(!b.ok)throw await p(a,f,!1,Date.now()-g,a.user.length,`http_${b.status}`),new m(`http_${b.status}`,"Il servizio AI non ha risposto correttamente.");let h=await b.json(),i=h.choices?.[0]?.message?.content;if(!i)throw await p(a,f,!1,Date.now()-g,a.user.length,"empty"),new m("empty","Il servizio AI ha restituito una risposta vuota.");try{c=JSON.parse(i)}catch{throw await p(a,f,!1,Date.now()-g,a.user.length,"invalid_json"),new m("invalid_json","La risposta dell'AI non \xe8 un JSON valido. Nessun risultato inventato viene mostrato.")}return await p(a,f,!0,Date.now()-g,a.user.length,null),c}async function p(a,b,c,d,e,f){try{await (0,i.db)`
      INSERT INTO "AiLog" ("id", "familyGroupId", "userId", "operation", "model", "ok", "latencyMs", "promptChars", "errorCode")
      VALUES (gen_random_uuid()::text, ${a.sessionRef?.familyGroupId??null}, ${a.sessionRef?.userId??null},
        ${a.operation}, ${b}, ${c}, ${d}, ${e}, ${f})
    `}catch{}}function q(a,b){let c=a,d=0,e=new Map;return[...b].sort((a,b)=>b.name.length-a.name.length).forEach((a,b)=>{let f=`PERSON_${b+1}`,g=new Set([a.name,a.name.split(/\s+/)[0]]),h=!1;for(let a of g){if(!a||a.length<2)continue;let b=RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"gi");b.test(c)&&(c=c.replace(b,f),h=!0,d+=1)}h&&e.set(f,a)}),{text:c=(c=(c=c.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,()=>(d+=1,"[email]"))).replace(/(\+?\d[\d\s().-]{7,}\d)/g,()=>(d+=1,"[numero]"))).replace(/\b(?:via|viale|piazza|corso|strada)\s+[A-Za-zÀ-ÿ0-9' .]{3,40}\d*/gi,()=>(d+=1,"[indirizzo]")),tokenToPerson:e,redactions:d}}function r(a,b){let c=/\bPERSON_(\d+)\b/i.exec(a);if(!c)return{id:null,name:null};let d=b.get(`PERSON_${c[1]}`);return d?{id:d.id,name:d.name}:{id:null,name:null}}let s=f.Yj().refine(a=>!Number.isNaN(Date.parse(a)),"Data non valida."),t=f.Ik({kind:f.k5(["event","task"]),title:f.Yj().trim().min(1).max(140),category:f.k5(["WORK","SCHOOL","SPORT","HEALTH","HOUSEHOLD","LEISURE","CARE","ERRANDS","ADMIN","COMMUNITY"]),start:s.nullable(),end:s.nullable(),estimated_minutes:f.ai().int().min(0).max(1440).nullable(),preparation_minutes:f.ai().int().min(0).max(240).nullable(),travel_minutes:f.ai().int().min(0).max(240).nullable(),participants:f.YO(f.Yj().max(80)).max(8),assignee:f.Yj().max(80).nullable(),requires_booking:f.zM(),location:f.Yj().max(160).nullable(),notes:f.Yj().max(600).nullable(),missing_information:f.YO(f.Yj().max(160)).max(6),confidence:f.ai().min(0).max(1)}).strict(),u=f.Ik({intent:f.eu("extract_care_items"),confidence:f.ai().min(0).max(1),needs_confirmation:f.eu(!0),items:f.YO(t).max(12),people_mentioned:f.YO(f.Yj().max(80)).max(10),explanation:f.Yj().max(800)}).strict(),v=f.Ik({intent:f.eu("weekly_summary"),headline:f.Yj().max(200),highlights:f.YO(f.Yj().max(240)).min(1).max(6),imbalances:f.YO(f.Yj().max(240)).max(5),invisible_work:f.YO(f.Yj().max(240)).max(5),suggestions:f.YO(f.Yj().max(240)).max(5),confidence:f.ai().min(0).max(1)}).strict();f.Ik({intent:f.eu("negotiate"),framing:f.Yj().max(400),options:f.YO(f.Ik({label:f.Yj().max(160),kind:f.k5(["assign","rotate","support","move","split","reduce","confirm"]),rationale:f.Yj().max(300),tradeoff:f.Yj().max(300)}).strict()).min(1).max(4),confidence:f.ai().min(0).max(1)}).strict();let w=`Sei il Care Orchestrator di Parenthesys, un assistente di coordinamento per nuclei familiari.
Trasformi testo naturale (messaggi, fogli scolastici, appunti) in elementi strutturati.
Regole assolute:
- Non assegnare mai un'attivit\xe0 a una persona: proponi sempre una bozza da confermare.
- Non dedurre genere, parentela o ruoli familiari.
- Non inventare dati mancanti: elencali in missing_information.
- Distingui "eventi" (accadono in un intervallo) da "attivit\xe0" (richiedono un'azione: prenotare, preparare, accompagnare, acquistare, ricordare).
- Rispondi SOLO con JSON valido conforme allo schema indicato.`;async function x(a,b){let c=q(a,b.people),d=await o({operation:"extract",system:w,user:function(a,b){let c=b.people.map((a,b)=>`PERSON_${b+1}`).join(", ")||"nessuno";return`Contesto:
- Oggi \xe8 ${b.now.toISOString()} (fuso ${b.timeZone}, lingua ${b.locale}).
- Persone del nucleo (riferisciti a loro solo con i token): ${c}.
- Persone assistite: ${b.careProfiles.map(a=>a.name).join(", ")||"nessuna"}.
- Categorie ammesse: ${b.categories.join(", ")}.

Schema JSON richiesto:
{
  "intent": "extract_care_items",
  "confidence": 0.0-1.0,
  "needs_confirmation": true,
  "people_mentioned": ["PERSON_1"],
  "items": [{
    "kind": "event" | "task",
    "title": string,
    "category": una delle categorie ammesse,
    "start": ISO8601 con fuso oppure null,
    "end": ISO8601 con fuso oppure null,
    "estimated_minutes": intero o null,
    "preparation_minutes": intero o null,
    "travel_minutes": intero o null,
    "participants": [token o nome],
    "assignee": token oppure null,
    "requires_booking": boolean,
    "location": string o null,
    "notes": string o null,
    "missing_information": [string],
    "confidence": 0.0-1.0
  }],
  "explanation": string
}

Testo da analizzare:
"""${a}"""`}(c.text,b),sessionRef:{familyGroupId:b.familyGroupId,userId:b.userId}}),e=u.safeParse(d);if(!e.success)throw new m("schema_mismatch","La risposta dell'AI non rispetta lo schema richiesto. Nessun dato \xe8 stato creato.");return{items:e.data.items.map(a=>(function(a,b,c){let d=a.assignee?r(a.assignee,b):{id:null,name:null},e=new Set(c.people.map(a=>a.id)),f=[];for(let c of a.participants){let a=r(c,b);a.id&&e.has(a.id)&&f.push(a.id)}let g=d.id&&e.has(d.id)?d.id:null;return{...a,startIso:a.start?new Date(a.start).toISOString():null,endIso:a.end?new Date(a.end).toISOString():null,assigneeId:g,assigneeName:g?d.name:null,participantIds:[...new Set(f)]}})(a,c.tokenToPerson,b)),explanation:e.data.explanation,confidence:e.data.confidence,peopleMentioned:e.data.people_mentioned,redactions:c.redactions}}let y=`Sei il Care Orchestrator di Parenthesys. Riassumi la settimana di un nucleo in modo neutro e non giudicante.
Non produrre classifiche, punteggi morali o giudizi sulle persone. Evidenzia il lavoro invisibile e proponi passi concreti.
Rispondi SOLO con JSON valido conforme allo schema.`;async function z(a,b){let c=q(a,b.people),d=await o({operation:"summary",system:y,user:`Dati aggregati della settimana (senza giudizi):
${c.text}

Schema JSON richiesto:
{"intent":"weekly_summary","headline":string,"highlights":[string],"imbalances":[string],"invisible_work":[string],"suggestions":[string],"confidence":0.0-1.0}`,sessionRef:{familyGroupId:b.familyGroupId,userId:b.userId}}),e=v.safeParse(d);if(!e.success)throw new m("schema_mismatch","Il riassunto non ha la forma attesa.");return{summary:e.data,redactions:c.redactions}}var A=c(84123),B=c(40410);async function C(a){let[b,c]=await Promise.all([(0,A.MD)(a.familyId),(0,i.db)`SELECT "id", "name" FROM "KidProfile" WHERE "familyGroupId" = ${a.familyId} ORDER BY "createdAt" ASC`]);return{familyGroupId:a.familyId,userId:a.userId,locale:a.family.locale,timeZone:a.family.timezone,now:new Date,people:b.map(a=>({id:a.userId,name:a.name})),careProfiles:c.map(a=>({id:a.id,name:a.name})),categories:Object.keys(k.TS)}}async function D(a){let b=await (0,h.PS)("event.create"),c=f.Yj().trim().min(4).max(4e3).safeParse(a.get("text"));if(!c.success)return{ok:!1,error:"Incolla un testo un po' pi\xf9 lungo da interpretare."};if(!n())return{ok:!1,error:"Il Care Orchestrator non \xe8 configurato: manca la chiave OpenRouter sul server."};let d=await C(b);try{let a=await x(c.data,d),[f]=await (0,i.db)`
      INSERT INTO "InboxItem" ("id", "familyGroupId", "createdById", "source", "rawText", "status", "proposed", "confidence", "explanation", "model")
      VALUES (gen_random_uuid()::text, ${b.familyId}, ${b.userId}, 'text', ${c.data}, 'pending_review',
        ${JSON.stringify({items:a.items,peopleMentioned:a.peopleMentioned,redactions:a.redactions})}::jsonb,
        ${a.confidence}, ${a.explanation}, ${process.env.OPENROUTER_MODEL_FAST??"openai/gpt-4o-mini"})
      RETURNING "id"
    `;return await (0,j.f)({familyGroupId:b.familyId,actorUserId:b.userId,action:"inbox.extract",entityType:"InboxItem",entityId:f.id,afterValue:{items:a.items.length,redactions:a.redactions}}),(0,e.revalidatePath)("/inbox"),{ok:!0,inboxItemId:f.id}}catch(a){if(a instanceof m)return{ok:!1,error:a.message};throw a}}let E=f.Ik({inboxItemId:f.Yj().min(1),decision:f.k5(["accept","reject"])});async function F(a){let b=await (0,h.PS)("task.assign"),c=E.safeParse(Object.fromEntries(a));if(!c.success)throw Error("Decisione non valida.");let{inboxItemId:d,decision:f}=c.data,[k]=await (0,i.db)`
    SELECT "id", "status", "proposed" FROM "InboxItem"
    WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId} LIMIT 1
  `;if(!k)throw Error("Elemento non trovato.");if("pending_review"!==k.status)throw Error("Questo elemento \xe8 gi\xe0 stato gestito.");if("reject"===f)return await (0,i.db)`
      UPDATE "InboxItem" SET "status" = 'rejected', "resolvedAt" = NOW()
      WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId}
    `,await (0,j.f)({familyGroupId:b.familyId,actorUserId:b.userId,action:"inbox.reject",entityType:"InboxItem",entityId:d}),(0,e.revalidatePath)("/inbox"),{created:0};let l=k.proposed,m=l?.items??[],n=0;for(let a of m){if("event"===a.kind&&a.startIso&&a.endIso){let c=new Date(a.startIso),d=new Date(a.endIso);if(d<=c)continue;await (0,i.db)`
        INSERT INTO "Event" (
          "id", "familyGroupId", "title", "description", "location", "startTime", "endTime", "category", "status",
          "assignedUserId", "preparationMinutes", "travelMinutes", "requiresBooking", "visibility", "createdById", "updatedAt"
        )
        VALUES (gen_random_uuid()::text, ${b.familyId}, ${a.title}, ${a.notes??null}, ${a.location??null},
          ${c}, ${d}, ${a.category}, ${a.assigneeId?"CONFIRMED":"UNASSIGNED"}, ${a.assigneeId},
          ${a.preparation_minutes??0}, ${a.travel_minutes??0}, ${a.requires_booking}, 'household', ${b.userId}, NOW())
      `}else{let c=a.startIso?new Date(a.startIso):null;await (0,i.db)`
        INSERT INTO "Task" (
          "id", "familyGroupId", "title", "description", "status", "assignedToId", "dueDate", "dueAt",
          "activityStatus", "category", "estimatedMinutes", "preparationMinutes", "travelMinutes", "visibility", "createdById", "updatedAt"
        )
        VALUES (gen_random_uuid()::text, ${b.familyId}, ${a.title}, ${a.notes??null}, ${g.e1.PENDING},
          ${a.assigneeId}, ${c??new Date}, ${c}, ${a.assigneeId?g.AK.ASSIGNED:g.AK.UNASSIGNED},
          ${a.category}, ${a.estimated_minutes??30}, ${a.preparation_minutes??0}, ${a.travel_minutes??0},
          'household', ${b.userId}, NOW())
    `}n+=1}return await (0,i.db)`
    UPDATE "InboxItem" SET "status" = 'accepted', "resolvedAt" = NOW()
    WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId}
  `,await (0,j.f)({familyGroupId:b.familyId,actorUserId:b.userId,action:"inbox.accept",entityType:"InboxItem",entityId:d,afterValue:{created:n}}),(0,e.revalidatePath)("/inbox"),(0,e.revalidatePath)("/careboard"),(0,e.revalidatePath)("/tasks"),(0,e.revalidatePath)("/calendar"),{created:n}}async function G(){let a=await (0,h.aB)();if(!n())return{ok:!1,error:"Il Care Orchestrator non \xe8 configurato: manca la chiave OpenRouter sul server."};let b=(0,A.qn)(new Date),{report:c,members:d}=await (0,A.Ep)(a.familyId,b),e=await C(a);try{let{summary:f,redactions:g}=await z((0,A.uw)(c,d,b),e);return await (0,j.f)({familyGroupId:a.familyId,actorUserId:a.userId,action:"summary.generate",entityType:"WeeklySummary"}),{ok:!0,headline:f.headline,highlights:f.highlights,imbalances:f.imbalances,invisibleWork:f.invisible_work,suggestions:f.suggestions,confidence:f.confidence,redactions:g}}catch(a){if(a instanceof m)return{ok:!1,error:a.message};throw a}}(0,B.D)([D,F,G]),(0,d.A)(D,"40b6d8f4f4a2f27d283440fb47bb63218b6d84d3a7",null),(0,d.A)(F,"4067d5058d642fed8945bc76dc4dd29d0bb522687f",null),(0,d.A)(G,"00739eb584cbdf95852777282eac54c83e311cc433",null)},88673:(a,b,c)=>{function d(){return!!process.env.OPENROUTER_API_KEY}c.d(b,{n4:()=>d}),c(35552);var e=c(45711);let f=e.Yj().refine(a=>!Number.isNaN(Date.parse(a)),"Data non valida."),g=e.Ik({kind:e.k5(["event","task"]),title:e.Yj().trim().min(1).max(140),category:e.k5(["WORK","SCHOOL","SPORT","HEALTH","HOUSEHOLD","LEISURE","CARE","ERRANDS","ADMIN","COMMUNITY"]),start:f.nullable(),end:f.nullable(),estimated_minutes:e.ai().int().min(0).max(1440).nullable(),preparation_minutes:e.ai().int().min(0).max(240).nullable(),travel_minutes:e.ai().int().min(0).max(240).nullable(),participants:e.YO(e.Yj().max(80)).max(8),assignee:e.Yj().max(80).nullable(),requires_booking:e.zM(),location:e.Yj().max(160).nullable(),notes:e.Yj().max(600).nullable(),missing_information:e.YO(e.Yj().max(160)).max(6),confidence:e.ai().min(0).max(1)}).strict();e.Ik({intent:e.eu("extract_care_items"),confidence:e.ai().min(0).max(1),needs_confirmation:e.eu(!0),items:e.YO(g).max(12),people_mentioned:e.YO(e.Yj().max(80)).max(10),explanation:e.Yj().max(800)}).strict(),e.Ik({intent:e.eu("weekly_summary"),headline:e.Yj().max(200),highlights:e.YO(e.Yj().max(240)).min(1).max(6),imbalances:e.YO(e.Yj().max(240)).max(5),invisible_work:e.YO(e.Yj().max(240)).max(5),suggestions:e.YO(e.Yj().max(240)).max(5),confidence:e.ai().min(0).max(1)}).strict(),e.Ik({intent:e.eu("negotiate"),framing:e.Yj().max(400),options:e.YO(e.Ik({label:e.Yj().max(160),kind:e.k5(["assign","rotate","support","move","split","reduce","confirm"]),rationale:e.Yj().max(300),tradeoff:e.Yj().max(300)}).strict()).min(1).max(4),confidence:e.ai().min(0).max(1)}).strict()}};
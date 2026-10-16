"use strict";exports.id=8260,exports.ids=[8260],exports.modules={8928:(a,b,c)=>{function d(a){let b=/^(\d{4})-(\d{2})-(\d{2})$/.exec(a);if(!b)return!1;let c=Number(b[1]),d=Number(b[2]),e=Number(b[3]),f=new Date(Date.UTC(c,d-1,e));return f.getUTCFullYear()===c&&f.getUTCMonth()===d-1&&f.getUTCDate()===e}function e(a,b,c){let[d,e,f]=a.split("-").map(Number),[g,h]=b.split(":").map(Number),i=Date.UTC(d,e-1,f,g,h),j=new Intl.DateTimeFormat("en-CA",{timeZone:c,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}),k=i;for(let a=0;a<3;a+=1){let a=Object.fromEntries(j.formatToParts(new Date(k)).map(a=>[a.type,a.value])),b=i-(Date.UTC(Number(a.year),Number(a.month)-1,Number(a.day),Number(a.hour),Number(a.minute),Number(a.second))-k);if(b===k)break;k=b}return new Date(k)}c.d(b,{B:()=>e,t:()=>d})},95879:(a,b,c)=>{c.r(b),c.d(b,{"00971acc05950c46f6d697ed5d2ec9f7b7f865497a":()=>d.B,"401bd1bd9b54c99a4ba774312f3fac9ef41a27db44":()=>v,"4033674a5729cdd33521310dccce0e8b3bdcacc063":()=>I,"4033ff0b329a7ad44bc8793c5ba493313a1d39b5e8":()=>y,"406626ac2a32ed54cd51b821fb104053eac4dfeb53":()=>E,"40a5d25947fbf686302e658bb6491d71c42fd093d0":()=>w,"40ae0a1887529eabdec0561d1bc23eb3a4bfdeb036":()=>A,"40b12bf2f3cec9bbe856a15dc04ff7479d128d4b59":()=>G,"40d3b8783fe34d71d525ff840f403c7c70f9dd3e55":()=>J,"40e7b960a37c662c3ace0acad34535b4db069c133a":()=>C});var d=c(93451),e=c(91488);c(27806);var f=c(91837),g=c(39493),h=c(98891),i=c(78324),j=c(67697),k=c(98764);async function l(a){try{await (0,j.db)`
      INSERT INTO "Notification" ("id", "familyGroupId", "userId", "type", "priority", "title", "body", "entityType", "entityId")
      VALUES (gen_random_uuid()::text, ${a.familyGroupId}, ${a.userId}, ${a.type},
        ${a.priority??"normal"}, ${a.title}, ${a.body??null},
        ${a.entityType??null}, ${a.entityId??null})
    `}catch{}}async function m(a,b,c){let d=await (0,j.db)`
    SELECT "userId" FROM "FamilyMember"
    WHERE "familyGroupId" = ${a} AND "status" = 'active' AND "userId" <> ${b}
  `;await Promise.all(d.map(b=>l({...c,familyGroupId:a,userId:b.userId})))}var n=c(8928),o=c(84123),p=c(73994),q=c(40410);let r=g.k5(["WORK","SCHOOL","SPORT","HEALTH","HOUSEHOLD","LEISURE","CARE","ERRANDS","ADMIN","COMMUNITY"]),s=g.k5(["fixed","semi_flexible","flexible"]),t=g.Ik({title:g.Yj().trim().min(2).max(140),description:g.Yj().trim().max(600).optional(),category:r,estimatedMinutes:g.au.number().int().min(0).max(1440),preparationMinutes:g.au.number().int().min(0).max(240).default(0),travelMinutes:g.au.number().int().min(0).max(240).default(0),coordinationMinutes:g.au.number().int().min(0).max(240).default(0),mentalLoad:g.au.number().int().min(1).max(5).default(1),physicalLoad:g.au.number().int().min(1).max(5).default(1),emotionalLoad:g.au.number().int().min(1).max(5).default(1),urgency:g.au.number().int().min(1).max(5).default(1),predictability:g.au.number().int().min(1).max(5).default(1),flexibility:s.default("flexible"),rotates:g.k5(["true","false"]).optional(),dueDate:g.Yj().refine(n.t).optional(),dueAt:g.Yj().optional(),careProfileId:g.Yj().optional(),source:g.Yj().optional()});function u(a,b){if(a.dueDate&&a.dueAt)return(0,n.B)(a.dueDate,a.dueAt,b);if(a.dueAt){let b=new Date(a.dueAt);if(!Number.isNaN(b.getTime()))return b}return null}async function v(a){let b=await (0,i.PS)("event.create"),c=t.safeParse(Object.fromEntries(a));if(!c.success)throw Error(c.error.issues[0]?.message??"I dati dell'attivit\xe0 non sono validi.");let d=c.data;if(d.careProfileId){let[a]=await (0,j.db)`
      SELECT "id" FROM "KidProfile" WHERE "id" = ${d.careProfileId} AND "familyGroupId" = ${b.familyId} LIMIT 1
    `;if(!a)throw Error("La persona assistita scelta non appartiene a questo nucleo.")}let e=u(d,b.family.timezone),g=e??new Date,[l]=await (0,j.db)`
    INSERT INTO "Task" (
      "id", "familyGroupId", "title", "description", "status", "assignedToId", "dueDate", "dueAt", "points",
      "activityStatus", "category", "estimatedMinutes", "preparationMinutes", "travelMinutes", "coordinationMinutes",
      "mentalLoad", "physicalLoad", "emotionalLoad", "urgency", "predictability", "flexibility", "rotates",
      "careProfileId", "visibility", "createdById", "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text, ${b.familyId}, ${d.title}, ${d.description??null}, ${h.e1.PENDING},
      ${null}, ${g}, ${e}, 0, ${h.AK.UNASSIGNED}, ${d.category}, ${d.estimatedMinutes},
      ${d.preparationMinutes}, ${d.travelMinutes}, ${d.coordinationMinutes}, ${d.mentalLoad},
      ${d.physicalLoad}, ${d.emotionalLoad}, ${d.urgency}, ${d.predictability}, ${d.flexibility},
      ${"true"===d.rotates}, ${d.careProfileId||null}, 'household', ${b.userId}, NOW()
    )
    RETURNING "id"
  `;return await (0,k.f)({familyGroupId:b.familyId,actorUserId:b.userId,action:"activity.create",entityType:"Task",entityId:l.id,afterValue:{title:d.title,category:d.category,estimatedMinutes:d.estimatedMinutes}}),(0,f.revalidatePath)("/careboard"),(0,f.revalidatePath)("/tasks"),(0,f.revalidatePath)("/workload"),{id:l.id}}async function w(a){let b=await (0,i.aB)(),c=t.partial().safeParse(Object.fromEntries(a));if(!c.success)throw Error("Dati insufficienti per stimare l'impatto.");let d=c.data,e=d.title?.trim()||"Nuova attivit\xe0",f=d.category??"HOUSEHOLD",g=(d.estimatedMinutes??30)+(d.preparationMinutes??0)+(d.travelMinutes??0)+(d.coordinationMinutes??0),h=d.flexibility??"flexible",j="true"===d.rotates,k=u(d,b.family.timezone),l=(0,o.qn)(k??new Date),{candidates:m,report:n}=await (0,o.zP)(b.familyId,l,{start:k,durationMinutes:g,category:f}),q=(0,o.lK)(e,f,g,h,j,k,m),r=(0,o.Ul)(q),s=(0,p.Vj)(q,r),v=n.members.map(a=>({userId:a.userId,name:a.name,minutes:a.totalMinutes})),w=m.map(a=>{let b=(0,p.lU)(v,a.userId,g);return{userId:a.userId,name:a.name,color:a.color,narrative:b.narrative,becomesLessBalanced:b.becomesLessBalanced,deltaConcentration:b.deltaConcentration}});return{title:e,category:f,durationMinutes:g,startIso:k?k.toISOString():null,flexibility:h,rotates:j,options:r.options,alternatives:s,impacts:w,recommendedUserId:r.recommended?.userId??null,unassigned:r.unassigned}}let x=g.Ik({activityId:g.Yj().min(1),assigneeId:g.Yj().min(1),source:g.k5(["manual","equity","rotation","ai"]).default("manual"),explanation:g.Yj().trim().max(400).optional(),note:g.Yj().trim().max(300).optional()});async function y(a){let b=await (0,i.PS)("task.assign"),c=x.safeParse(Object.fromEntries(a));if(!c.success)throw Error("Assegnazione non valida.");let{activityId:d,assigneeId:e,source:g,explanation:m}=c.data,[n]=await (0,j.db)`
    SELECT "id", "title", "assignedToId", "activityStatus" FROM "Task"
    WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId} LIMIT 1
  `;if(!n)throw Error("Attivit\xe0 non trovata.");let[o]=await (0,j.db)`
    SELECT "id" FROM "FamilyMember"
    WHERE "userId" = ${e} AND "familyGroupId" = ${b.familyId} AND "status" = 'active' LIMIT 1
  `;if(!o)throw Error("La persona scelta non fa parte di questo nucleo.");await (0,j.db)`
    UPDATE "Task" SET "assignedToId" = ${e}, "activityStatus" = ${h.AK.ASSIGNED}, "updatedAt" = NOW()
    WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId}
  `,await (0,j.db)`
    INSERT INTO "TaskAssignment" ("id", "taskId", "userId", "role", "status", "source", "explanation", "createdById")
    VALUES (gen_random_uuid()::text, ${d}, ${e}, 'primary', 'proposed', ${g}, ${m??null}, ${b.userId})
  `,await (0,j.db)`
    INSERT INTO "CareEventHistory" ("id", "familyGroupId", "taskId", "changeType", "fromUserId", "toUserId", "fromStatus", "toStatus", "actorUserId")
    VALUES (gen_random_uuid()::text, ${b.familyId}, ${d}, 'assignment', ${n.assignedToId??null}, ${e},
      ${n.activityStatus??null}, ${h.AK.ASSIGNED}, ${b.userId})
  `,await (0,k.f)({familyGroupId:b.familyId,actorUserId:b.userId,action:"activity.assign",entityType:"Task",entityId:d,beforeValue:{assignedToId:n.assignedToId},afterValue:{assignedToId:e,source:g}}),await l({familyGroupId:b.familyId,userId:e,type:"assignment",priority:"normal",title:`Ti \xe8 stata proposta "${n.title}"`,body:m??"Puoi accettare, chiedere supporto o declinare con una nota.",entityType:"Task",entityId:d}),(0,f.revalidatePath)("/careboard"),(0,f.revalidatePath)("/tasks"),(0,f.revalidatePath)("/workload"),(0,f.revalidatePath)("/support")}let z=g.Ik({activityId:g.Yj().min(1),response:g.k5(["accept","decline"]),message:g.Yj().trim().max(400).optional()});async function A(a){let b=await (0,i.aB)(),c=z.safeParse(Object.fromEntries(a));if(!c.success)throw Error("Risposta non valida.");let{activityId:d,response:e,message:g}=c.data,[l]=await (0,j.db)`
    SELECT "id", "title", "assignedToId" FROM "Task"
    WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId} LIMIT 1
  `;if(!l)throw Error("Attivit\xe0 non trovata.");if(l.assignedToId!==b.userId&&!b.isAdmin)throw Error("Puoi rispondere solo alle attivit\xe0 assegnate a te.");let n="accept"===e?h.AK.ACCEPTED:h.AK.DECLINED;await (0,j.db)`
    UPDATE "Task" SET "activityStatus" = ${n}, "updatedAt" = NOW()
    WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId}
  `,await (0,j.db)`
    UPDATE "TaskAssignment" SET "status" = ${"accept"===e?"accepted":"declined"}, "respondedAt" = NOW()
    WHERE "taskId" = ${d} AND "userId" = ${b.userId}
      AND "id" = (SELECT "id" FROM "TaskAssignment" WHERE "taskId" = ${d} AND "userId" = ${b.userId} ORDER BY "createdAt" DESC LIMIT 1)
  `,await (0,j.db)`
    INSERT INTO "CareEventHistory" ("id", "familyGroupId", "taskId", "changeType", "fromUserId", "toUserId", "toStatus", "note", "actorUserId")
    VALUES (gen_random_uuid()::text, ${b.familyId}, ${d}, ${"accept"===e?"accept":"decline"},
      ${b.userId}, ${null}, ${n}, ${g??null}, ${b.userId})
  `,await (0,k.f)({familyGroupId:b.familyId,actorUserId:b.userId,action:`activity.${e}`,entityType:"Task",entityId:d,reason:g}),"decline"===e?await m(b.familyId,b.userId,{type:"decline",priority:"high",title:`"${l.title}" \xe8 stata declinata`,body:g??"Qualcuno ha segnalato di non poter coprire questa attivit\xe0. Serve una nuova proposta.",entityType:"Task",entityId:d}):await m(b.familyId,b.userId,{type:"accept",title:`"${l.title}" \xe8 stata accettata`,entityType:"Task",entityId:d}),(0,f.revalidatePath)("/careboard"),(0,f.revalidatePath)("/tasks")}let B=g.Ik({activityId:g.Yj().min(1),status:g.k5(["in_progress","blocked","completed","skipped","cancelled","needs_review"])});async function C(a){let b=await (0,i.aB)(),c=B.safeParse(Object.fromEntries(a));if(!c.success)throw Error("Stato non valido.");let{activityId:d,status:e}=c.data,[g]=await (0,j.db)`
    SELECT "id", "title", "assignedToId", "activityStatus" FROM "Task"
    WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId} LIMIT 1
  `;if(!g)throw Error("Attivit\xe0 non trovata.");if(g.assignedToId!==b.userId&&!b.isAdmin&&"MEMBER"===b.membership.permission)throw Error("Puoi aggiornare solo le attivit\xe0 che ti riguardano.");let l="completed"===e;await (0,j.db)`
    UPDATE "Task" SET "activityStatus" = ${e}, "status" = ${l?h.e1.COMPLETED:h.e1.PENDING},
      "completedAt" = ${l?new Date:null}, "updatedAt" = NOW()
    WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId}
  `,await (0,j.db)`
    INSERT INTO "CareEventHistory" ("id", "familyGroupId", "taskId", "changeType", "fromStatus", "toStatus", "actorUserId")
    VALUES (gen_random_uuid()::text, ${b.familyId}, ${d}, 'status', ${g.activityStatus??null}, ${e}, ${b.userId})
  `,await (0,k.f)({familyGroupId:b.familyId,actorUserId:b.userId,action:"activity.status",entityType:"Task",entityId:d,beforeValue:{activityStatus:g.activityStatus},afterValue:{activityStatus:e}}),(0,f.revalidatePath)("/careboard"),(0,f.revalidatePath)("/tasks"),(0,f.revalidatePath)("/workload")}let D=g.Ik({activityId:g.Yj().min(1),toUserId:g.Yj().optional(),strategy:g.k5(["least_loaded","next_in_line","explicit"]).default("least_loaded")});async function E(a){let b=await (0,i.PS)("task.assign"),c=D.safeParse(Object.fromEntries(a));if(!c.success)throw Error("Rotazione non valida.");let{activityId:d,toUserId:e,strategy:g}=c.data,[m]=await (0,j.db)`
    SELECT "id", "title", "assignedToId" FROM "Task"
    WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId} LIMIT 1
  `;if(!m)throw Error("Attivit\xe0 non trovata.");let n=e??null;if(!n){let a=(0,o.qn)(new Date),{candidates:c}=await (0,o.zP)(b.familyId,a),d=c.filter(a=>a.userId!==m.assignedToId).sort((a,b)=>a.loadMinutes-b.loadMinutes);n=d[0]?.userId??null}if(!n)throw Error("Non ci sono altre persone disponibili per la rotazione.");let[p]=await (0,j.db)`
    SELECT "id" FROM "FamilyMember"
    WHERE "userId" = ${n} AND "familyGroupId" = ${b.familyId} AND "status" = 'active' LIMIT 1
  `;if(!p)throw Error("La persona scelta non fa parte di questo nucleo.");await (0,j.db)`
    UPDATE "Task" SET "assignedToId" = ${n}, "activityStatus" = ${h.AK.ASSIGNED}, "updatedAt" = NOW()
    WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId}
  `,await (0,j.db)`
    INSERT INTO "TaskAssignment" ("id", "taskId", "userId", "role", "status", "source", "createdById")
    VALUES (gen_random_uuid()::text, ${d}, ${n}, 'primary', 'proposed', 'rotation', ${b.userId})
  `,await (0,j.db)`
    INSERT INTO "CareEventHistory" ("id", "familyGroupId", "taskId", "changeType", "fromUserId", "toUserId", "actorUserId")
    VALUES (gen_random_uuid()::text, ${b.familyId}, ${d}, 'rotation', ${m.assignedToId??null}, ${n}, ${b.userId})
  `,await (0,k.f)({familyGroupId:b.familyId,actorUserId:b.userId,action:"activity.rotate",entityType:"Task",entityId:d,beforeValue:{assignedToId:m.assignedToId},afterValue:{assignedToId:n,strategy:g}}),await l({familyGroupId:b.familyId,userId:n,type:"rotation",title:`Turno di rotazione: "${m.title}"`,body:"Questa attivit\xe0 ruota tra pi\xf9 persone per non pesare sempre sulle stesse.",entityType:"Task",entityId:d}),(0,f.revalidatePath)("/careboard"),(0,f.revalidatePath)("/tasks"),(0,f.revalidatePath)("/workload")}let F=g.Ik({taskId:g.Yj().optional(),message:g.Yj().trim().min(3).max(600),reasonType:g.k5(["need_help","cannot_attend","need_company","need_equipment","need_time"]).default("need_help"),windowStart:g.Yj().optional(),windowEnd:g.Yj().optional()});async function G(a){let b=await (0,i.aB)(),c=F.safeParse(Object.fromEntries(a));if(!c.success)throw Error("Descrivi la richiesta in modo pi\xf9 chiaro.");let d=c.data;if(d.taskId){let[a]=await (0,j.db)`
      SELECT "id" FROM "Task" WHERE "id" = ${d.taskId} AND "familyGroupId" = ${b.familyId} LIMIT 1
    `;if(!a)throw Error("L'attivit\xe0 collegata non esiste in questo nucleo.")}let[e]=await (0,j.db)`
    INSERT INTO "SupportRequest" ("id", "familyGroupId", "taskId", "createdById", "message", "reasonType", "windowStart", "windowEnd", "status")
    VALUES (gen_random_uuid()::text, ${b.familyId}, ${d.taskId||null}, ${b.userId}, ${d.message},
      ${d.reasonType}, ${d.windowStart?new Date(d.windowStart):null}, ${d.windowEnd?new Date(d.windowEnd):null}, 'open')
    RETURNING "id"
  `;await (0,k.f)({familyGroupId:b.familyId,actorUserId:b.userId,action:"support.request",entityType:"SupportRequest",entityId:e.id,afterValue:{reasonType:d.reasonType}}),await m(b.familyId,b.userId,{type:"support_request",priority:"high",title:"Una richiesta di aiuto \xe8 aperta",body:d.message,entityType:"SupportRequest",entityId:e.id}),(0,f.revalidatePath)("/support"),(0,f.revalidatePath)("/careboard")}let H=g.Ik({requestId:g.Yj().min(1),response:g.k5(["accept","alternative","decline"]),message:g.Yj().trim().max(400).optional()});async function I(a){let b=await (0,i.aB)(),c=H.safeParse(Object.fromEntries(a));if(!c.success)throw Error("Risposta non valida.");let{requestId:d,response:e,message:g}=c.data,[m]=await (0,j.db)`
    SELECT "id", "createdById", "taskId", "status" FROM "SupportRequest"
    WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId} LIMIT 1
  `;if(!m)throw Error("Richiesta non trovata.");await (0,j.db)`
    INSERT INTO "SupportResponse" ("id", "requestId", "userId", "response", "message")
    VALUES (gen_random_uuid()::text, ${d}, ${b.userId}, ${e}, ${g??null})
  `,"accept"===e&&(await (0,j.db)`
      UPDATE "SupportRequest" SET "status" = 'resolved', "resolvedByUserId" = ${b.userId}, "resolvedAt" = NOW()
      WHERE "id" = ${d} AND "familyGroupId" = ${b.familyId}
    `,m.taskId&&await (0,j.db)`
        UPDATE "Task" SET "assignedToId" = ${b.userId}, "activityStatus" = ${h.AK.ASSIGNED}, "updatedAt" = NOW()
        WHERE "id" = ${m.taskId} AND "familyGroupId" = ${b.familyId}
      `),await (0,k.f)({familyGroupId:b.familyId,actorUserId:b.userId,action:`support.${e}`,entityType:"SupportRequest",entityId:d}),await l({familyGroupId:b.familyId,userId:m.createdById,type:"support_response",title:"accept"===e?"Qualcuno ha raccolto la tua richiesta":"\xc8 arrivata una risposta alla tua richiesta",body:g??void 0,entityType:"SupportRequest",entityId:d}),(0,f.revalidatePath)("/support"),(0,f.revalidatePath)("/careboard")}async function J(a){let b=await (0,i.PS)("task.assign"),c=g.Ik({activityId:g.Yj().min(1),kind:g.k5(["assign","rotate","support","move","split","confirm"])}).safeParse(Object.fromEntries(a));if(!c.success)throw Error("Alternativa non valida.");let d=c.data.kind;if("rotate"===d){let a=new FormData;a.set("activityId",c.data.activityId),a.set("strategy","least_loaded"),await E(a);return}if("support"===d){let a=new FormData;a.set("taskId",c.data.activityId),a.set("message","Serve una mano su questa attivit\xe0: chi pu\xf2 coprirla?"),a.set("reasonType","need_help"),await G(a);return}await (0,k.f)({familyGroupId:b.familyId,actorUserId:b.userId,action:`activity.alternative.${d}`,entityType:"Task",entityId:c.data.activityId}),(0,f.revalidatePath)("/careboard")}(0,q.D)([v,w,y,A,C,E,G,I,J]),(0,e.A)(v,"401bd1bd9b54c99a4ba774312f3fac9ef41a27db44",null),(0,e.A)(w,"40a5d25947fbf686302e658bb6491d71c42fd093d0",null),(0,e.A)(y,"4033ff0b329a7ad44bc8793c5ba493313a1d39b5e8",null),(0,e.A)(A,"40ae0a1887529eabdec0561d1bc23eb3a4bfdeb036",null),(0,e.A)(C,"40e7b960a37c662c3ace0acad34535b4db069c133a",null),(0,e.A)(E,"406626ac2a32ed54cd51b821fb104053eac4dfeb53",null),(0,e.A)(G,"40b12bf2f3cec9bbe856a15dc04ff7479d128d4b59",null),(0,e.A)(I,"4033674a5729cdd33521310dccce0e8b3bdcacc063",null),(0,e.A)(J,"40d3b8783fe34d71d525ff840f403c7c70f9dd3e55",null)}};
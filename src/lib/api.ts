import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Permission, PermissionKey, RoleKey } from "@/lib/domain";
import { effectivePermissions, isAdministrator } from "@/lib/permissions";

// API pubblica versionata. Ogni richiesta è isolata per nucleo: si accede solo
// ai dati dei nuclei di cui si fa parte. Il versionamento vive nel percorso (/api/v1).
export const API_VERSION = "v1";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details ?? undefined } },
      { status: error.status },
    );
  }
  console.error("[api] errore non gestito", error);
  return NextResponse.json({ error: { code: "internal_error", message: "Errore interno del server." } }, { status: 500 });
}

// Ogni handler passa di qui: gli errori diventano risposte coerenti, mai stack trace.
export async function guard(run: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await run();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "unauthenticated", "Serve un accesso autenticato.");
  return session.user.id;
}

export type ApiMembership = {
  membershipId: string;
  userId: string;
  familyGroupId: string;
  roleKey: RoleKey;
  permission: Permission;
  permissions: Record<string, boolean>;
  capabilities: Set<PermissionKey>;
  isAdmin: boolean;
  family: { id: string; name: string; type: string; timezone: string; locale: string };
};

// L'isolamento tra nuclei è verificato qui: chi non appartiene al nucleo riceve 404,
// non 403, così non si rivela nemmeno l'esistenza dello spazio.
export async function resolveHousehold(userId: string, familyGroupId: string): Promise<ApiMembership> {
  const [row] = await db`
    SELECT fm."id" AS "membershipId", fm."roleKey", fm."permission", fm."permissions",
      fg."id" AS "familyId", fg."name", fg."type", fg."timezone", fg."locale"
    FROM "FamilyMember" fm
    JOIN "FamilyGroup" fg ON fg."id" = fm."familyGroupId"
    WHERE fm."familyGroupId" = ${familyGroupId} AND fm."userId" = ${userId} AND fm."status" = 'active'
    LIMIT 1
  `;
  if (!row) throw new ApiError(404, "household_not_found", "Nucleo non trovato o non accessibile.");

  const membership = {
    permission: row.permission as Permission,
    roleKey: row.roleKey as RoleKey,
    permissions: (row.permissions ?? {}) as Record<string, boolean>,
  };
  return {
    membershipId: row.membershipId as string,
    userId,
    familyGroupId: row.familyId as string,
    ...membership,
    capabilities: effectivePermissions(membership),
    isAdmin: isAdministrator(membership),
    family: {
      id: row.familyId as string,
      name: row.name as string,
      type: (row.type as string) ?? "custom",
      timezone: row.timezone as string,
      locale: (row.locale as string) ?? "it-IT",
    },
  };
}

export function assertCapability(membership: ApiMembership, key: PermissionKey): void {
  if (!membership.capabilities.has(key)) {
    throw new ApiError(403, "forbidden", "Non hai il permesso necessario per questa operazione.");
  }
}

// Corpo JSON validato con zod: input malformato = 422, mai un errore interno.
export function parseBody<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(422, "validation_error", "I dati inviati non sono validi.", parsed.error.flatten());
  }
  return parsed.data;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Il corpo della richiesta deve essere JSON valido.");
  }
}

export function idempotencyKey(request: Request): string | null {
  const key = request.headers.get("idempotency-key");
  return key && key.length >= 8 && key.length <= 200 ? key : null;
}

export type IdempotentRun = { status: number; data: unknown };

// Le scritture ripetibili (dispositivi offline, reti instabili) possono essere ritentate
// con la stessa Idempotency-Key: la seconda chiamata restituisce la prima risposta.
export async function idempotent(
  userId: string,
  familyGroupId: string | null,
  endpoint: string,
  key: string | null,
  run: () => Promise<IdempotentRun>,
): Promise<NextResponse> {
  if (!key) {
    const result = await run();
    return json(result.data, result.status);
  }

  const [existing] = await db`
    SELECT "status", "response" FROM "IdempotencyKey"
    WHERE "userId" = ${userId} AND "key" = ${key} LIMIT 1
  `;
  if (existing) {
    return NextResponse.json(existing.response, { status: existing.status as number, headers: { "idempotency-replayed": "true" } });
  }

  const result = await run();
  const envelope = { data: result.data };
  await db`
    INSERT INTO "IdempotencyKey" ("id", "key", "userId", "familyGroupId", "endpoint", "status", "response")
    VALUES (gen_random_uuid()::text, ${key}, ${userId}, ${familyGroupId}, ${endpoint}, ${result.status}, ${JSON.stringify(envelope)}::jsonb)
    ON CONFLICT ("userId", "key") DO NOTHING
  `;
  return NextResponse.json(envelope, { status: result.status });
}

export function parseDateParam(value: string | null, field: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(422, "validation_error", `Il parametro ${field} non è una data valida.`);
  return date;
}

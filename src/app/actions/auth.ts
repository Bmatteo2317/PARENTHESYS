"use server";

import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";

const registrationSchema = z.object({
  name: z.string().trim().min(2, "Inserisci il tuo nome.").max(60),
  email: z.string().trim().email("Inserisci un indirizzo email valido.").max(254),
  password: z.string().min(8, "La password deve contenere almeno 8 caratteri.").max(72),
});

export type RegistrationState = { error?: string };
export type LoginState = { error?: string };

export async function loginUser(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.object({
    email: z.string().email("Inserisci un indirizzo email valido."),
    password: z.string().min(1, "Inserisci la password."),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Controlla i dati inseriti." };

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirectTo: "/calendar",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") return { error: "Email o password non corretti." };
      console.error("Autenticazione non riuscita.", error);
      return { error: "Non è stato possibile completare l’accesso. Riprova." };
    }
    throw error;
  }
  return {};
}

export async function signInWithProvider(formData: FormData) {
  const provider = z.enum(["google", "apple"]).safeParse(formData.get("provider"));
  if (!provider.success) throw new Error("Provider di accesso non valido.");
  await signIn(provider.data, { redirectTo: "/calendar" });
}

export async function registerUser(_previous: RegistrationState, formData: FormData): Promise<RegistrationState> {
  const parsed = registrationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Controlla i dati inseriti." };

  try {
    await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        passwordHash: await hash(parsed.data.password, 12),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Questo indirizzo email è già registrato." };
    }
    console.error("Registrazione non riuscita.", error);
    return { error: "Non è stato possibile completare la registrazione. Riprova." };
  }

  redirect("/login?registered=1");
}

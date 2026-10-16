import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

const providers: Provider[] = [
  Credentials({
    credentials: { email: {}, password: { type: "password" } },
    async authorize(credentials) {
      const result = credentialsSchema.safeParse(credentials);
      if (!result.success) return null;
      const [user] = await db`SELECT "id", "name", "email", "passwordHash", "image" FROM "User" WHERE "email" = ${result.data.email.toLowerCase()} LIMIT 1`;
      if (!user?.passwordHash || !(await compare(result.data.password, user.passwordHash))) return null;
      return { id: user.id, name: user.name, email: user.email, image: user.image };
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }));
}

if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
  providers.push(Apple({ clientId: process.env.AUTH_APPLE_ID, clientSecret: process.env.AUTH_APPLE_SECRET }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider === "credentials") return true;
      if (!user.email) return false;
      const profileEmail = profile && "email_verified" in profile ? profile.email_verified : undefined;
      const verified = profileEmail === true;
      if (!verified) return false;

      const [linkedAccount] = await db`
        SELECT "userId" FROM "OAuthAccount"
        WHERE "provider" = ${account.provider} AND "providerAccountId" = ${account.providerAccountId}
        LIMIT 1
      `;
      if (linkedAccount) {
        user.id = linkedAccount.userId;
        return true;
      }

      const email = user.email.toLowerCase();
      const [existingUser] = await db`
        INSERT INTO "User" ("id", "name", "email", "image", "emailVerified", "updatedAt")
        VALUES (gen_random_uuid()::text, ${user.name ?? email}, ${email}, ${user.image ?? null}, NOW(), NOW())
        ON CONFLICT ("email") DO UPDATE SET
          "name" = EXCLUDED."name",
          "image" = COALESCE(EXCLUDED."image", "User"."image"),
          "emailVerified" = COALESCE("User"."emailVerified", NOW()),
          "updatedAt" = NOW()
        RETURNING "id"
      `;
      const [newLink] = await db`
        INSERT INTO "OAuthAccount" ("provider", "providerAccountId", "userId")
        VALUES (${account.provider}, ${account.providerAccountId}, ${existingUser.id})
        ON CONFLICT ("provider", "providerAccountId") DO NOTHING
        RETURNING "userId"
      `;
      if (newLink) {
        user.id = newLink.userId;
        return true;
      }
      const [racedLink] = await db`
        SELECT "userId" FROM "OAuthAccount"
        WHERE "provider" = ${account.provider} AND "providerAccountId" = ${account.providerAccountId}
        LIMIT 1
      `;
      if (!racedLink) throw new Error("Non è stato possibile associare l’account OAuth.");
      user.id = racedLink.userId;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return `${baseUrl}/careboard`;
    },
  },
});

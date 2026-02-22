import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";

import type { RoleType } from "@/lib/auth/roles";
import { normalizeRoleType } from "@/lib/auth/roles";
import { findDemoUser } from "@/lib/auth/users";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const runtimeAuthSecret =
  process.env.NEXTAUTH_SECRET?.trim() ||
  process.env.AUTH_SECRET?.trim() ||
  process.env.STAGING_NEXTAUTH_SECRET?.trim();

export const authOptions: NextAuthOptions = {
  secret: runtimeAuthSecret,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      authorize: async (credentials) => {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await findDemoUser(parsed.data.email, parsed.data.password);

        if (!user) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roleType: user.roleType,
          role: user.roleType,
          azureObjectId: user.azureObjectId,
          isActive: user.isActive
        };
      }
    })
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user?.roleType) {
        token.roleType = normalizeRoleType(user.roleType as string);
      }
      if (user?.role) {
        token.roleType = normalizeRoleType(user.role as string);
      }
      if (token.roleType && !token.role) {
        token.role = token.roleType;
      }
      if (user?.azureObjectId) {
        token.azureObjectId = user.azureObjectId as string;
      }
      if (typeof user?.isActive === "boolean") {
        token.isActive = user.isActive;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub ?? "";
        const roleType = normalizeRoleType(
          (token.roleType as RoleType | undefined) ?? (token.role as string | undefined)
        );
        session.user.roleType = roleType;
        session.user.role = roleType;
        session.user.azureObjectId = (token.azureObjectId as string | undefined) ?? "";
        session.user.isActive = typeof token.isActive === "boolean" ? token.isActive : true;
      }
      return session;
    }
  }
};

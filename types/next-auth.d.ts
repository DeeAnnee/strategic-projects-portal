import "next-auth";
import "next-auth/jwt";

import type { RoleType } from "@/lib/auth/roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      roleType: RoleType;
      role: RoleType;
      azureObjectId: string;
      isActive: boolean;
    };
  }

  interface User {
    roleType: RoleType;
    role: RoleType;
    azureObjectId?: string;
    isActive?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roleType?: RoleType;
    role?: RoleType;
    azureObjectId?: string;
    isActive?: boolean;
  }
}

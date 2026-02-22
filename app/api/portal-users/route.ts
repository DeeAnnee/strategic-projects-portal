import { NextResponse } from "next/server";

import { requireApiPrincipal } from "@/lib/auth/api";
import { listUsersSafe } from "@/lib/auth/users";

export async function GET() {
  const access = await requireApiPrincipal("projects");
  if ("error" in access) {
    return access.error;
  }

  const users = await listUsersSafe();
  const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ data: sorted });
}

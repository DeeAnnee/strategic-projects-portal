import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { canAccessModule } from "@/lib/auth/rbac";
import { addComment } from "@/lib/operations/store";

const commentSchema = z.object({
  cardId: z.string(),
  body: z.string().min(2),
  author: z.string().min(2)
});

export async function POST(request: Request) {
  const access = await requireApiPrincipal();
  if ("error" in access) {
    return access.error;
  }

  const principal = toRbacPrincipal(access.principal);
  const allowed =
    canAccessModule(principal, "finance_governance_hub") ||
    canAccessModule(principal, "project_governance_hub") ||
    canAccessModule(principal, "project_management_hub") ||
    canAccessModule(principal, "user_admin");
  if (!allowed) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const mentions = parsed.data.body
    .split(/\s+/)
    .filter((word) => word.startsWith("@"))
    .map((mention) => mention.replace(/[^a-zA-Z0-9@_-]/g, ""));

  const comment = await addComment(parsed.data.cardId, parsed.data.author, parsed.data.body, mentions);
  if (!comment) {
    return NextResponse.json({ message: "Card not found" }, { status: 404 });
  }

  return NextResponse.json({ data: comment });
}

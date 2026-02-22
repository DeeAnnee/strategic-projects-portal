import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/options";
import { createAuditLog } from "@/lib/copilot/store";
import { copilotTemplates } from "@/lib/copilot/templates";
import { COPILOT_MODES } from "@/lib/copilot/types";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await createAuditLog({
    userId: session.user.id,
    action: "COPILOT_TEMPLATES_LISTED",
    metadata: {
      templateCount: copilotTemplates.length
    }
  });

  return NextResponse.json({
    data: {
      modes: COPILOT_MODES,
      quickActions: copilotTemplates,
      templates: copilotTemplates
    }
  });
}

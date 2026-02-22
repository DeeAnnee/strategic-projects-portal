import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import { generateHelperResponse } from "@/lib/ai/helper";
import { getSubmissionById } from "@/lib/submissions/store";

const helperSchema = z.object({
  question: z.string().min(2).max(1000),
  caseId: z.string().optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = helperSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const submission = parsed.data.caseId ? await getSubmissionById(parsed.data.caseId) : null;
  const response = generateHelperResponse({
    question: parsed.data.question,
    submission
  });

  return NextResponse.json({ data: response });
}

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth/options";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "@/lib/notifications/store";

const patchSchema = z.object({
  id: z.string().optional(),
  markAll: z.boolean().optional()
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const alerts = await listNotifications(session.user.email ?? undefined);
  return NextResponse.json({ data: alerts });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.markAll) {
    const items = await markAllNotificationsRead();
    return NextResponse.json({ data: items });
  }

  if (parsed.data.id) {
    const item = await markNotificationRead(parsed.data.id);
    if (!item) {
      return NextResponse.json({ message: "Notification not found" }, { status: 404 });
    }
    return NextResponse.json({ data: item });
  }

  return NextResponse.json({ message: "No update operation requested" }, { status: 400 });
}

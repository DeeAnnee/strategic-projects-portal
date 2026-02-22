import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiPrincipal, toRbacPrincipal } from "@/lib/auth/api";
import { canAccessModule } from "@/lib/auth/rbac";
import { addTask, editTask, listBoardCards, removeTask, updateTaskStatus } from "@/lib/operations/store";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isValidDateOnly = (value: string) => {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const dueDateSchema = z
  .string()
  .trim()
  .refine(isValidDateOnly, { message: "Due date must be a valid date in YYYY-MM-DD format" });

const addTaskSchema = z.object({
  cardId: z.string(),
  title: z.string().min(2),
  dueDate: dueDateSchema,
  assigneeName: z.string().max(120).optional(),
  assigneeEmail: z.string().email().optional()
});

const updateStatusSchema = z.object({
  cardId: z.string(),
  taskId: z.string(),
  status: z.enum(["To Do", "In Progress", "Blocked", "Done"])
});

const updateTaskSchema = z.object({
  cardId: z.string(),
  taskId: z.string(),
  title: z.string().min(2).optional(),
  dueDate: dueDateSchema.optional(),
  status: z.enum(["To Do", "In Progress", "Blocked", "Done"]).optional(),
  assigneeName: z.string().max(120).optional(),
  assigneeEmail: z.string().email().optional()
});

const deleteTaskSchema = z.object({
  cardId: z.string(),
  taskId: z.string()
});

const requireOperationsAccess = async () => {
  const access = await requireApiPrincipal();
  if ("error" in access) {
    return access;
  }
  const principal = toRbacPrincipal(access.principal);
  const allowed =
    canAccessModule(principal, "finance_governance_hub") ||
    canAccessModule(principal, "project_governance_hub") ||
    canAccessModule(principal, "project_management_hub") ||
    canAccessModule(principal, "user_admin");
  if (!allowed) {
    return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }
  return access;
};

export async function POST(request: Request) {
  const access = await requireOperationsAccess();
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json();
  const parsed = addTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const card = await addTask(
    parsed.data.cardId,
    parsed.data.title,
    parsed.data.dueDate,
    parsed.data.assigneeName,
    parsed.data.assigneeEmail
  );
  if (!card) {
    return NextResponse.json({ message: "Card not found" }, { status: 404 });
  }

  return NextResponse.json({ data: card });
}

export async function PATCH(request: Request) {
  const access = await requireOperationsAccess();
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json();

  const statusParsed = updateStatusSchema.safeParse(body);
  if (statusParsed.success) {
    const cards = await listBoardCards();
    const cardRecord = cards.find((card) => card.id === statusParsed.data.cardId);
    if (!cardRecord) {
      return NextResponse.json({ message: "Card not found" }, { status: 404 });
    }

    if (
      cardRecord.lane === "Project Governance" &&
      statusParsed.data.status === "In Progress" &&
      cardRecord.characteristicsUpdated !== true
    ) {
      return NextResponse.json(
        { message: "Update Characteristics first. The governance task moves to In Progress after save." },
        { status: 400 }
      );
    }

    const card = await updateTaskStatus(statusParsed.data.cardId, statusParsed.data.taskId, statusParsed.data.status);
    if (!card) {
      return NextResponse.json({ message: "Card not found" }, { status: 404 });
    }
    return NextResponse.json({ data: card });
  }

  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const card = await editTask(parsed.data.cardId, parsed.data.taskId, {
    title: parsed.data.title,
    dueDate: parsed.data.dueDate,
    status: parsed.data.status,
    assigneeName: parsed.data.assigneeName,
    assigneeEmail: parsed.data.assigneeEmail
  });

  if (!card) {
    return NextResponse.json({ message: "Card not found" }, { status: 404 });
  }

  return NextResponse.json({ data: card });
}

export async function DELETE(request: Request) {
  const access = await requireOperationsAccess();
  if ("error" in access) {
    return access.error;
  }

  const body = await request.json();
  const parsed = deleteTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const card = await removeTask(parsed.data.cardId, parsed.data.taskId);
  if (!card) {
    return NextResponse.json({ message: "Card not found" }, { status: 404 });
  }

  return NextResponse.json({ data: card });
}

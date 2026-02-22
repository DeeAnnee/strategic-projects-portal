import { z } from "zod";

const changeTypeEnum = z.enum([
  "SCOPE_CHANGE",
  "SCHEDULE_CHANGE",
  "BUDGET_CHANGE",
  "BENEFITS_CHANGE",
  "RESOURCE_CHANGE",
  "RISK_RECLASSIFICATION",
  "TECHNICAL_CHANGE",
  "OTHER"
]);

const changePriorityEnum = z.enum(["Low", "Medium", "High", "Urgent"]);
const impactRiskEnum = z.enum(["Low", "Medium", "High", "Critical"]);

export const createChangeRequestSchema = z.object({
  projectId: z.string().min(1).max(120),
  changeType: changeTypeEnum,
  title: z.string().trim().min(3).max(240),
  description: z.string().trim().min(3).max(5000),
  justification: z.string().trim().min(3).max(5000),
  impactScope: z.string().trim().min(1).max(5000),
  impactScheduleDays: z.coerce.number().int().min(-3650).max(3650),
  impactBudgetDelta: z.coerce.number().min(-10_000_000_000).max(10_000_000_000),
  impactBenefitsDelta: z.coerce.number().min(-10_000_000_000).max(10_000_000_000),
  impactRiskLevel: impactRiskEnum,
  priority: changePriorityEnum,
  requiresCommitteeReview: z.boolean().optional(),
  decisionSummary: z.string().trim().max(5000).optional(),
  fieldChanges: z
    .array(
      z.object({
        fieldName: z.string().trim().min(1).max(200),
        newValue: z.unknown()
      })
    )
    .min(1)
    .max(100),
  comments: z
    .array(
      z.object({
        comment: z.string().trim().min(1).max(3000)
      })
    )
    .max(100)
    .optional(),
  attachments: z
    .array(
      z.object({
        fileName: z.string().trim().min(1).max(260),
        fileUrl: z.string().trim().min(1).max(4000),
        mimeType: z.string().trim().max(200).optional()
      })
    )
    .max(100)
    .optional()
});

export const decideChangeRequestSchema = z.object({
  comment: z.string().trim().max(3000).optional()
});

export const rejectChangeRequestSchema = z.object({
  comment: z.string().trim().min(1).max(3000)
});

export const implementChangeRequestSchema = z.object({
  closeAfterImplement: z.boolean().optional()
});

export const addChangeCommentSchema = z.object({
  comment: z.string().trim().min(1).max(3000)
});

export const addChangeAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(260),
  fileUrl: z.string().trim().min(1).max(4000),
  mimeType: z.string().trim().max(200).optional()
});

export const changeRequestQuerySchema = z.object({
  projectId: z.string().trim().max(120).optional()
});

export type CreateChangeRequestPayload = z.infer<typeof createChangeRequestSchema>;

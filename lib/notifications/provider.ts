import { queueOutboundMessage } from "@/lib/notifications/outbox";
import { addNotification } from "@/lib/notifications/store";
import { isStagingAppEnv } from "@/lib/runtime/app-env";
import type { ApprovalRequestRecord, ProjectSubmission } from "@/lib/submissions/types";

export type WorkflowNotification = {
  toEmail?: string;
  title: string;
  body: string;
  href?: string;
  attachmentHref?: string;
};

export interface WorkflowNotificationProvider {
  sendInApp(notification: WorkflowNotification): Promise<void>;
  sendOutlook(notification: WorkflowNotification): Promise<void>;
  sendTeams(notification: WorkflowNotification): Promise<void>;
}

class JsonWorkflowNotificationProvider implements WorkflowNotificationProvider {
  private readonly stagingEmailSink = (() => {
    const configured = (process.env.STAGING_NOTIFICATION_EMAIL ?? "").trim().toLowerCase();
    return configured || "staging-notifications@test.com";
  })();

  private readonly stagingTeamsMode = (process.env.STAGING_TEAMS_MODE ?? "disabled").trim().toLowerCase();

  private readonly stagingTeamsSink = (process.env.STAGING_TEAMS_RECIPIENT ?? "").trim().toLowerCase();

  private formatStagingBody(originalRecipient: string, body: string) {
    return `[STAGING REDIRECT] Intended recipient: ${originalRecipient}\n${body}`;
  }

  async sendInApp(notification: WorkflowNotification) {
    await addNotification({
      title: notification.title,
      body: notification.body,
      href: notification.href ?? "/submissions",
      recipientEmail: notification.toEmail
    });
  }

  async sendOutlook(notification: WorkflowNotification) {
    if (!notification.toEmail) return;
    const requestedRecipient = notification.toEmail.trim().toLowerCase();
    const recipient = isStagingAppEnv() ? this.stagingEmailSink : requestedRecipient;
    const body =
      isStagingAppEnv() && requestedRecipient !== this.stagingEmailSink
        ? this.formatStagingBody(requestedRecipient, notification.body)
        : notification.body;

    await queueOutboundMessage({
      channel: "email",
      to: recipient,
      subject: notification.title,
      body,
      href: notification.href,
      attachmentHref: notification.attachmentHref
    });
  }

  async sendTeams(notification: WorkflowNotification) {
    if (!notification.toEmail) return;
    const requestedRecipient = notification.toEmail.trim().toLowerCase();

    if (isStagingAppEnv()) {
      if (this.stagingTeamsMode !== "redirect") {
        return;
      }

      const recipient = this.stagingTeamsSink || this.stagingEmailSink;
      await queueOutboundMessage({
        channel: "teams",
        to: recipient,
        subject: notification.title,
        body: this.formatStagingBody(requestedRecipient, notification.body),
        href: notification.href,
        attachmentHref: notification.attachmentHref
      });
      return;
    }

    await queueOutboundMessage({
      channel: "teams",
      to: requestedRecipient,
      subject: notification.title,
      body: notification.body,
      href: notification.href,
      attachmentHref: notification.attachmentHref
    });
  }
}

export const workflowNotificationProvider: WorkflowNotificationProvider =
  new JsonWorkflowNotificationProvider();

const formatRoleContext = (roleContext: ApprovalRequestRecord["roleContext"]) => {
  if (roleContext === "BUSINESS_SPONSOR") return "Business Sponsor";
  if (roleContext === "BUSINESS_DELEGATE") return "Business Delegate";
  if (roleContext === "FINANCE_SPONSOR") return "Finance Sponsor";
  if (roleContext === "TECH_SPONSOR") return "Technology Sponsor";
  if (roleContext === "PROJECT_MANAGER") return "Project Manager";
  return "Benefits Sponsor";
};

export const notifyApprovalRequestCreated = async (
  submission: ProjectSubmission,
  request: ApprovalRequestRecord
) => {
  const href = `/approvals`;
  const title = `${submission.id} approval request`;
  const body = `Approval required as ${formatRoleContext(request.roleContext)} for ${submission.title}.`;

  await workflowNotificationProvider.sendInApp({
    toEmail: request.approverEmail,
    title,
    body,
    href,
    attachmentHref: `/api/reports/pdf?id=${encodeURIComponent(submission.id)}&mode=intake-summary`
  });
  await workflowNotificationProvider.sendOutlook({
    toEmail: request.approverEmail,
    title,
    body,
    href,
    attachmentHref: `/api/reports/pdf?id=${encodeURIComponent(submission.id)}&mode=intake-summary`
  });
  await workflowNotificationProvider.sendTeams({
    toEmail: request.approverEmail,
    title,
    body,
    href,
    attachmentHref: `/api/reports/pdf?id=${encodeURIComponent(submission.id)}&mode=intake-summary`
  });
};

export const notifyWorkflowEvent = async (notification: WorkflowNotification) => {
  await workflowNotificationProvider.sendInApp(notification);
};

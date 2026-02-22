import MyApprovals from "@/components/approvals/my-approvals";
import { getSessionOrRedirect } from "@/lib/auth/session";

export default async function ApprovalsPage() {
  await getSessionOrRedirect("projects");

  return <MyApprovals />;
}

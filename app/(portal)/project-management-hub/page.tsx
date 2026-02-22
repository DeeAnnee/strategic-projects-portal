import PmExecutiveDashboard from "@/components/project-management/pm-executive-dashboard";
import { getSessionOrRedirect } from "@/lib/auth/session";

export default async function ProjectManagementHubPage() {
  const session = await getSessionOrRedirect("project_management_hub");
  const canAssignProjectManagers = session.user.roleType === "ADMIN";

  return (
    <PmExecutiveDashboard canAssignProjectManagers={canAssignProjectManagers} />
  );
}

import ModernDashboard from "@/components/dashboard/modern-dashboard";
import { filterSubmissionsByAccess } from "@/lib/auth/project-access";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { listSubmissions } from "@/lib/submissions/store";

export default async function DashboardPage() {
  const session = await getSessionOrRedirect("dashboard");
  const submissions = filterSubmissionsByAccess(session.user, await listSubmissions(), "dashboard");

  return (
    <ModernDashboard
      submissions={submissions}
      userName={session.user.name}
      role={session.user.roleType}
    />
  );
}

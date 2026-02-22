import OperationsBoard from "@/components/operations/operations-board";
import { filterSubmissionsByAccess } from "@/lib/auth/project-access";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { listBoardCards } from "@/lib/operations/store";
import { listSubmissions } from "@/lib/submissions/store";

export default async function FinanceHubPage() {
  const session = await getSessionOrRedirect("finance_governance_hub");
  const visibleProjectIds = new Set(
    filterSubmissionsByAccess(session.user, await listSubmissions(), "dashboard").map((item) => item.id)
  );
  const cards = (await listBoardCards()).filter((card) => visibleProjectIds.has(card.projectId));

  return <OperationsBoard cards={cards} userName={session.user.name} mode="finance" />;
}

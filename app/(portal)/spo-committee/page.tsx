import SpoCommitteeHub from "@/components/operations/spo-committee-hub";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { listSpoCommitteeState } from "@/lib/spo-committee/store";

export default async function SpoCommitteeHubPage() {
  await getSessionOrRedirect("spo_committee_hub");
  const data = await listSpoCommitteeState();

  return <SpoCommitteeHub initialData={data} />;
}

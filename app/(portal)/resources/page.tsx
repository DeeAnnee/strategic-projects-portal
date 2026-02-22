import ResourcesPageClient from "@/components/resources/resources-page";
import { getSessionOrRedirect } from "@/lib/auth/session";

export default async function ResourcesPage() {
  await getSessionOrRedirect("projects");

  return <ResourcesPageClient />;
}

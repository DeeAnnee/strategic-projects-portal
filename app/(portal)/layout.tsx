import PortalShell from "@/components/portal-shell";
import { getSessionOrRedirect } from "@/lib/auth/session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionOrRedirect();

  return <PortalShell session={session}>{children}</PortalShell>;
}

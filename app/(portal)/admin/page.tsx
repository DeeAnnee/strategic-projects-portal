import AdminConsole from "@/components/admin/admin-console";
import { requireModuleAccess } from "@/lib/auth/session";

export default async function AdminPage() {
  await requireModuleAccess("user_admin");

  return <AdminConsole />;
}

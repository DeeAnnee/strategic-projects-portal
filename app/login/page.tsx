import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import LoginForm from "@/components/login-form";
import { authOptions } from "@/lib/auth/options";
import { isStagingAppEnv } from "@/lib/runtime/app-env";
import { LOCAL_DEMO_ACCOUNTS, STAGING_TEST_ACCOUNTS } from "@/lib/staging/test-accounts";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  }

  const isStaging = isStagingAppEnv();
  const demoAccounts = (isStaging ? STAGING_TEST_ACCOUNTS : LOCAL_DEMO_ACCOUNTS).map((account) => ({
    label: account.name,
    email: account.email,
    password: account.password
  }));
  const defaultEmail = isStaging ? "admin@test.com" : "admin@portal.local";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <LoginForm defaultEmail={defaultEmail} demoAccounts={demoAccounts} showStagingGuide={isStaging} />
    </div>
  );
}

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import LoginForm from "@/components/login-form";
import { authOptions } from "@/lib/auth/options";
import { isStagingAppEnv } from "@/lib/runtime/app-env";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  }

  const isStaging = isStagingAppEnv();
  const defaultEmail = "";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <LoginForm defaultEmail={defaultEmail} showStagingGuide={isStaging} />
    </div>
  );
}

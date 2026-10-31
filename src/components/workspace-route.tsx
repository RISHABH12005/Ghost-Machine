import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { openSession, SESSION_COOKIE } from "@/lib/github-session";
import RepoPilotDashboard from "@/components/repo-pilot-dashboard";

export const dynamic = "force-dynamic";

export default async function WorkspaceRoute() {
  const cookieStore = await cookies();
  const session = openSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/");
  return <RepoPilotDashboard />;
}

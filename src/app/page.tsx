import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { openSession, SESSION_COOKIE } from "@/lib/github-session";
import LoginPage from "@/components/login-page";
import RepoPilotDashboard from "@/components/repo-pilot-dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const cookieStore = await cookies();
  const session = openSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return <LoginPage />;
  return <RepoPilotDashboard />;
}

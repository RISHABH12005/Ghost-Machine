import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { openSession, SESSION_COOKIE } from "@/lib/auth/github-session";
import LoginPage from "@/components/auth/login-page";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const cookieStore = await cookies();
  const session = openSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (session) redirect("/dashboard");
  return <LoginPage />;
}

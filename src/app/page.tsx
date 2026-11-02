import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { openSession, SESSION_COOKIE } from "@/lib/auth/github-session";
import LoginPage from "@/components/auth/login-page";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const session = openSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (session) redirect("/dashboard");
  const params = await searchParams;
  const authError = typeof params.auth_error === "string" ? params.auth_error : "";
  return <LoginPage initialAuthError={authError} />;
}

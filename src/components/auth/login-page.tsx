import { Github, ShieldCheck, Sparkles, BarChart3 } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090d13] px-5 py-12 text-[#e6edf3]">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #1f6feb33, transparent 35%), radial-gradient(circle at 80% 75%, #8957e522, transparent 35%)" }} />
      <section className="relative w-full max-w-md rounded-2xl border border-[#30363d] bg-[#0d1117]/95 p-7 shadow-2xl sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f0f6fc] text-[#0d1117]"><Github size={29} /></div>
          <div><p className="text-xl font-semibold tracking-tight">RepoPilot</p><p className="text-sm text-[#8b949e]">Your GitHub command center</p></div>
        </div>
        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b949e]">Welcome back</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in to your workspace</h1>
          <p className="mt-3 text-sm leading-6 text-[#8b949e]">Connect GitHub to review repositories, track progress, and get AI-powered project suggestions.</p>
        </div>
        <a href="/api/auth/github" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#238636] px-4 text-sm font-semibold text-white transition hover:bg-[#2ea043]"><Github size={18} /> Continue with GitHub</a>
        <div className="mt-7 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3 text-center"><ShieldCheck className="mx-auto text-[#3fb950]" size={18}/><p className="mt-2 text-xs text-[#8b949e]">Private access</p></div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3 text-center"><BarChart3 className="mx-auto text-[#79c0ff]" size={18}/><p className="mt-2 text-xs text-[#8b949e]">Project insights</p></div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3 text-center"><Sparkles className="mx-auto text-[#d2a8ff]" size={18}/><p className="mt-2 text-xs text-[#8b949e]">AI suggestions</p></div>
        </div>
        <p className="mt-7 text-center text-xs leading-5 text-[#6e7681]">RepoPilot uses GitHub OAuth. Your GitHub password is never shared with this app.</p>
      </section>
    </main>
  );
}

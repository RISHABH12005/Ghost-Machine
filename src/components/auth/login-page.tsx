"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  Github,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const FEATURES = [
  {
    id: "privacy",
    title: "Private access",
    short: "Your repositories stay yours",
    detail: "Connect through GitHub OAuth. RepoPilot never asks for or stores your GitHub password.",
    icon: ShieldCheck,
    color: "text-[#3fb950]",
    accent: "border-[#238636]/40 bg-[#238636]/10",
  },
  {
    id: "insights",
    title: "Project insights",
    short: "See what needs attention",
    detail: "Review repository activity, issues, pull requests, and workflow health from one workspace.",
    icon: BarChart3,
    color: "text-[#79c0ff]",
    accent: "border-[#1f6feb]/40 bg-[#1f6feb]/10",
  },
  {
    id: "ai",
    title: "AI suggestions",
    short: "Choose your next move",
    detail: "Ask questions about your repositories, summarize projects, and get suggestions for next steps.",
    icon: Sparkles,
    color: "text-[#d2a8ff]",
    accent: "border-[#8957e5]/40 bg-[#8957e5]/10",
  },
] as const;

const AUTH_ERRORS: Record<string, string> = {
  oauth_not_configured: "GitHub sign-in is not fully configured on the server. Please contact the app administrator.",
  oauth_state_invalid: "The sign-in request expired or could not be verified. Please try again.",
  oauth_exchange_failed: "GitHub could not complete the sign-in exchange. Please try again.",
  github_profile_failed: "RepoPilot could not retrieve your GitHub profile. Please try again.",
};

export default function LoginPage() {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("auth_error");
    if (reason) {
      setAuthError(AUTH_ERRORS[reason] || "GitHub sign-in did not complete. Please try again.");
      params.delete("auth_error");
      const query = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
    }
  }, []);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090d13] px-4 py-8 text-[#e6edf3] sm:px-5 sm:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[#1f6feb]/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 -right-40 h-[30rem] w-[30rem] rounded-full bg-[#8957e5]/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, #1f6feb33, transparent 35%), radial-gradient(circle at 80% 75%, #8957e522, transparent 35%)",
        }}
      />

      <section className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#30363d] bg-[#0d1117]/95 p-6 shadow-[0_24px_90px_rgba(0,0,0,.45)] transition duration-300 hover:border-[#484f58] sm:p-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#8957e5]/70 to-transparent"
        />

        <div className="mb-8 flex items-center gap-3">
          <div className="group flex h-12 w-12 items-center justify-center rounded-xl bg-[#f0f6fc] text-[#0d1117] shadow-lg transition duration-300 hover:rotate-[-6deg] hover:scale-105">
            <Github size={29} />
          </div>
          <div>
            <p className="text-xl font-semibold tracking-tight">RepoPilot</p>
            <p className="text-sm text-[#8b949e]">Your GitHub command center</p>
          </div>
          <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-[#238636]/30 bg-[#238636]/10 px-2.5 py-1 text-[10px] font-medium text-[#3fb950] sm:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3fb950]" />
            Ready to connect
          </span>
        </div>

        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b794f6]">Welcome back</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[2rem]">
            Sign in to your workspace
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#8b949e]">
            Connect GitHub to review repositories, track progress, and get AI-powered project suggestions.
          </p>
        </div>

        {authError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#da3633]/45 bg-[#da3633]/10 px-3.5 py-3 text-sm leading-5 text-[#ff7b72]"
          >
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#f85149]" />
            <span>{authError}</span>
          </div>
        )}

        <a
          href="/api/auth/github"
          aria-busy={isRedirecting}
          onClick={() => setIsRedirecting(true)}
          className="group relative flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-[#238636] px-4 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(35,134,54,.18)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#2ea043] hover:shadow-[0_12px_30px_rgba(35,134,54,.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3fb950] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1117] active:translate-y-0 motion-reduce:transform-none"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full"
          />
          {isRedirecting ? (
            <>
              <LoaderCircle size={18} className="animate-spin" />
              Redirecting to GitHub…
            </>
          ) : (
            <>
              <Github size={18} />
              Continue with GitHub
              <ArrowUpRight size={15} className="ml-1 opacity-70 transition duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
            </>
          )}
        </a>
        <p className="mt-2 min-h-4 text-center text-[10px] text-[#6e7681]" aria-live="polite">
          {isRedirecting ? "Opening GitHub authorization…" : "You’ll review and approve access on GitHub."}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            const selected = activeFeature === feature.id;
            return (
              <button
                key={feature.id}
                type="button"
                aria-expanded={selected}
                aria-controls={`feature-detail-${feature.id}`}
                onClick={() => setActiveFeature(selected ? null : feature.id)}
                className={`group min-h-[88px] rounded-xl border p-3 text-center transition duration-200 hover:-translate-y-0.5 hover:bg-[#1c2129] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8957e5]/80 motion-reduce:transform-none ${selected ? feature.accent : "border-[#30363d] bg-[#161b22] hover:border-[#484f58]"}`}
              >
                <Icon
                  className={`mx-auto transition duration-200 group-hover:scale-110 ${feature.color}`}
                  size={19}
                />
                <span className="mt-2 block text-xs font-medium text-[#c9d1d9]">{feature.title}</span>
                <span className="mt-1 block text-[10px] text-[#6e7681]">{feature.short}</span>
              </button>
            );
          })}
        </div>

        <div
          id={`feature-detail-${activeFeature || "none"}`}
          aria-live="polite"
          className={`overflow-hidden transition-all duration-200 ${activeFeature ? "mt-3 max-h-24 opacity-100" : "mt-0 max-h-0 opacity-0"}`}
        >
          {FEATURES.filter((feature) => feature.id === activeFeature).map((feature) => (
            <div key={feature.id} className="flex items-start gap-2 rounded-lg border border-[#30363d] bg-[#161b22]/70 px-3 py-2.5">
              <Check size={14} className={`mt-0.5 shrink-0 ${feature.color}`} />
              <p className="text-xs leading-5 text-[#9da7b3]">{feature.detail}</p>
              <button
                type="button"
                onClick={() => setActiveFeature(null)}
                aria-label="Close feature details"
                className="ml-auto rounded p-1 text-[#6e7681] transition hover:bg-[#30363d] hover:text-[#e6edf3]"
              >
                <ChevronDown size={13} className="rotate-180" />
              </button>
            </div>
          ))}
        </div>

        <p className="mt-7 text-center text-xs leading-5 text-[#6e7681]">
          RepoPilot uses GitHub OAuth. Your GitHub password is never shared with this app.
        </p>
      </section>
    </main>
  );
}

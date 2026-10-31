"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, AlertCircle, Bell, BookOpen, Check, CheckCircle2,
  CircleDot, Clock3, ExternalLink, Filter, FolderGit2,
  GitBranch, Github, LayoutDashboard, ListTodo, LoaderCircle, Menu,
  Search, Settings2, ShieldAlert, Sparkles, Star, X, Zap, PanelRightOpen, PanelRightClose,
} from "lucide-react";
import type { ProjectStatus, Repository, RepositoryImportResponse } from "@/types/repository";

type AiRepositorySummary = { summary: string; model: string; generatedAt: string; source: string; error?: string };
type AiProjectSuggestion = { id: number; status: ProjectStatus; priority: number; reason: string };
type AiOrganization = { projects: AiProjectSuggestion[]; model: string; generatedAt: string };
type RepositoryAssessment = { status: ProjectStatus; confidence: string; assessedAt: string; evidence: Array<{ kind: string; detail: string; url?: string; observedAt?: string }>; limitations?: string[]; error?: string };
const STATUS_OPTIONS: ProjectStatus[] = ["Not assessed", "Needs review", "In progress", "Needs attention", "Completed", "On hold"];
const STATUS_STYLES: Record<ProjectStatus, string> = {
  "Not assessed": "border-[#6e7681]/50 text-[#8b949e]",
  "Needs review": "border-[#8b949e]/40 text-[#c9d1d9]",
  "In progress": "border-[#1f6feb]/70 text-[#79c0ff]",
  "Needs attention": "border-[#d29922]/70 text-[#e3b341]",
  Completed: "border-[#238636]/70 text-[#3fb950]",
  "On hold": "border-[#6e7681]/50 text-[#8b949e]",
};
const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Repositories", icon: FolderGit2 },
  { label: "Work board", icon: ListTodo },
  { label: "Priorities", icon: Zap },
];

function relativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function StatusPill({ status }: { status: ProjectStatus }) {
  const Icon = status === "Completed" ? CheckCircle2 : status === "Needs attention" ? ShieldAlert : status === "In progress" ? CircleDot : status === "On hold" ? Clock3 : CircleDot;
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[status]}`}><Icon size={12} />{status}</span>;
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof FolderGit2 }) {
  return <div className="flex items-center gap-2.5"><span className="text-[#8b949e]"><Icon size={15} /></span><span className="text-sm text-[#8b949e]">{label}</span><span className="text-sm font-semibold tabular-nums text-[#e6edf3]">{value}</span></div>;
}

export default function RepoPilotDashboard() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All projects");
  const [username, setUsername] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSynced, setLastSynced] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Overview");
  const [activePanel, setActivePanel] = useState<"help" | "notifications" | "activity" | "settings" | null>(null);
  const [activity, setActivity] = useState<Array<{ id: string; message: string; time: string }>>([]);
  const [assessments, setAssessments] = useState<Record<number, RepositoryAssessment>>({});
  const [assessingId, setAssessingId] = useState<number | null>(null);
  const [githubUser, setGithubUser] = useState<{ login: string; avatarUrl?: string | null } | null>(null);
  const [aiSummaries, setAiSummaries] = useState<Record<number, AiRepositorySummary>>({});
  const [summarizingId, setSummarizingId] = useState<number | null>(null);
  const [organizationMode, setOrganizationMode] = useState<"manual" | "ai">("manual");
  const [aiOrganization, setAiOrganization] = useState<AiOrganization | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [contributionDays, setContributionDays] = useState<Array<{ date: string; contributionCount: number; contributionLevel: string }>>([]);
  const [totalContributions, setTotalContributions] = useState(0);
  const [contributionError, setContributionError] = useState("");

  const navigateTo = (label: string) => {
    const routes: Record<string, string> = {
      "Overview": "/dashboard",
      "Repositories": "/repositories",
      "Work board": "/work-board",
      "Priorities": "/priorities",
      "Activity history": "/activity",
      "Settings": "/settings",
    };
    setMobileMenuOpen(false);
    router.push(routes[label] || "/dashboard");
  };

  useEffect(() => {
    const page = pathname === "/repositories" ? "Repositories"
      : pathname === "/work-board" ? "Work board"
      : pathname === "/priorities" ? "Priorities"
      : pathname === "/activity" ? "Activity history"
      : pathname === "/settings" ? "Settings" : "Overview";
    setActiveNav(page);
    setFilter(page === "Work board" ? "In progress" : page === "Priorities" ? "Needs attention" : "All projects");
    if (page === "Overview") setQuery("");
  }, [pathname]);

  const importRepositories = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/repositories", { cache: "no-store" });
      const data = (await response.json()) as RepositoryImportResponse;
      if (!response.ok) {
        const retryAt = data.rateLimit?.retryAt ? ` Retry after ${new Date(data.rateLimit.retryAt).toLocaleTimeString()}.` : "";
        throw new Error((data.error || "Could not import repositories.") + retryAt);
      }
      const savedStatuses: Record<string, ProjectStatus> = {};
      try { Object.assign(savedStatuses, JSON.parse(localStorage.getItem(`repopilot-statuses:${data.username.toLowerCase()}`) || "{}")); } catch { /* Use defaults if local preferences are invalid. */ }
      const imported: Repository[] = data.repositories.map((repository) => ({
        ...repository,
        status: savedStatuses[String(repository.id)] || (repository.archived ? "On hold" : "Not assessed"),
        note: "",
      }));
      setRepositories(imported);
      setUsername(data.username);
      try {
        const savedOrganization = localStorage.getItem(`repopilot-ai-organization:${data.username.toLowerCase()}`);
        if (savedOrganization) {
          const parsed = JSON.parse(savedOrganization) as AiOrganization;
          if (Array.isArray(parsed.projects)) { setAiOrganization(parsed); setOrganizationMode("ai"); }
        } else { setAiOrganization(null); setOrganizationMode("manual"); }
        setSidebarCollapsed(localStorage.getItem(`repopilot-sidebar-collapsed:${data.username.toLowerCase()}`) === "true");
        setAiSidebarOpen(localStorage.getItem(`repopilot-ai-sidebar:${data.username.toLowerCase()}`) === "true");
      } catch { /* Keep safe defaults if saved preferences are malformed. */ }
      setLastSynced(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Repository import failed.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const session = await response.json() as { authenticated: boolean; user?: { login: string; avatarUrl?: string | null } };
        if (!active) return;
        if (session.authenticated && session.user) {
          setGithubUser(session.user);
          await importRepositories();
        } else {
          setGithubUser(null);
          setUsername("");
          setRepositories([]);
          setLoading(false);
        }
      } catch {
        if (active) setError("Unable to check your GitHub session. Please refresh and sign in again.");
      }
    })();
    return () => { active = false; };
  }, [importRepositories]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      const messages: Record<string, string> = {
        oauth_not_configured: "GitHub OAuth is not configured yet. Add the GitHub OAuth credentials and AUTH_SECRET to the deployment environment.",
        oauth_state_invalid: "GitHub sign-in could not be verified. Please try again.",
        oauth_exchange_failed: "GitHub sign-in failed while exchanging the authorization code. Please try again.",
        github_profile_failed: "GitHub sign-in succeeded, but the profile could not be loaded.",
      };
      setError(messages[authError] || "GitHub sign-in failed.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const organizeAllRepositories = async () => {
    if (!repositories.length) return;
    setOrganizing(true);
    setOrganizationError("");
    try {
      const response = await fetch("/api/ai/organize-repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositories }),
      });
      const result = await response.json() as AiOrganization & { error?: string };
      if (!response.ok) throw new Error(result.error || "AI organization failed.");
      setAiOrganization(result);
      setOrganizationMode("ai");
      try { localStorage.setItem(`repopilot-ai-organization:${username.toLowerCase()}`, JSON.stringify(result)); } catch { /* AI suggestions remain available for this session. */ }
    } catch (cause) {
      setOrganizationError(cause instanceof Error ? cause.message : "AI organization failed.");
    } finally { setOrganizing(false); }
  };

  const applyAllAiSuggestions = () => {
    if (!aiOrganization) return;
    const suggestions = new Map(aiOrganization.projects.map((item) => [item.id, item.status]));
    const updated = repositories.map((repository) => ({
      ...repository,
      status: suggestions.get(repository.id) || repository.status,
    }));
    setRepositories(updated);
    try {
      localStorage.setItem(`repopilot-statuses:${username.toLowerCase()}`, JSON.stringify(Object.fromEntries(updated.map((repository) => [String(repository.id), repository.status]))));
    } catch { /* Statuses still update for this session. */ }
    setActivity((items) => [{ id: `ai-apply-${Date.now()}`, message: `Applied AI status suggestions to ${aiOrganization.projects.length} repositories`, time: new Date().toLocaleString() }, ...items].slice(0, 50));
    setOrganizationMode("manual");
    try { localStorage.removeItem(`repopilot-ai-organization:${username.toLowerCase()}`); } catch { /* Saved statuses are already persisted above. */ }
  };

  const summarizeRepository = async (repository: Repository) => {
    const [owner, name] = repository.fullName.split("/");
    if (!owner || !name) return;
    setSummarizingId(repository.id);
    setAiSummaries((items) => { const next = { ...items }; delete next[repository.id]; return next; });
    try {
      const response = await fetch("/api/ai/repository-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo: name }),
      });
      const result = await response.json() as AiRepositorySummary;
      if (!response.ok) throw new Error(result.error || "AI summary failed.");
      setAiSummaries((items) => ({ ...items, [repository.id]: result }));
    } catch (error) {
      setAiSummaries((items) => ({ ...items, [repository.id]: { summary: "", model: "", generatedAt: new Date().toISOString(), source: "", error: error instanceof Error ? error.message : "AI summary failed." } }));
    } finally { setSummarizingId(null); }
  };

  const assessRepository = async (repository: Repository) => {
    const [owner, name] = repository.fullName.split("/");
    if (!owner || !name) return;
    setAssessingId(repository.id);
    try {
      const response = await fetch(`/api/repositories/assessment?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`, { cache: "no-store" });
      const result = (await response.json()) as RepositoryAssessment;
      if (!response.ok) throw new Error(result.error || "Could not assess repository.");
      setAssessments((items) => ({ ...items, [repository.id]: result }));
    } catch (error) {
      setAssessments((items) => ({ ...items, [repository.id]: { status: "Not assessed", confidence: "low", assessedAt: new Date().toISOString(), evidence: [], error: error instanceof Error ? error.message : "Assessment failed." } }));
    } finally { setAssessingId(null); }
  };

  const applyAssessment = (repository: Repository, assessment: RepositoryAssessment) => {
    if (assessment.status === "Not assessed") return;
    updateStatus(repository.id, assessment.status);
  };

  const updateStatus = (id: number, status: ProjectStatus) => {
    const previous = repositories.find((repository) => repository.id === id);
    const updated = repositories.map((repository) => repository.id === id ? { ...repository, status } : repository);
    if (previous && previous.status !== status) setActivity((items) => [{ id: `${id}-${Date.now()}`, message: `${previous.name}: ${previous.status} → ${status}`, time: new Date().toLocaleString() }, ...items].slice(0, 50));
    setRepositories(updated);
    try { localStorage.setItem(`repopilot-statuses:${username.toLowerCase()}`, JSON.stringify(Object.fromEntries(updated.map((repository) => [String(repository.id), repository.status])))); } catch { /* Status still updates for this session. */ }
  };

  const filteredRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = repositories.filter((repository) => {
      const matchesQuery = !normalizedQuery || [repository.name, repository.fullName, repository.description, repository.language, repository.defaultBranch, repository.topics.join(" ")].join(" ").toLowerCase().includes(normalizedQuery);
      const aiStatus = organizationMode === "ai" ? aiOrganization?.projects.find((item) => item.id === repository.id)?.status : undefined;
      return matchesQuery && (filter === "All projects" || (organizationMode === "ai" && aiStatus ? aiStatus : repository.status) === filter);
    });
    if (organizationMode === "ai" && aiOrganization) {
      const ranking = new Map(aiOrganization.projects.map((item) => [item.id, item]));
      return [...filtered].sort((a, b) => {
        const aSuggestion = ranking.get(a.id);
        const bSuggestion = ranking.get(b.id);
        return (aSuggestion?.priority ?? 6) - (bSuggestion?.priority ?? 6) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }
    return filtered;
  }, [query, filter, repositories, organizationMode, aiOrganization]);

  useEffect(() => {
    if (!githubUser) return;
    let active = true;
    void fetch("/api/dashboard/insights", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { totalContributions?: number; days?: Array<{ date: string; contributionCount: number; contributionLevel: string }>; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not load contribution history.");
        if (active) { setTotalContributions(result.totalContributions || 0); setContributionDays(result.days || []); setContributionError(""); }
      })
      .catch((cause) => { if (active) setContributionError(cause instanceof Error ? cause.message : "Contribution history unavailable."); });
    return () => { active = false; };
  }, [githubUser]);

  const toggleSidebar = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarCollapsed((current) => {
        const next = !current;
        try { localStorage.setItem(`repopilot-sidebar-collapsed:${username.toLowerCase()}`, String(next)); } catch {}
        return next;
      });
    } else setMobileMenuOpen((current) => !current);
  };

  const toggleAiSidebar = () => {
    setAiSidebarOpen((current) => {
      const next = !current;
      try { localStorage.setItem(`repopilot-ai-sidebar:${username.toLowerCase()}`, String(next)); } catch {}
      return next;
    });
  };

  const attentionCount = repositories.filter((repo) => repo.status === "Needs attention").length;
  const inProgressCount = repositories.filter((repo) => repo.status === "In progress").length;
  const completedCount = repositories.filter((repo) => repo.status === "Completed").length;
  const aiStatusById = new Map(aiOrganization?.projects.map((item) => [item.id, item.status]) || []);
  const statusCounts = STATUS_OPTIONS.map((status) => ({
    status,
    count: repositories.filter((repo) => (organizationMode === "ai" ? aiStatusById.get(repo.id) || repo.status : repo.status) === status).length,
  }));
  const activeOnGitHubCount = repositories.filter((repo) => repo.pushedAt && Date.now() - new Date(repo.pushedAt).getTime() <= 30 * 86_400_000).length;
  const maxStatusCount = Math.max(1, ...statusCounts.map((item) => item.count));
  const contributionLine = useMemo(() => {
    if (contributionDays.length < 2) return "";
    const max = Math.max(1, ...contributionDays.map((day) => day.contributionCount));
    return contributionDays.map((day, index) => {
      const x = 12 + (index / (contributionDays.length - 1)) * 736;
      const y = 184 - (day.contributionCount / max) * 160;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [contributionDays]);
  const isOverviewPage = pathname === "/dashboard" || pathname === "/";
  const isRepositoryPage = ["/repositories", "/work-board", "/priorities"].includes(pathname);
  const isActivityPage = pathname === "/activity";
  const isSettingsPage = pathname === "/settings";

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {mobileMenuOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-[#30363d] bg-[#0d1117] px-3 py-4 transition-all lg:translate-x-0 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"} ${sidebarCollapsed ? "lg:w-[76px]" : "lg:w-[260px]"}`}>
        <div className={`flex items-center gap-2 px-2 pb-4 ${sidebarCollapsed ? "lg:justify-center" : ""}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f0f6fc] text-[#0d1117]"><Github size={22} /></div>
          {(!sidebarCollapsed || mobileMenuOpen) && <div className="min-w-0"><p className="text-sm font-semibold text-[#f0f6fc]">RepoPilot</p><p className="text-xs text-[#8b949e]">Your repository workspace</p></div>}
          <button className="ml-auto rounded-md p-1.5 text-[#8b949e] hover:bg-[#21262d] lg:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"><X size={17} /></button>
        </div>
        <div className="border-b border-[#30363d] px-2 pb-4">
          <a href={`https://github.com/${username}`} target="_blank" rel="noreferrer" title="View GitHub profile" className={`flex items-center gap-2 rounded-md border border-[#30363d] bg-[#161b22] px-2.5 py-2 text-sm hover:border-[#8b949e] ${sidebarCollapsed ? "lg:justify-center" : ""}`}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#30363d] text-[10px] font-semibold">{username.slice(0,2).toUpperCase()}</span>
            {(!sidebarCollapsed || mobileMenuOpen) && <><span className="min-w-0 flex-1 truncate">{username}</span><ExternalLink size={13} className="text-[#8b949e]" /></>}
          </a>
          {(!sidebarCollapsed || mobileMenuOpen) && <a href={`https://github.com/${username}?tab=repositories`} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 px-1 text-xs text-[#8b949e] hover:text-[#58a6ff]"><FolderGit2 size={13}/> Browse all GitHub repositories <ExternalLink size={11}/></a>}
        </div>
        {(!sidebarCollapsed || mobileMenuOpen) && <div className="mt-5 px-2 text-xs font-semibold text-[#8b949e]">Workspace</div>}
        <nav className="mt-2 space-y-1">
          {navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => navigateTo(label)} className={`flex w-full items-center gap-2.5 rounded-md border-l-2 px-2.5 py-2 text-left text-sm transition ${activeNav === label ? "border-l-[#f78166] bg-[#161b22] font-semibold text-[#f0f6fc]" : "border-l-transparent text-[#c9d1d9] hover:bg-[#161b22]"}`}><Icon size={16} className={activeNav === label ? "text-[#f0f6fc]" : "text-[#8b949e]"} />{(!sidebarCollapsed || mobileMenuOpen) && label}{label === "Priorities" && attentionCount > 0 && <span className={`rounded-full bg-[#d29922]/15 px-2 py-0.5 text-xs text-[#e3b341] ${sidebarCollapsed ? "lg:ml-0 ml-auto" : "ml-auto"}`}>{attentionCount}</span>}</button>)}
        </nav>
        {(!sidebarCollapsed || mobileMenuOpen) && <div className="mt-6 px-2 text-xs font-semibold text-[#8b949e]">Personal</div>}
        <nav className="mt-2 space-y-1">
          <button onClick={() => navigateTo("Activity history")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#c9d1d9] hover:bg-[#161b22]" title="Activity history"><Activity size={16} className="text-[#8b949e]" />{(!sidebarCollapsed || mobileMenuOpen) && "Activity history"}</button>
          <button onClick={() => navigateTo("Settings")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#c9d1d9] hover:bg-[#161b22]" title="Settings"><Settings2 size={16} className="text-[#8b949e]" />{(!sidebarCollapsed || mobileMenuOpen) && "Settings"}</button>
        </nav>
      </aside>

      <main className={`min-h-screen transition-all ${sidebarCollapsed ? "lg:pl-[76px]" : "lg:pl-[260px]"}`}>
        <header className="sticky top-0 z-20 flex min-h-[64px] items-center justify-between gap-3 border-b border-[#30363d] bg-[#010409]/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button aria-label="Toggle navigation" title="Toggle navigation" onClick={toggleSidebar} className="rounded-md border border-[#30363d] p-2 text-[#c9d1d9] hover:bg-[#21262d]"><Menu size={17} /></button>
            <div className="hidden items-center gap-2 text-sm sm:flex"><Github size={19} /><span className="text-[#8b949e]">/</span><span className="font-semibold">{username}</span><span className="text-[#8b949e]">/</span><span className="truncate text-[#8b949e]">{activeNav}</span></div>
            <span className="truncate text-sm font-semibold sm:hidden">RepoPilot / {activeNav}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button title="AI suggestions" aria-label="Toggle AI suggestions" onClick={toggleAiSidebar} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${aiSidebarOpen ? "border-[#8957e5]/70 bg-[#8957e5]/15 text-[#d2a8ff]" : "border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d]"}`}>{aiSidebarOpen ? <PanelRightClose size={15}/> : <PanelRightOpen size={15}/>}<span className="hidden sm:inline">AI suggestions</span></button>
            <button title="Notifications" aria-label="Notifications" onClick={() => setActivePanel("notifications")} className="relative rounded-md p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"><Bell size={17} />{attentionCount > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#e3b341]" />}</button>
            <a href="/api/auth/github" className="ml-1 inline-flex items-center gap-2 rounded-md border border-[#238636] bg-[#238636] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#2ea043] sm:px-3 sm:text-sm"><Github size={15} /><span>{githubUser ? `@${githubUser.login}` : "Sign in with GitHub"}</span></a>{githubUser && <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }} className="rounded-md border border-[#30363d] px-2.5 py-1.5 text-xs hover:bg-[#21262d]">Sign out</button>}<a href={`https://github.com/${username}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#21262d] px-2.5 py-1.5 text-xs hover:border-[#8b949e]"><span className="hidden sm:inline">View profile</span><ExternalLink size={12} /></a>
          </div>
        </header>

        {aiSidebarOpen && <><button aria-label="Close AI suggestions" onClick={toggleAiSidebar} className="fixed inset-0 z-30 bg-black/40 lg:bg-transparent" /><aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[390px] overflow-y-auto border-l border-[#30363d] bg-[#0d1117] p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#d2a8ff]">RepoPilot AI</p><h2 className="mt-1 text-lg font-semibold">Project suggestions</h2><p className="mt-1 text-xs leading-5 text-[#8b949e]">Prioritized recommendations based on GitHub repository metadata.</p></div><button onClick={toggleAiSidebar} aria-label="Hide AI suggestions" className="rounded-md p-2 text-[#8b949e] hover:bg-[#21262d]"><X size={16}/></button></div>
          {aiOrganization ? <><div className="mt-4 flex items-center justify-between rounded-md border border-[#30363d] bg-[#161b22] p-3"><div><p className="text-xs text-[#8b949e]">Last organized</p><p className="mt-1 text-sm">{relativeDate(aiOrganization.generatedAt)}</p></div><button onClick={() => void organizeAllRepositories()} disabled={organizing} className="rounded-md border border-[#8957e5]/60 px-2.5 py-1.5 text-xs text-[#d2a8ff] disabled:opacity-50">{organizing ? "Updating…" : "Refresh"}</button></div><div className="mt-4 space-y-2">{[...aiOrganization.projects].sort((a,b)=>a.priority-b.priority).map((suggestion) => { const repo = repositories.find((item) => item.id === suggestion.id); if (!repo) return null; return <article key={suggestion.id} className="rounded-md border border-[#30363d] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><a href={repo.url} target="_blank" rel="noreferrer" className="break-all text-sm font-medium text-[#58a6ff] hover:underline">{repo.name}</a><p className="mt-1 text-xs leading-5 text-[#8b949e]">{suggestion.reason}</p></div><span className="shrink-0 rounded-full border border-[#8957e5]/50 px-2 py-0.5 text-[10px] text-[#d2a8ff]">P{suggestion.priority}</span></div><div className="mt-2 flex items-center justify-between gap-2"><StatusPill status={suggestion.status}/><button onClick={() => updateStatus(repo.id,suggestion.status)} className="text-xs text-[#3fb950] hover:underline">Apply</button></div></article>; })}</div><button onClick={applyAllAiSuggestions} className="mt-4 w-full rounded-md bg-[#238636] px-3 py-2 text-sm font-medium text-white hover:bg-[#2ea043]">Apply all suggestions</button></> : <div className="mt-5 rounded-md border border-dashed border-[#30363d] p-5"><Sparkles size={20} className="text-[#d2a8ff]"/><p className="mt-3 text-sm font-medium">No AI suggestions yet</p><p className="mt-1 text-xs leading-5 text-[#8b949e]">Run AI organization once. Your suggestions will be saved automatically and available here next time.</p><button onClick={() => void organizeAllRepositories()} disabled={organizing || !repositories.length} className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#8957e5]/60 bg-[#8957e5]/10 px-3 py-2 text-xs text-[#d2a8ff] disabled:opacity-50">{organizing ? <LoaderCircle size={13} className="animate-spin"/> : <Sparkles size={13}/>} {organizing ? "Analyzing repositories…" : "Generate suggestions"}</button>{organizationError && <p className="mt-3 text-xs text-[#ff7b72]">{organizationError}</p>}</div>}
          <p className="mt-5 text-[11px] leading-5 text-[#6e7681]">AI recommendations use repository metadata. They do not inspect source code or change manual statuses unless you apply them.</p>
        </aside></>}

        {activePanel && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="panel-title" className="w-full max-w-lg rounded-xl border border-[#30363d] bg-[#0d1117] p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-[#8b949e]">REPOPILOT WORKSPACE</p><h2 id="panel-title" className="mt-2 text-xl font-semibold">{activePanel === "help" ? "How to use RepoPilot" : activePanel === "notifications" ? "Notifications" : activePanel === "activity" ? "Activity history" : "Settings"}</h2></div><button onClick={() => setActivePanel(null)} aria-label="Close dialog" className="rounded-md p-1.5 text-[#8b949e] hover:bg-[#21262d]"><X size={17} /></button></div>
          {activePanel === "help" ? <div className="mt-5 space-y-3 text-sm leading-6 text-[#c9d1d9]"><p><strong>Import repositories:</strong> sign in with GitHub; your repositories load automatically.</p><p><strong>Search and filter:</strong> search by repository name, description, language, branch, or topic.</p><p><strong>Track progress:</strong> change a repository status. It is saved in this browser for that username.</p><p><strong>AI summaries:</strong> use the AI summary action on a repository to request an Ollama Cloud analysis. It uses repository metadata, issues, pull requests, and recent workflow runs—not source code.</p></div> : activePanel === "notifications" ? <div className="mt-5"><p className="text-sm text-[#8b949e]">{attentionCount ? `${attentionCount} project(s) marked for attention.` : "You have no projects marked as needing attention."}</p><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{repositories.filter((repo) => repo.status === "Needs attention").map((repo) => <a key={repo.id} href={repo.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-md border border-[#30363d] p-3 text-sm hover:bg-[#161b22]">{repo.name}<ExternalLink size={14} /></a>)}</div><button onClick={() => { setActivePanel(null); navigateTo("Priorities"); }} className="mt-4 rounded-md bg-[#238636] px-3 py-2 text-sm font-medium text-white hover:bg-[#2ea043]">View priorities</button></div> : activePanel === "activity" ? <div className="mt-5">{activity.length ? <ol className="max-h-80 space-y-3 overflow-y-auto">{activity.map((item) => <li key={item.id} className="border-l border-[#30363d] pl-3"><p className="text-sm">{item.message}</p><p className="mt-1 text-xs text-[#8b949e]">{item.time}</p></li>)}</ol> : <p className="rounded-md border border-dashed border-[#30363d] p-5 text-sm text-[#8b949e]">No status changes in this session yet.</p>}</div> : <div className="mt-5 space-y-4"><div className="rounded-md border border-[#30363d] p-3"><p className="text-sm font-medium">Connected GitHub account</p><p className="mt-1 text-xs text-[#8b949e]">{githubUser ? `Signed in as @${githubUser.login}. Repositories load automatically from this account.` : "Not connected. Sign in with GitHub to load your repositories automatically."}</p></div><div className="rounded-md border border-[#30363d] p-3"><p className="text-sm font-medium">Reset saved statuses</p><p className="mt-1 text-xs text-[#8b949e]">Remove saved status preferences for @{username}.</p><button onClick={() => { try { localStorage.removeItem(`repopilot-statuses:${username.toLowerCase()}`); } catch {} setRepositories((items) => items.map((repo) => ({ ...repo, status: repo.archived ? "On hold" : "Not assessed" }))); setActivity((items) => [{ id: `reset-${Date.now()}`, message: `Reset saved statuses for @${username}`, time: new Date().toLocaleString() }, ...items].slice(0, 50)); setActivePanel(null); }} className="mt-3 rounded-md border border-[#da3633]/60 px-3 py-1.5 text-xs text-[#ff7b72] hover:bg-[#da3633]/10">Reset statuses</button></div></div>}
          <div className="mt-6 flex justify-end border-t border-[#30363d] pt-4"><button onClick={() => setActivePanel(null)} className="rounded-md border border-[#30363d] px-3 py-1.5 text-sm hover:bg-[#21262d]">Close</button></div></section></div>}

        <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 border-b border-[#30363d] pb-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0"><div className="flex items-center gap-2 text-sm text-[#8b949e]"><Github size={16} /><span>Repositories</span><span>/</span><span className="text-[#e6edf3]">{username}</span></div><h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[28px]">{activeNav === "Overview" ? "Dashboard" : activeNav === "Repositories" ? "Your repositories" : activeNav}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b949e]">{activeNav === "Overview" ? "Your GitHub activity, contribution trends, and project status at a glance." : activeNav === "Repositories" ? "Browse, search, categorize, and update your GitHub repositories." : activeNav === "Work board" ? "Track projects currently in progress." : activeNav === "Priorities" ? "Focus on repositories that need attention first." : activeNav === "Activity history" ? "Review your recent workspace changes." : "Manage your GitHub account and workspace preferences."}</p></div>
            <div className="flex items-center gap-2 text-sm text-[#8b949e]">{loading ? <><LoaderCircle size={15} className="animate-spin" /> Loading your GitHub repositories…</> : githubUser ? "Synced from your connected GitHub account" : "Sign in to load your repositories automatically"}</div>
          </div>

          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-[#da3633]/50 bg-[#da3633]/10 p-3 text-sm text-[#ff7b72]"><AlertCircle size={17} className="mt-0.5 shrink-0" /><div className="flex-1">{error}</div><button onClick={() => void importRepositories()} className="font-medium underline underline-offset-4">Retry</button></div>}

          {isOverviewPage && <section className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md border border-[#30363d] bg-[#0d1117] px-4 py-3">
            <Stat label="Repositories" value={repositories.length} icon={FolderGit2} />
            <span className="hidden h-5 border-l border-[#30363d] sm:block" />
            <Stat label="In progress" value={inProgressCount} icon={GitBranch} />
            <span className="hidden h-5 border-l border-[#30363d] sm:block" />
            <Stat label="Needs attention" value={attentionCount} icon={ShieldAlert} />
            <span className="hidden h-5 border-l border-[#30363d] sm:block" />
            <Stat label="Completed" value={completedCount} icon={Check} />
            <span className="ml-auto hidden text-xs text-[#8b949e] lg:inline">{lastSynced ? `Last synced at ${lastSynced}` : "Waiting for import"}</span>
          </section>}

          {isOverviewPage && <section className="mt-5 grid gap-4">
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Project status overview</h2><p className="mt-1 text-xs text-[#8b949e]">Live distribution of your repository categories</p></div><span className="text-xs text-[#8b949e]">{repositories.length} repositories</span></div>
              <div className="mt-5 space-y-3">
                {statusCounts.map(({status,count}) => {
                  const colors: Record<ProjectStatus,string> = {"Not assessed":"#8b949e","Needs review":"#79c0ff","In progress":"#a371f7","Needs attention":"#f0883e","Completed":"#3fb950","On hold":"#6e7681"};
                  return <div key={status} className="grid grid-cols-[125px_minmax(0,1fr)_30px] items-center gap-3">
                    <span className="truncate text-xs text-[#c9d1d9]">{status}</span>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[#21262d]"><div className="h-full rounded-full transition-all" style={{width:`${count / maxStatusCount * 100}%`,backgroundColor:colors[status]}} /></div>
                    <span className="text-right text-xs tabular-nums text-[#8b949e]">{count}</span>
                  </div>;
                })}
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#30363d] pt-4">
                  <div className="rounded-md bg-[#161b22] p-3"><p className="text-xs text-[#8b949e]">Active on GitHub</p><p className="mt-1 text-xl font-semibold text-[#3fb950]">{activeOnGitHubCount}</p><p className="text-[11px] text-[#6e7681]">Pushed in the last 30 days</p></div>
                  <div className="rounded-md bg-[#161b22] p-3"><p className="text-xs text-[#8b949e]">Contributions · last year</p><p className="mt-1 text-xl font-semibold text-[#79c0ff]">{totalContributions.toLocaleString()}</p><p className="text-[11px] text-[#6e7681]">GitHub contribution calendar</p></div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">GitHub contribution trend</h2><p className="mt-1 text-xs text-[#8b949e]">Daily contributions across the last year</p></div><span className="text-sm font-semibold text-[#e6edf3]">{totalContributions.toLocaleString()} total</span></div>
              {contributionDays.length > 1 ? <div className="mt-4">
                <svg viewBox="0 0 760 220" role="img" aria-label="Line graph of daily GitHub contributions over the last year" className="h-auto w-full overflow-visible">
                  {[24,64,104,144,184].map((y) => <line key={y} x1="12" x2="748" y1={y} y2={y} stroke="#30363d" strokeDasharray="4 5" />)}
                  <polyline points={contributionLine} fill="none" stroke="#58a6ff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  <polygon points={`12,184 ${contributionLine} 748,184`} fill="#1f6feb" opacity="0.12" />
                </svg>
                <div className="flex justify-between text-[11px] text-[#8b949e]"><span>{contributionDays[0]?.date}</span><span>{contributionDays[Math.floor(contributionDays.length / 2)]?.date}</span><span>{contributionDays[contributionDays.length - 1]?.date}</span></div>
              </div> : <div className="mt-5 rounded-md border border-dashed border-[#30363d] p-5 text-center text-xs text-[#8b949e]">{contributionError || "Loading GitHub contribution history…"}</div>}
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
              <div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">Project status distribution</h2><p className="mt-1 text-xs text-[#8b949e]">Repository count by current status</p></div><span className="text-xs text-[#8b949e]">{repositories.length} repositories</span></div>
              <div className="mt-5 space-y-3">
                {statusCounts.map(({status,count}) => {
                  const colors: Record<ProjectStatus,string> = {"Not assessed":"#8b949e","Needs review":"#79c0ff","In progress":"#a371f7","Needs attention":"#f0883e","Completed":"#3fb950","On hold":"#6e7681"};
                  return <div key={status} className="grid grid-cols-[112px_minmax(0,1fr)_28px] items-center gap-2"><span className="truncate text-xs text-[#c9d1d9]">{status}</span><div className="h-2 overflow-hidden rounded-full bg-[#21262d]"><div className="h-full rounded-full" style={{width:`${count / maxStatusCount * 100}%`,backgroundColor:colors[status]}} /></div><span className="text-right text-xs text-[#8b949e]">{count}</span></div>;
                })}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#30363d] pt-4">
                <div className="rounded-md bg-[#161b22] p-3"><p className="text-xs text-[#8b949e]">Active on GitHub</p><p className="mt-1 text-xl font-semibold text-[#3fb950]">{activeOnGitHubCount}</p><p className="text-[11px] text-[#6e7681]">Pushed in the last 30 days</p></div>
                <div className="rounded-md bg-[#161b22] p-3"><p className="text-xs text-[#8b949e]">Contribution count</p><p className="mt-1 text-xl font-semibold text-[#79c0ff]">{totalContributions.toLocaleString()}</p><p className="text-[11px] text-[#6e7681]">Last 12 months</p></div>
              </div>
            </div>
          </section>}

          {isRepositoryPage && <section id="repositories" className="mt-7 scroll-mt-24">
            <div className="flex flex-col justify-between gap-3 border-b border-[#30363d] pb-4 sm:flex-row sm:items-center">
              <div><h2 className="text-lg font-semibold">Repositories <span className="ml-1 rounded-full bg-[#21262d] px-2 py-0.5 text-sm font-normal text-[#8b949e]">{filteredRepositories.length}</span></h2><p className="mt-1 text-xs text-[#8b949e]">{githubUser ? "Authorized repositories for " : "Public repositories from "}<a className="text-[#58a6ff] hover:underline" href={`https://github.com/${username}?tab=repositories`} target="_blank" rel="noreferrer">@{username}</a>{lastSynced ? ` · synced ${lastSynced}` : ""}</p></div>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-md border border-[#30363d] bg-[#0d1117] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-sm font-medium text-[#e6edf3]">Project organization</p><p className="mt-1 text-xs text-[#8b949e]">Switch between your manual order and AI-prioritized recommendations.</p></div>
                <div className="flex items-center gap-1 rounded-md border border-[#30363d] bg-[#010409] p-1">
                  <button type="button" onClick={() => setOrganizationMode("manual")} className={`rounded px-3 py-1.5 text-xs ${organizationMode === "manual" ? "bg-[#30363d] text-white" : "text-[#8b949e] hover:text-white"}`}>Manual</button>
                  <button type="button" onClick={() => { if (aiOrganization) setOrganizationMode("ai"); else void organizeAllRepositories(); }} disabled={organizing} className={`rounded px-3 py-1.5 text-xs ${organizationMode === "ai" ? "bg-[#8957e5]/25 text-[#d2a8ff]" : "text-[#8b949e] hover:text-white"} disabled:opacity-50`}>AI organized</button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void organizeAllRepositories()} disabled={organizing || repositories.length === 0} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#8957e5]/60 bg-[#8957e5]/10 px-3 text-xs font-medium text-[#d2a8ff] hover:bg-[#8957e5]/20 disabled:opacity-50">{organizing ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}{organizing ? "Organizing all repositories…" : aiOrganization ? "Refresh AI organization" : "Organize all with AI"}</button>
                {aiOrganization && <><span className="text-xs text-[#8b949e]">Sorted by AI priority · {aiOrganization.model}</span><button type="button" onClick={applyAllAiSuggestions} className="rounded-md border border-[#238636]/60 px-3 py-2 text-xs text-[#3fb950] hover:bg-[#238636]/10">Apply all suggestions to manual statuses</button></>}
              </div>
              {organizationError && <p role="alert" className="text-sm text-[#ff7b72]">{organizationError}</p>}
              {aiOrganization && organizationMode === "ai" && <p className="text-xs text-[#8b949e]">AI suggestions are a separate view and do not overwrite your manual statuses until you choose “Apply all suggestions”. Generated {relativeDate(aiOrganization.generatedAt)}.</p>}
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <label className="flex min-h-10 flex-1 items-center gap-2 rounded-md border border-[#30363d] bg-[#010409] px-3 focus-within:border-[#2f81f7]"><Search size={16} className="shrink-0 text-[#8b949e]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a repository…" className="w-full bg-transparent text-sm outline-none placeholder:text-[#6e7681]" aria-label="Search repositories" />{query && <button onClick={() => setQuery("")} aria-label="Clear search" className="text-[#8b949e] hover:text-[#e6edf3]"><X size={14} /></button>}</label>
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#30363d] bg-[#010409] px-3 text-sm text-[#8b949e]"><Filter size={15} /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="max-w-[190px] bg-transparent py-1 text-sm text-[#c9d1d9] outline-none" aria-label="Filter by status"><option className="bg-[#161b22] text-[#e6edf3]">All projects</option>{STATUS_OPTIONS.map((status) => <option className="bg-[#161b22] text-[#e6edf3]" key={status}>{status}</option>)}</select></label>
            </div>

            {loading && repositories.length === 0 ? <div className="mt-4 flex items-center justify-center gap-3 rounded-md border border-[#30363d] px-6 py-16 text-sm text-[#8b949e]"><LoaderCircle className="animate-spin" size={18} />Loading your authorized GitHub repositories…</div> : filteredRepositories.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-md border border-[#30363d]">
                {filteredRepositories.map((repository) => <article key={repository.id} className="border-b border-[#30363d] bg-[#0d1117] px-4 py-4 last:border-b-0 hover:bg-[#161b22]/70 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#30363d] bg-[#161b22] text-[#8b949e]"><FolderGit2 size={18} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><a href={repository.url} target="_blank" rel="noreferrer" className="break-all text-base font-semibold text-[#58a6ff] hover:underline">{repository.name}</a>{repository.archived && <span className="rounded-full border border-[#6e7681]/60 px-2 py-0.5 text-xs text-[#8b949e]">Archived</span>}{repository.private && <span className="rounded-full border border-[#d29922]/60 px-2 py-0.5 text-xs text-[#e3b341]">Private</span>}<StatusPill status={repository.status} />{organizationMode === "ai" && aiOrganization && (() => { const suggestion = aiOrganization.projects.find((item) => item.id === repository.id); return suggestion ? <span title={suggestion.reason} className="rounded-full border border-[#8957e5]/50 px-2 py-0.5 text-xs text-[#d2a8ff]">AI P{suggestion.priority}: {suggestion.status}</span> : null; })()}</div>
                        <p className="mt-1.5 max-w-3xl text-sm leading-5 text-[#8b949e]">{repository.description || "No description provided."}</p>
                        {repository.topics.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{repository.topics.slice(0, 6).map((topic) => <a key={topic} href={`https://github.com/topics/${encodeURIComponent(topic)}`} target="_blank" rel="noreferrer" className="rounded-full bg-[#1f6feb]/15 px-2.5 py-0.5 text-xs font-medium text-[#58a6ff] hover:bg-[#1f6feb]/25">{topic}</a>)}</div>}
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#8b949e]">
                          {repository.language && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#8b949e]" />{repository.language}</span>}
                          <a href={`${repository.url}/stargazers`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[#58a6ff]"><Star size={13} />{repository.stars.toLocaleString()}</a>
                          <span className="inline-flex items-center gap-1"><GitBranch size={13} />{repository.defaultBranch}</span>
                          <a href={`${repository.url}/issues`} target="_blank" rel="noreferrer" className="hover:text-[#58a6ff]">{repository.openIssues} open issues</a>
                          <span>Updated {relativeDate(repository.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:pl-4"><button type="button" onClick={() => void summarizeRepository(repository)} disabled={summarizingId !== null} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[#8957e5]/50 bg-[#8957e5]/10 px-2 text-xs text-[#d2a8ff] hover:bg-[#8957e5]/20 disabled:opacity-50">{summarizingId === repository.id ? <LoaderCircle size={12} className="animate-spin" /> : <Sparkles size={12} />}{summarizingId === repository.id ? "Thinking…" : "AI summary"}</button><button type="button" onClick={() => void assessRepository(repository)} disabled={assessingId !== null} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[#30363d] bg-[#161b22] px-2 text-xs hover:border-[#8b949e] disabled:opacity-50">{assessingId === repository.id ? <LoaderCircle size={12} className="animate-spin" /> : <ShieldAlert size={12} />}{assessingId === repository.id ? "Checking…" : "Assess"}</button><label className="sr-only" htmlFor={`status-${repository.id}`}>Status for {repository.name}</label><select id={`status-${repository.id}`} value={repository.status} onChange={(event) => updateStatus(repository.id, event.target.value as ProjectStatus)} className="min-h-8 max-w-[170px] rounded-md border border-[#30363d] bg-[#161b22] px-2 text-xs text-[#c9d1d9] outline-none focus:border-[#2f81f7]">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select><a href={repository.url} target="_blank" rel="noreferrer" aria-label={`Open ${repository.name} on GitHub`} className="rounded-md p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"><ExternalLink size={15} /></a></div>
                    {aiSummaries[repository.id] && <div className="mt-3 rounded-md border border-[#8957e5]/40 bg-[#8957e5]/5 p-3 sm:ml-12"><div className="flex items-center justify-between gap-2"><p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#d2a8ff]"><Sparkles size={13} /> Ollama Cloud analysis</p><span className="text-xs text-[#8b949e]">{aiSummaries[repository.id].model}</span></div>{aiSummaries[repository.id].error ? <p className="mt-2 text-sm text-[#ff7b72]">{aiSummaries[repository.id].error}</p> : <><div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#c9d1d9]">{aiSummaries[repository.id].summary}</div><p className="mt-3 text-xs text-[#8b949e]">Generated {relativeDate(aiSummaries[repository.id].generatedAt)} · Based on GitHub metadata, open issues, pull requests and recent workflow runs. No source files were analyzed.</p></>}</div>}{assessments[repository.id] && <div className="mt-3 rounded-md border border-[#30363d] bg-[#010409] p-3 sm:ml-12"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-[#c9d1d9]">Evidence-based assessment · {assessments[repository.id].confidence} confidence</p><p className="text-xs text-[#8b949e]">Checked {relativeDate(assessments[repository.id].assessedAt)}</p></div>{assessments[repository.id].error ? <p className="mt-2 text-sm text-[#ff7b72]">{assessments[repository.id].error}</p> : <><p className="mt-2 text-sm">Suggested status: <span className="font-semibold">{assessments[repository.id].status}</span></p>{assessments[repository.id].evidence.length > 0 ? <ul className="mt-2 space-y-1.5">{assessments[repository.id].evidence.map((item, index) => <li key={index} className="text-xs leading-5 text-[#8b949e]">• {item.url ? <a className="text-[#58a6ff] hover:underline" href={item.url} target="_blank" rel="noreferrer">{item.detail}</a> : item.detail}</li>)}</ul> : <p className="mt-2 text-xs text-[#8b949e]">No evidence was returned. Keep this repository unassessed.</p>}<div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={assessments[repository.id].status === "Not assessed"} onClick={() => applyAssessment(repository, assessments[repository.id])} className="rounded-md bg-[#238636] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-50">Apply suggestion</button><span className="text-xs text-[#8b949e]">Suggestions never change your status until applied.</span></div></>}</div>}
                  </div>
                </article>)}
              </div>
            ) : <div className="mt-4 rounded-md border border-dashed border-[#30363d] px-6 py-14 text-center"><Search size={23} className="mx-auto text-[#6e7681]" /><h3 className="mt-3 font-semibold">{repositories.length ? "No matching repositories" : "No repositories imported yet"}</h3><p className="mt-1 text-sm text-[#8b949e]">{repositories.length ? "Try another search term or clear the status filter." : githubUser ? "No repositories were returned for this GitHub account." : "Sign in with GitHub above. RepoPilot will automatically load the repositories your account can access."}</p>{repositories.length > 0 && <button onClick={() => { setQuery(""); setFilter("All projects"); }} className="mt-4 rounded-md border border-[#30363d] px-3 py-1.5 text-sm hover:bg-[#21262d]">Clear filters</button>}</div>}
          </section>}

          {isActivityPage && <section className="mt-7 rounded-lg border border-[#30363d] bg-[#0d1117] p-5">
            <h1 className="text-2xl font-semibold">Activity history</h1><p className="mt-2 text-sm text-[#8b949e]">A record of project status changes and applied AI recommendations.</p>
            {activity.length ? <ol className="mt-6 space-y-4">{activity.map((item) => <li key={item.id} className="border-l-2 border-[#30363d] pl-4"><p className="text-sm">{item.message}</p><p className="mt-1 text-xs text-[#8b949e]">{item.time}</p></li>)}</ol> : <p className="mt-6 rounded-md border border-dashed border-[#30363d] p-6 text-sm text-[#8b949e]">No activity has been recorded in this browser session yet.</p>}
          </section>}

          {isSettingsPage && <section className="mt-7 max-w-3xl space-y-4">
            <div><h1 className="text-2xl font-semibold">Settings</h1><p className="mt-2 text-sm text-[#8b949e]">Manage your connected account and local workspace preferences.</p></div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4"><h2 className="font-medium">GitHub account</h2><p className="mt-2 text-sm text-[#8b949e]">{githubUser ? `Connected as @${githubUser.login}` : "Not connected"}</p><a href={githubUser ? `https://github.com/${githubUser.login}` : "/api/auth/github"} target={githubUser ? "_blank" : undefined} rel={githubUser ? "noreferrer" : undefined} className="mt-3 inline-flex rounded-md border border-[#30363d] px-3 py-2 text-sm hover:bg-[#161b22]">{githubUser ? "Open GitHub profile" : "Connect GitHub"}</a></div>
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4"><h2 className="font-medium">Saved project statuses</h2><p className="mt-2 text-sm text-[#8b949e]">Reset locally saved statuses for @{username}.</p><button onClick={() => { try { localStorage.removeItem(`repopilot-statuses:${username.toLowerCase()}`); } catch {} setRepositories((items) => items.map((repo) => ({ ...repo, status: repo.archived ? "On hold" : "Not assessed" }))); }} className="mt-3 rounded-md border border-[#da3633]/60 px-3 py-2 text-sm text-[#ff7b72] hover:bg-[#da3633]/10">Reset saved statuses</button></div>
          </section>}

          <footer className="mt-10 flex flex-col gap-2 border-t border-[#30363d] py-5 text-xs text-[#8b949e] sm:flex-row sm:items-center sm:justify-between"><span>RepoPilot · Ghost-Machine</span><span className="inline-flex items-center gap-1.5"><BookOpen size={13} />{lastSynced ? "GitHub repositories synchronized" : "Waiting for repository import"}</span></footer>
        </div>
      </main>
    </div>
  );
}

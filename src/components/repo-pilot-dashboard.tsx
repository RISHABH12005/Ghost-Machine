"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, Bell, BookOpen, Check, CheckCircle2, ChevronDown,
  CircleHelp, CircleDot, Clock3, Code2, ExternalLink, Filter, FolderGit2,
  GitBranch, Github, LayoutDashboard, ListTodo, LoaderCircle, Menu,
  RefreshCw, Search, Settings2, ShieldAlert, Star, X, Zap,
} from "lucide-react";
import type { ProjectStatus, Repository, RepositoryImportResponse } from "@/types/repository";

const DEFAULT_USERNAME = "RISHABH12005";
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All projects");
  const [usernameInput, setUsernameInput] = useState(DEFAULT_USERNAME);
  const [username, setUsername] = useState(DEFAULT_USERNAME);
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

  const navigateTo = (label: string) => {
    setActiveNav(label);
    setMobileMenuOpen(false);
    if (label === "Overview") { setFilter("All projects"); setQuery(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else if (label === "Repositories") { setFilter("All projects"); document.getElementById("repositories")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (label === "Work board") { setFilter("In progress"); document.getElementById("repositories")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (label === "Priorities") { setFilter("Needs attention"); document.getElementById("repositories")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (label === "Activity history") setActivePanel("activity");
    else if (label === "Settings") setActivePanel("settings");
  };

  const importRepositories = useCallback(async (requestedUsername: string) => {
    const cleanUsername = requestedUsername.trim();
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(cleanUsername)) { setError("Enter a valid GitHub username."); return; }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/repositories?username=${encodeURIComponent(cleanUsername)}`, { cache: "no-store" });
      const data = (await response.json()) as RepositoryImportResponse;
      if (!response.ok) throw new Error(data.error || "Could not import repositories.");
      const savedStatuses: Record<string, ProjectStatus> = {};
      try { Object.assign(savedStatuses, JSON.parse(localStorage.getItem(`repopilot-statuses:${cleanUsername.toLowerCase()}`) || "{}")); } catch { /* Use defaults if local preferences are invalid. */ }
      const imported: Repository[] = data.repositories.map((repository) => ({
        ...repository,
        status: savedStatuses[String(repository.id)] || (repository.archived ? "On hold" : "Not assessed"),
        note: "",
      }));
      setRepositories(imported);
      setUsername(cleanUsername);
      setUsernameInput(cleanUsername);
      setLastSynced(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Repository import failed.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void importRepositories(DEFAULT_USERNAME); }, [importRepositories]);

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
    return repositories.filter((repository) => {
      const matchesQuery = !normalizedQuery || [repository.name, repository.fullName, repository.description, repository.language, repository.defaultBranch, repository.topics.join(" ")].join(" ").toLowerCase().includes(normalizedQuery);
      return matchesQuery && (filter === "All projects" || repository.status === filter);
    });
  }, [query, filter, repositories]);

  const attentionCount = repositories.filter((repo) => repo.status === "Needs attention").length;
  const inProgressCount = repositories.filter((repo) => repo.status === "In progress").length;
  const completedCount = repositories.filter((repo) => repo.status === "Completed").length;

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {mobileMenuOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-[#30363d] bg-[#0d1117] px-3 py-4 transition-transform lg:translate-x-0 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f0f6fc] text-[#0d1117]"><Github size={23} /></div>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold tracking-tight text-[#f0f6fc]">RepoPilot</p><p className="text-xs text-[#8b949e]">Your repository workspace</p></div>
          <button className="rounded-md p-1.5 text-[#8b949e] hover:bg-[#21262d] lg:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"><X size={17} /></button>
        </div>
        <div className="border-b border-[#30363d] px-2 pb-4">
          <button onClick={() => navigateTo("Settings")} className="flex w-full items-center gap-2 rounded-md border border-[#30363d] bg-[#161b22] px-2.5 py-2 text-left text-sm hover:border-[#8b949e]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#30363d] text-[10px] font-semibold">{username.slice(0,2).toUpperCase()}</span><span className="min-w-0 flex-1 truncate">{username}</span><ChevronDown size={14} className="text-[#8b949e]" /></button>
        </div>
        <div className="mt-5 px-2 text-xs font-semibold text-[#8b949e]">Workspace</div>
        <nav className="mt-2 space-y-1">
          {navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => navigateTo(label)} className={`flex w-full items-center gap-2.5 rounded-md border-l-2 px-2.5 py-2 text-left text-sm transition ${activeNav === label ? "border-l-[#f78166] bg-[#161b22] font-semibold text-[#f0f6fc]" : "border-l-transparent text-[#c9d1d9] hover:bg-[#161b22]"}`}><Icon size={16} className={activeNav === label ? "text-[#f0f6fc]" : "text-[#8b949e]"} />{label}{label === "Priorities" && attentionCount > 0 && <span className="ml-auto rounded-full bg-[#d29922]/15 px-2 py-0.5 text-xs text-[#e3b341]">{attentionCount}</span>}</button>)}
        </nav>
        <div className="mt-6 px-2 text-xs font-semibold text-[#8b949e]">Personal</div>
        <nav className="mt-2 space-y-1">
          <button onClick={() => navigateTo("Activity history")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#c9d1d9] hover:bg-[#161b22]"><Activity size={16} className="text-[#8b949e]" />Activity history</button>
          <button onClick={() => navigateTo("Settings")} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[#c9d1d9] hover:bg-[#161b22]"><Settings2 size={16} className="text-[#8b949e]" />Settings</button>
        </nav>
        <div className="mt-auto border-t border-[#30363d] pt-4">
          <div className="rounded-md border border-[#30363d] bg-[#161b22] p-3"><div className="flex items-center gap-2 text-sm font-medium"><Code2 size={15} className="text-[#8b949e]" />AI project memory</div><p className="mt-2 text-xs leading-5 text-[#8b949e]">Repository summaries and next-step suggestions are planned for a future update.</p><span className="mt-2 inline-flex rounded-full border border-[#30363d] px-2 py-0.5 text-[10px] text-[#8b949e]">Coming later</span></div>
          <div className="mt-3 flex items-center gap-2 px-1 text-xs text-[#8b949e]"><span className="h-2 w-2 rounded-full bg-[#3fb950]" />Public repository mode</div>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex min-h-[64px] items-center justify-between gap-3 border-b border-[#30363d] bg-[#010409]/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button aria-label="Open navigation" onClick={() => setMobileMenuOpen(true)} className="rounded-md border border-[#30363d] p-2 text-[#c9d1d9] lg:hidden"><Menu size={17} /></button>
            <div className="hidden items-center gap-2 text-sm sm:flex"><Github size={19} /><span className="text-[#8b949e]">/</span><span className="font-semibold">{username}</span><span className="text-[#8b949e]">/</span><span className="truncate text-[#8b949e]">{activeNav}</span></div>
            <span className="truncate text-sm font-semibold sm:hidden">RepoPilot / {activeNav}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button title="Help" aria-label="Help" onClick={() => setActivePanel("help")} className="rounded-md p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"><CircleHelp size={17} /></button>
            <button title="Notifications" aria-label="Notifications" onClick={() => setActivePanel("notifications")} className="relative rounded-md p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"><Bell size={17} />{attentionCount > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#e3b341]" />}</button>
            <a href={`https://github.com/${username}`} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-2.5 py-1.5 text-xs font-medium hover:border-[#8b949e] sm:px-3 sm:text-sm"><Github size={15} /><span className="hidden sm:inline">View profile</span><ExternalLink size={12} /></a>
          </div>
        </header>

        {activePanel && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="panel-title" className="w-full max-w-lg rounded-xl border border-[#30363d] bg-[#0d1117] p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-[#8b949e]">REPOPILOT WORKSPACE</p><h2 id="panel-title" className="mt-2 text-xl font-semibold">{activePanel === "help" ? "How to use RepoPilot" : activePanel === "notifications" ? "Notifications" : activePanel === "activity" ? "Activity history" : "Settings"}</h2></div><button onClick={() => setActivePanel(null)} aria-label="Close dialog" className="rounded-md p-1.5 text-[#8b949e] hover:bg-[#21262d]"><X size={17} /></button></div>
          {activePanel === "help" ? <div className="mt-5 space-y-3 text-sm leading-6 text-[#c9d1d9]"><p><strong>Import repositories:</strong> enter a public GitHub username and select Import repositories.</p><p><strong>Search and filter:</strong> search by repository name, description, language, branch, or topic.</p><p><strong>Track progress:</strong> change a repository status. It is saved in this browser for that username.</p><p><strong>Current limits:</strong> private repositories, cross-device sync, and automatic repository assessment are not enabled yet. New repositories remain “Not assessed” until you review them.</p></div> : activePanel === "notifications" ? <div className="mt-5"><p className="text-sm text-[#8b949e]">{attentionCount ? `${attentionCount} project(s) marked for attention.` : "You have no projects marked as needing attention."}</p><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{repositories.filter((repo) => repo.status === "Needs attention").map((repo) => <a key={repo.id} href={repo.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-md border border-[#30363d] p-3 text-sm hover:bg-[#161b22]">{repo.name}<ExternalLink size={14} /></a>)}</div><button onClick={() => { setActivePanel(null); navigateTo("Priorities"); }} className="mt-4 rounded-md bg-[#238636] px-3 py-2 text-sm font-medium text-white hover:bg-[#2ea043]">View priorities</button></div> : activePanel === "activity" ? <div className="mt-5">{activity.length ? <ol className="max-h-80 space-y-3 overflow-y-auto">{activity.map((item) => <li key={item.id} className="border-l border-[#30363d] pl-3"><p className="text-sm">{item.message}</p><p className="mt-1 text-xs text-[#8b949e]">{item.time}</p></li>)}</ol> : <p className="rounded-md border border-dashed border-[#30363d] p-5 text-sm text-[#8b949e]">No status changes in this session yet.</p>}</div> : <div className="mt-5 space-y-4"><div><label htmlFor="settings-username" className="mb-2 block text-sm text-[#c9d1d9]">GitHub username</label><input id="settings-username" value={usernameInput} onChange={(event) => setUsernameInput(event.target.value)} className="min-h-10 w-full rounded-md border border-[#30363d] bg-[#010409] px-3 text-sm outline-none focus:border-[#2f81f7]" /></div><button onClick={() => { setActivePanel(null); void importRepositories(usernameInput); }} disabled={loading} className="w-full rounded-md bg-[#238636] px-3 py-2 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-50">Import this account</button><div className="rounded-md border border-[#30363d] p-3"><p className="text-sm font-medium">Reset saved statuses</p><p className="mt-1 text-xs text-[#8b949e]">Remove saved status preferences for @{username}.</p><button onClick={() => { try { localStorage.removeItem(`repopilot-statuses:${username.toLowerCase()}`); } catch {} setRepositories((items) => items.map((repo) => ({ ...repo, status: repo.archived ? "On hold" : "Not assessed" }))); setActivity((items) => [{ id: `reset-${Date.now()}`, message: `Reset saved statuses for @${username}`, time: new Date().toLocaleString() }, ...items].slice(0, 50)); setActivePanel(null); }} className="mt-3 rounded-md border border-[#da3633]/60 px-3 py-1.5 text-xs text-[#ff7b72] hover:bg-[#da3633]/10">Reset statuses</button></div></div>}
          <div className="mt-6 flex justify-end border-t border-[#30363d] pt-4"><button onClick={() => setActivePanel(null)} className="rounded-md border border-[#30363d] px-3 py-1.5 text-sm hover:bg-[#21262d]">Close</button></div></section></div>}

        <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 border-b border-[#30363d] pb-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0"><div className="flex items-center gap-2 text-sm text-[#8b949e]"><Github size={16} /><span>Repositories</span><span>/</span><span className="text-[#e6edf3]">{username}</span></div><h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[28px]">Your repositories</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b949e]">A single place to review your projects, track what needs attention, and pick up where you left off.</p></div>
            <form className="flex w-full flex-col gap-2 sm:flex-row md:w-auto md:min-w-[400px]" onSubmit={(event) => { event.preventDefault(); void importRepositories(usernameInput); }}>
              <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-[#30363d] bg-[#010409] px-3 focus-within:border-[#2f81f7]"><span className="text-sm text-[#8b949e]">github.com/</span><input value={usernameInput} onChange={(event) => setUsernameInput(event.target.value)} aria-label="GitHub username" placeholder="username" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#6e7681]" /></label>
              <button disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#3fb950]/40 bg-[#238636] px-3.5 text-sm font-medium text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-60">{loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={14} />}{loading ? "Importing…" : "Import repositories"}</button>
            </form>
          </div>

          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-[#da3633]/50 bg-[#da3633]/10 p-3 text-sm text-[#ff7b72]"><AlertCircle size={17} className="mt-0.5 shrink-0" /><div className="flex-1">{error}</div><button onClick={() => void importRepositories(username)} className="font-medium underline underline-offset-4">Retry</button></div>}

          <section className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md border border-[#30363d] bg-[#0d1117] px-4 py-3">
            <Stat label="Repositories" value={repositories.length} icon={FolderGit2} />
            <span className="hidden h-5 border-l border-[#30363d] sm:block" />
            <Stat label="In progress" value={inProgressCount} icon={GitBranch} />
            <span className="hidden h-5 border-l border-[#30363d] sm:block" />
            <Stat label="Needs attention" value={attentionCount} icon={ShieldAlert} />
            <span className="hidden h-5 border-l border-[#30363d] sm:block" />
            <Stat label="Completed" value={completedCount} icon={Check} />
            <span className="ml-auto hidden text-xs text-[#8b949e] lg:inline">{lastSynced ? `Last synced at ${lastSynced}` : "Waiting for import"}</span>
          </section>

          <section id="repositories" className="mt-7 scroll-mt-24">
            <div className="flex flex-col justify-between gap-3 border-b border-[#30363d] pb-4 sm:flex-row sm:items-center">
              <div><h2 className="text-lg font-semibold">Repositories <span className="ml-1 rounded-full bg-[#21262d] px-2 py-0.5 text-sm font-normal text-[#8b949e]">{filteredRepositories.length}</span></h2><p className="mt-1 text-xs text-[#8b949e]">Public repositories from <a className="text-[#58a6ff] hover:underline" href={`https://github.com/${username}?tab=repositories`} target="_blank" rel="noreferrer">@{username}</a>{lastSynced ? ` · synced ${lastSynced}` : ""}</p></div>
              <a href={`https://github.com/${username}?tab=repositories`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-md border border-[#30363d] bg-[#21262d] px-3 text-sm hover:border-[#8b949e] sm:self-auto">View on GitHub <ExternalLink size={13} /></a>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <label className="flex min-h-10 flex-1 items-center gap-2 rounded-md border border-[#30363d] bg-[#010409] px-3 focus-within:border-[#2f81f7]"><Search size={16} className="shrink-0 text-[#8b949e]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a repository…" className="w-full bg-transparent text-sm outline-none placeholder:text-[#6e7681]" aria-label="Search repositories" />{query && <button onClick={() => setQuery("")} aria-label="Clear search" className="text-[#8b949e] hover:text-[#e6edf3]"><X size={14} /></button>}</label>
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#30363d] bg-[#010409] px-3 text-sm text-[#8b949e]"><Filter size={15} /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="max-w-[190px] bg-transparent py-1 text-sm text-[#c9d1d9] outline-none" aria-label="Filter by status"><option>All projects</option>{STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select></label>
            </div>

            {loading && repositories.length === 0 ? <div className="mt-4 flex items-center justify-center gap-3 rounded-md border border-[#30363d] px-6 py-16 text-sm text-[#8b949e]"><LoaderCircle className="animate-spin" size={18} />Fetching public repositories from GitHub…</div> : filteredRepositories.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-md border border-[#30363d]">
                {filteredRepositories.map((repository) => <article key={repository.id} className="border-b border-[#30363d] bg-[#0d1117] px-4 py-4 last:border-b-0 hover:bg-[#161b22]/70 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#30363d] bg-[#161b22] text-[#8b949e]"><FolderGit2 size={18} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><a href={repository.url} target="_blank" rel="noreferrer" className="break-all text-base font-semibold text-[#58a6ff] hover:underline">{repository.name}</a>{repository.archived && <span className="rounded-full border border-[#6e7681]/60 px-2 py-0.5 text-xs text-[#8b949e]">Archived</span>}<StatusPill status={repository.status} /></div>
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
                    <div className="flex shrink-0 items-center gap-2 sm:pl-4"><button type="button" onClick={() => void assessRepository(repository)} disabled={assessingId !== null} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[#30363d] bg-[#161b22] px-2 text-xs hover:border-[#8b949e] disabled:opacity-50">{assessingId === repository.id ? <LoaderCircle size={12} className="animate-spin" /> : <ShieldAlert size={12} />}{assessingId === repository.id ? "Checking…" : "Assess"}</button><label className="sr-only" htmlFor={`status-${repository.id}`}>Status for {repository.name}</label><select id={`status-${repository.id}`} value={repository.status} onChange={(event) => updateStatus(repository.id, event.target.value as ProjectStatus)} className="min-h-8 max-w-[170px] rounded-md border border-[#30363d] bg-[#161b22] px-2 text-xs text-[#c9d1d9] outline-none focus:border-[#2f81f7]">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select><a href={repository.url} target="_blank" rel="noreferrer" aria-label={`Open ${repository.name} on GitHub`} className="rounded-md p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"><ExternalLink size={15} /></a></div>
                    {assessments[repository.id] && <div className="mt-3 rounded-md border border-[#30363d] bg-[#010409] p-3 sm:ml-12"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-[#c9d1d9]">Evidence-based assessment · {assessments[repository.id].confidence} confidence</p><p className="text-xs text-[#8b949e]">Checked {relativeDate(assessments[repository.id].assessedAt)}</p></div>{assessments[repository.id].error ? <p className="mt-2 text-sm text-[#ff7b72]">{assessments[repository.id].error}</p> : <><p className="mt-2 text-sm">Suggested status: <span className="font-semibold">{assessments[repository.id].status}</span></p>{assessments[repository.id].evidence.length > 0 ? <ul className="mt-2 space-y-1.5">{assessments[repository.id].evidence.map((item, index) => <li key={index} className="text-xs leading-5 text-[#8b949e]">• {item.url ? <a className="text-[#58a6ff] hover:underline" href={item.url} target="_blank" rel="noreferrer">{item.detail}</a> : item.detail}</li>)}</ul> : <p className="mt-2 text-xs text-[#8b949e]">No evidence was returned. Keep this repository unassessed.</p>}<div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={assessments[repository.id].status === "Not assessed"} onClick={() => applyAssessment(repository, assessments[repository.id])} className="rounded-md bg-[#238636] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-50">Apply suggestion</button><span className="text-xs text-[#8b949e]">Suggestions never change your status until applied.</span></div></>}</div>}
                  </div>
                </article>)}
              </div>
            ) : <div className="mt-4 rounded-md border border-dashed border-[#30363d] px-6 py-14 text-center"><Search size={23} className="mx-auto text-[#6e7681]" /><h3 className="mt-3 font-semibold">{repositories.length ? "No matching repositories" : "No repositories imported yet"}</h3><p className="mt-1 text-sm text-[#8b949e]">{repositories.length ? "Try another search term or clear the status filter." : "Enter a public GitHub username above to import repositories."}</p><button onClick={() => { setQuery(""); setFilter("All projects"); }} className="mt-4 rounded-md border border-[#30363d] px-3 py-1.5 text-sm hover:bg-[#21262d]">Clear filters</button></div>}
          </section>
          <footer className="mt-10 flex flex-col gap-2 border-t border-[#30363d] py-5 text-xs text-[#8b949e] sm:flex-row sm:items-center sm:justify-between"><span>RepoPilot · Ghost-Machine</span><span className="inline-flex items-center gap-1.5"><BookOpen size={13} />{lastSynced ? "Public GitHub data imported" : "Waiting for repository import"}</span></footer>
        </div>
      </main>
    </div>
  );
}

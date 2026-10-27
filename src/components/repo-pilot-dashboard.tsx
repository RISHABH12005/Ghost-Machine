"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, Bell, BookOpen,
  CheckCircle2, ChevronDown, CircleHelp, Command, Filter, FolderGit2,
  GitBranch, Github, LayoutDashboard, ListTodo, LoaderCircle, Menu, Search,
  Settings2, Sparkles, Star, X, Zap, RefreshCw, CircleAlert, ExternalLink,
} from "lucide-react";
import type { ProjectStatus, Repository, RepositoryImportResponse } from "@/types/repository";

const DEFAULT_USERNAME = "RISHABH12005";
const STATUS_OPTIONS: ProjectStatus[] = [
  "Needs review", "In progress", "Needs attention", "Completed", "On hold",
];
const STATUS_STYLES: Record<ProjectStatus, string> = {
  "Needs review": "border-violet-400/20 bg-violet-400/10 text-violet-200",
  "In progress": "border-sky-400/20 bg-sky-400/10 text-sky-200",
  "Needs attention": "border-amber-400/20 bg-amber-400/10 text-amber-200",
  Completed: "border-lime-400/20 bg-lime-400/10 text-lime-200",
  "On hold": "border-zinc-700 bg-zinc-800/70 text-zinc-300",
};
const PROJECT_COLORS = [
  "from-lime-300/20 to-emerald-500/5 text-lime-200",
  "from-violet-400/20 to-indigo-500/5 text-violet-200",
  "from-sky-400/20 to-blue-500/5 text-sky-200",
  "from-pink-400/20 to-rose-500/5 text-pink-200",
  "from-amber-300/20 to-orange-500/5 text-amber-100",
];

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Repositories", icon: FolderGit2 },
  { label: "Work board", icon: ListTodo },
  { label: "Priorities", icon: Zap },
];

function relativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update date unavailable";
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days} days ago`;
  if (days < 365) return `Updated ${Math.floor(days / 30)} months ago`;
  return `Updated ${Math.floor(days / 365)} years ago`;
}

function StatusPill({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function MetricCard({ label, value, detail, icon: Icon, accent }: {
  label: string; value: string; detail: string; icon: typeof FolderGit2; accent: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel/80 p-5 transition hover:border-zinc-600">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-400">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">{value}</p>
        </div>
        <span className={`rounded-xl border border-white/5 bg-white/[0.035] p-2.5 ${accent}`}><Icon size={19} /></span>
      </div>
      <p className="mt-4 text-xs text-zinc-500">{detail}</p>
    </div>
  );
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
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(cleanUsername)) {
      setError("Enter a valid GitHub username.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/repositories?username=${encodeURIComponent(cleanUsername)}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as RepositoryImportResponse;
      if (!response.ok) throw new Error(data.error || "Could not import repositories.");
      const savedStatuses: Record<string, ProjectStatus> = {};
      if (typeof window !== "undefined") {
        try {
          Object.assign(savedStatuses, JSON.parse(localStorage.getItem(`repopilot-statuses:${cleanUsername.toLowerCase()}`) || "{}"));
        } catch { /* Ignore invalid local preferences and use safe defaults. */ }
      }
      const imported: Repository[] = data.repositories.map((repository) => ({
        ...repository,
        status: savedStatuses[String(repository.id)] || (repository.archived ? "On hold" : "Needs review"),
        note: "",
      }));
      setRepositories(imported);
      setUsername(cleanUsername);
      setUsernameInput(cleanUsername);
      setLastSynced(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Repository import failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void importRepositories(DEFAULT_USERNAME);
  }, [importRepositories]);

  const updateStatus = (id: number, status: ProjectStatus) => {
    const previous = repositories.find((repository) => repository.id === id);
    const updated = repositories.map((repository) => repository.id === id ? { ...repository, status } : repository);
    if (previous && previous.status !== status) setActivity((items) => [{ id: `${id}-${Date.now()}`, message: `${previous.name}: ${previous.status} → ${status}`, time: new Date().toLocaleString() }, ...items].slice(0, 50));
    setRepositories(updated);
    try {
      const statuses = Object.fromEntries(updated.map((repository) => [String(repository.id), repository.status]));
      localStorage.setItem(`repopilot-statuses:${username.toLowerCase()}`, JSON.stringify(statuses));
    } catch { /* Browser storage can be disabled; status still updates for this session. */ }
  };

  const filteredRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return repositories.filter((repository) => {
      const matchesQuery = !normalizedQuery || [
        repository.name, repository.fullName, repository.description, repository.language,
        repository.defaultBranch, repository.topics.join(" "),
      ].join(" ").toLowerCase().includes(normalizedQuery);
      const matchesFilter = filter === "All projects" || repository.status === filter;
      return matchesQuery && matchesFilter;
    });
  }, [query, filter, repositories]);

  const attentionCount = repositories.filter((repo) => repo.status === "Needs attention").length;
  const inProgressCount = repositories.filter((repo) => repo.status === "In progress").length;
  const completedCount = repositories.filter((repo) => repo.status === "Completed").length;
  const needsReviewCount = repositories.filter((repo) => repo.status === "Needs review").length;

  return (
    <div className="min-h-screen text-zinc-100">
      {mobileMenuOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-[#0c0c0f] px-4 py-5 transition-transform lg:translate-x-0 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300 text-zinc-950 shadow-glow"><Command size={21} strokeWidth={2.5} /></div>
          <div><p className="text-base font-semibold tracking-tight">RepoPilot</p><p className="text-xs text-zinc-500">GitHub command center</p></div>
          <button className="ml-auto rounded-lg p-1 text-zinc-500 hover:bg-white/5 lg:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="mt-9 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Workspace</div>
        <nav className="mt-3 space-y-1">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} onClick={() => navigateTo(label)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${activeNav === label ? "border border-lime-300/10 bg-lime-300/10 font-medium text-lime-200" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"}`}>
              <Icon size={17} />{label}
              {label === "Priorities" && attentionCount > 0 && <span className="ml-auto rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[10px] text-amber-200">{attentionCount}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-8 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Personal</div>
        <nav className="mt-3 space-y-1">
          <button onClick={() => navigateTo("Activity history")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"><Activity size={17} />Activity history</button>
          <button onClick={() => navigateTo("Settings")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"><Settings2 size={17} />Settings</button>
        </nav>
        <div className="mt-auto rounded-2xl border border-lime-300/10 bg-gradient-to-br from-lime-300/[0.09] to-transparent p-4">
          <div className="flex items-center gap-2 text-lime-200"><Sparkles size={16} /><span className="text-sm font-medium">AI project memory</span></div>
          <p className="mt-2 text-xs leading-5 text-zinc-400">Next milestone: turn repository evidence into summaries and useful next steps.</p>
          <span className="mt-3 inline-flex rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400">AI integration planned</span>
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-line px-2 pt-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-200">{username.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{username}</p><p className="truncate text-xs text-zinc-500">Public repository mode</p></div>
          <ChevronDown size={15} className="text-zinc-500" />
        </div>
      </aside>

      <main className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-line bg-[#09090b]/85 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="flex items-center gap-3">
            <button aria-label="Open navigation" onClick={() => setMobileMenuOpen(true)} className="rounded-lg border border-line p-2 text-zinc-300 lg:hidden"><Menu size={18} /></button>
            <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex"><span>Workspace</span><span>/</span><span className="text-zinc-200">{activeNav}</span></div>
            <span className="text-sm font-medium sm:hidden">{activeNav}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-line bg-white/[0.025] px-3 py-1.5 text-xs text-zinc-400 md:flex"><span className="h-1.5 w-1.5 rounded-full bg-lime-300" />Live public GitHub data</span>
            <button aria-label="Help and usage guide" title="Help and usage guide" onClick={() => setActivePanel("help")} className="rounded-xl p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"><CircleHelp size={18} /></button>
            <button aria-label={`Notifications: ${attentionCount} projects need attention`} title="View notifications" onClick={() => setActivePanel("notifications")} className="relative rounded-xl p-2 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"><Bell size={18} />{attentionCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-300 ring-2 ring-[#09090b]" />}</button>
            <a href={`https://github.com/${username}`} target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-white/5 sm:flex"><Github size={15} /> GitHub profile <ArrowUpRight size={13} /></a>
          </div>
        </header>

        {activePanel && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="panel-title" className="w-full max-w-lg rounded-2xl border border-line bg-[#111114] p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lime-200">Ghost-Machine</p><h2 id="panel-title" className="mt-2 text-xl font-semibold text-zinc-100">{activePanel === "help" ? "How to use RepoPilot" : activePanel === "notifications" ? "Project notifications" : activePanel === "activity" ? "Activity history" : "Workspace settings"}</h2></div><button onClick={() => setActivePanel(null)} aria-label="Close dialog" className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white"><X size={18} /></button></div>{activePanel === "help" ? <div className="mt-5 space-y-3 text-sm leading-6 text-zinc-300"><p><strong>Import repositories:</strong> enter a public GitHub username and select Import repositories.</p><p><strong>Search and filter:</strong> search by repository name, description, language, branch, or topic, then filter by project status.</p><p><strong>Track progress:</strong> change a repository status. It is saved in this browser for that GitHub username.</p><p><strong>Limitations:</strong> private repositories, cross-device sync, and AI summaries are not enabled yet.</p></div> : activePanel === "notifications" ? <div className="mt-5"><p className="text-sm text-zinc-400">{attentionCount ? `${attentionCount} project${attentionCount === 1 ? "" : "s"} marked for attention.` : "Nothing is marked as needing attention right now."}</p><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{repositories.filter((repo) => repo.status === "Needs attention").map((repo) => <a key={repo.id} href={repo.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm hover:bg-white/[0.03]"><span className="truncate text-zinc-200">{repo.name}</span><ExternalLink size={14} className="shrink-0 text-zinc-500" /></a>)}</div><button onClick={() => { setActivePanel(null); navigateTo("Priorities"); }} className="mt-4 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-lime-200">View priorities</button></div> : activePanel === "activity" ? <div className="mt-5">{activity.length ? <ol className="max-h-80 space-y-3 overflow-y-auto">{activity.map((item) => <li key={item.id} className="border-l border-zinc-700 pl-3"><p className="text-sm text-zinc-200">{item.message}</p><p className="mt-1 text-xs text-zinc-500">{item.time}</p></li>)}</ol> : <p className="rounded-xl border border-dashed border-zinc-700 p-5 text-sm text-zinc-400">No status changes in this session yet. Change a repository status and it will appear here.</p>}</div> : <div className="mt-5 space-y-4"><div><label htmlFor="settings-username" className="mb-2 block text-sm text-zinc-300">GitHub username</label><input id="settings-username" value={usernameInput} onChange={(event) => setUsernameInput(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-black/20 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300" /></div><button onClick={() => { setActivePanel(null); void importRepositories(usernameInput); }} disabled={loading} className="w-full rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-lime-200 disabled:opacity-50">Import this account</button><div className="rounded-xl border border-line p-3"><p className="text-sm font-medium text-zinc-200">Reset saved statuses</p><p className="mt-1 text-xs leading-5 text-zinc-500">Remove status preferences for @{username}. This cannot be undone.</p><button onClick={() => { try { localStorage.removeItem(`repopilot-statuses:${username.toLowerCase()}`); } catch {} setRepositories((items) => items.map((repo) => ({ ...repo, status: repo.archived ? "On hold" : "Needs review" }))); setActivity((items) => [{ id: `reset-${Date.now()}`, message: `Reset saved statuses for @${username}`, time: new Date().toLocaleString() }, ...items].slice(0, 50)); setActivePanel(null); }} className="mt-3 rounded-lg border border-rose-400/25 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-400/10">Reset statuses</button></div></div>}<div className="mt-6 flex justify-end border-t border-line pt-4"><button onClick={() => setActivePanel(null)} className="rounded-xl border border-line px-4 py-2 text-sm text-zinc-300 hover:bg-white/[0.04]">Close</button></div></section></div>}
        <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-9 lg:px-10">
          <section className="grid-bg relative overflow-hidden rounded-3xl border border-line bg-[#101013] p-6 shadow-glow sm:p-8 lg:p-9">
            <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full bg-lime-300/[0.07] blur-3xl" />
            <div className="relative max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-lime-300/15 bg-lime-300/[0.06] px-3 py-1.5 text-xs text-lime-200"><Sparkles size={13} /> Less searching. More building.</div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[42px]">Your projects,<br className="hidden sm:block" /> back in focus.</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base sm:leading-7">Import public repositories, organize what needs attention, and find the next project to revive.</p>
              <form className="mt-6 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void importRepositories(usernameInput); }}>
                <label className="flex min-h-11 flex-1 items-center gap-2.5 rounded-xl border border-line bg-black/20 px-3.5 focus-within:border-zinc-500">
                  <Github size={17} className="shrink-0 text-zinc-500" />
                  <span className="text-sm text-zinc-500">github.com/</span>
                  <input value={usernameInput} onChange={(event) => setUsernameInput(event.target.value)} aria-label="GitHub username" placeholder="GitHub username" className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
                </label>
                <button disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={15} />} {loading ? "Importing..." : "Import repositories"}
                </button>
              </form>
              <p className="mt-3 text-xs text-zinc-500">Public repositories only for now. Private repositories require GitHub OAuth, which is a later setup step.</p>
            </div>
          </section>

          {error && <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200"><CircleAlert size={18} className="mt-0.5 shrink-0" /><div className="flex-1">{error}</div><button onClick={() => void importRepositories(username)} className="font-medium underline underline-offset-4">Retry</button></div>}

          <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Imported repositories" value={loading && repositories.length === 0 ? "…" : String(repositories.length)} detail="Public, non-fork repositories" icon={FolderGit2} accent="text-zinc-300" />
            <MetricCard label="In progress" value={String(inProgressCount)} detail="Statuses you assigned" icon={GitBranch} accent="text-sky-200" />
            <MetricCard label="Needs attention" value={String(attentionCount)} detail="Marked for follow-up" icon={Zap} accent="text-amber-200" />
            <MetricCard label="Needs review" value={String(needsReviewCount)} detail={`${completedCount} marked completed`} icon={CheckCircle2} accent="text-lime-200" />
          </section>

          <section id="repositories" className="mt-10 scroll-mt-24">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Portfolio</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">Your repositories</h2><p className="mt-1 text-sm text-zinc-500">{repositories.length ? `Showing public repositories from @${username}` : "Import a GitHub username to get started."}{lastSynced ? ` · Synced at ${lastSynced}` : ""}</p></div>
              <a href={`https://github.com/${username}?tab=repositories`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 self-start rounded-xl border border-line px-3.5 py-2.5 text-sm text-zinc-300 transition hover:border-zinc-600 hover:bg-white/[0.03] sm:self-auto">Open on GitHub <ExternalLink size={14} /></a>
            </div>
            <div className="mt-5 flex flex-col gap-3 md:flex-row">
              <label className="flex min-h-11 flex-1 items-center gap-2.5 rounded-xl border border-line bg-panel px-3.5 transition focus-within:border-zinc-500"><Search size={17} className="shrink-0 text-zinc-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, descriptions, languages, topics..." className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600" aria-label="Search repositories" />{query && <button onClick={() => setQuery("")} aria-label="Clear search" className="text-zinc-500 hover:text-white"><X size={15} /></button>}</label>
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3.5 text-sm text-zinc-400"><Filter size={16} /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="max-w-[190px] bg-transparent pr-2 text-sm outline-none" aria-label="Filter by status"><option>All projects</option>{STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select></label>
            </div>

            {loading && repositories.length === 0 ? (
              <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl border border-line bg-panel/60 px-6 py-16 text-sm text-zinc-400"><LoaderCircle className="animate-spin" size={19} /> Fetching public repositories from GitHub...</div>
            ) : filteredRepositories.length > 0 ? (
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {filteredRepositories.map((repository, index) => (
                  <article key={repository.id} className="group rounded-2xl border border-line bg-panel/70 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-zinc-600 hover:bg-panel sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/5 bg-gradient-to-br text-sm font-semibold ${PROJECT_COLORS[index % PROJECT_COLORS.length]}`}>{repository.name.slice(0, 2).toUpperCase()}</div>
                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="break-all font-semibold text-zinc-100">{repository.name}</h3><StatusPill status={repository.status} />{repository.archived && <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">Archived</span>}</div><p className="mt-2 text-sm leading-5 text-zinc-400">{repository.description}</p></div>
                      <a href={repository.url} target="_blank" rel="noreferrer" aria-label={`Open ${repository.name} on GitHub`} className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-white/5 hover:text-zinc-200"><ArrowUpRight size={17} /></a>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-4 text-xs text-zinc-500"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-zinc-500" />{repository.language}</span><span className="inline-flex items-center gap-1.5"><Star size={13} />{repository.stars} stars</span><span>{relativeDate(repository.updatedAt)}</span><span>{repository.openIssues} open issues</span></div>
                    {repository.topics.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{repository.topics.slice(0, 5).map((topic) => <span key={topic} className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-zinc-400">{topic}</span>)}</div>}
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><label className="text-xs text-zinc-500">My project status <select value={repository.status} onChange={(event) => updateStatus(repository.id, event.target.value as ProjectStatus)} className="ml-2 rounded-lg border border-line bg-[#0b0b0e] px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><span className="text-[10px] text-zinc-600">Saved in this browser</span></div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-zinc-700 px-6 py-14 text-center"><Search size={24} className="mx-auto text-zinc-600" /><h3 className="mt-3 font-medium text-zinc-200">{repositories.length ? "No matching repositories" : "No repositories imported yet"}</h3><p className="mt-1 text-sm text-zinc-500">{repositories.length ? "Try another search term or clear the status filter." : "Enter a public GitHub username above to import repositories."}</p><button onClick={() => { setQuery(""); setFilter("All projects"); }} className="mt-4 text-sm font-medium text-lime-200 hover:text-lime-100">Clear filters</button></div>
            )}
          </section>
          <footer className="mt-12 flex flex-col gap-2 border-t border-line py-6 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between"><span>RepoPilot · Ghost-Machine</span><span className="inline-flex items-center gap-1.5"><BookOpen size={13} /> {lastSynced ? "Public GitHub data imported" : "Waiting for repository import"}</span></footer>
        </div>
      </main>
    </div>
  );
}

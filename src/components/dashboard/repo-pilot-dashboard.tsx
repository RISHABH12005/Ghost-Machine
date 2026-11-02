"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle, ArrowLeft, BookOpen, Bot, Check, CheckCircle2, ChevronDown, ChevronRight, Copy,
  CircleDot, Clock3, ExternalLink, FolderGit2,
  GitBranch, Github, LayoutDashboard, ListTodo, LoaderCircle, LogOut, Menu, Plus, RefreshCw,
  Search, Send, Settings2, ShieldAlert, Sparkles, Star, Trash2, X,
} from "lucide-react";
import type { ProjectStatus, Repository, RepositoryImportResponse } from "@/types/github/repository";

type AiRepositorySummary = { summary: string; model: string; generatedAt: string; source: string; error?: string };
type AiProjectSuggestion = { id: number; status: ProjectStatus; priority: number; reason: string };
type AiOrganization = { projects: AiProjectSuggestion[]; model: string; generatedAt: string };
type RepositoryAssessment = { status: ProjectStatus; confidence: string; assessedAt: string; evidence: Array<{ kind: string; detail: string; url?: string; observedAt?: string }>; limitations?: string[]; error?: string };
const STATUS_OPTIONS: ProjectStatus[] = ["Not assessed", "Needs review", "In progress", "Needs attention", "Completed", "On hold"];
const STATUS_STYLES: Record<ProjectStatus, string> = {
  "Not assessed": "border-[#6e7681]/60 bg-[#6e7681]/10 text-[#aab2bd]",
  "Needs review": "border-[#8957e5]/60 bg-[#8957e5]/12 text-[#d2a8ff]",
  "In progress": "border-[#1f6feb]/70 bg-[#1f6feb]/12 text-[#79c0ff]",
  "Needs attention": "border-[#da3633]/65 bg-[#da3633]/12 text-[#ff7b72]",
  Completed: "border-[#238636]/65 bg-[#238636]/12 text-[#3fb950]",
  "On hold": "border-[#9e6a03]/65 bg-[#9e6a03]/12 text-[#e3b341]",
};
const STATUS_DOT_STYLES: Record<ProjectStatus, string> = {
  "Not assessed": "bg-[#8b949e]",
  "Needs review": "bg-[#a371f7]",
  "In progress": "bg-[#58a6ff]",
  "Needs attention": "bg-[#f85149]",
  Completed: "bg-[#3fb950]",
  "On hold": "bg-[#d29922]",
};
const navItems = [
  { label: "Dashboard", icon: LayoutDashboard },
];


function renderInlineMarkdown(value: string): React.ReactNode[] {
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|\`[^\`]+\`)/g;
  const parts = value.split(pattern).filter(Boolean);
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer" className="text-[#79c0ff] underline decoration-[#79c0ff]/40 underline-offset-2 hover:decoration-[#79c0ff]">{link[1]}</a>;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={index} className="font-semibold text-[#f0f6fc]">{part.slice(2,-2)}</strong>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={index}>{part.slice(1,-1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-[#30363d] px-1.5 py-0.5 font-mono text-[0.9em] text-[#e6edf3]">{part.slice(1,-1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blocks.length}`} className="my-3 leading-7 text-[#d1d9e0]">{renderInlineMarkdown(paragraph.join(" "))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length || !listType) return;
    const items = listItems.map((item, index) => <li key={index} className="pl-1 leading-7 text-[#d1d9e0]">{renderInlineMarkdown(item)}</li>);
    blocks.push(listType === "ol"
      ? <ol key={`ol-${blocks.length}`} className="my-3 list-decimal space-y-1 pl-6 marker:text-[#8b949e]">{items}</ol>
      : <ul key={`ul-${blocks.length}`} className="my-3 list-disc space-y-1 pl-6 marker:text-[#8b949e]">{items}</ul>);
    listItems = [];
    listType = null;
  };
  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) { flushParagraph(); flushList(); return; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      const level = heading[1].length;
      const className = level === 1 ? "mt-5 mb-2 text-lg font-semibold text-[#f0f6fc]" : level === 2 ? "mt-5 mb-2 text-base font-semibold text-[#f0f6fc]" : "mt-4 mb-1.5 text-sm font-semibold text-[#e6edf3]";
      blocks.push(level === 1
        ? <h3 key={`h-${blocks.length}`} className={className}>{renderInlineMarkdown(heading[2])}</h3>
        : <h4 key={`h-${blocks.length}`} className={className}>{renderInlineMarkdown(heading[2])}</h4>);
      return;
    }
    const unordered = line.match(/^(?:[-*+]\s+)(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    const nextType = unordered ? "ul" : ordered ? "ol" : null;
    if (nextType) {
      flushParagraph();
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((unordered || ordered)![1]);
      return;
    }
    flushList();
    paragraph.push(line);
  });
  flushParagraph(); flushList();
  return <div className="break-words text-sm">{blocks}</div>;
}

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

function StatusSelector({
  status,
  repositoryName,
  onChange,
}: {
  status: ProjectStatus;
  repositoryName: string;
  onChange: (status: ProjectStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, STATUS_OPTIONS.indexOf(status)));
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, activeIndex]);

  return (
    <div ref={rootRef} className="relative inline-flex max-w-full">
      <button
        type="button"
        aria-label={"Change status for " + repositoryName}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={"Change status: " + status}
        onClick={() => {
          setActiveIndex(Math.max(0, STATUS_OPTIONS.indexOf(status)));
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={"inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition duration-150 hover:-translate-y-px hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8957e5]/70 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0d1117] " + STATUS_STYLES[status]}
      >
        <span aria-hidden="true" className={"h-2 w-2 shrink-0 rounded-full " + STATUS_DOT_STYLES[status]} />
        <span className="truncate">{status}</span>
        <ChevronDown size={13} className={"shrink-0 opacity-80 transition-transform duration-150 " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={"Choose status for " + repositoryName}
          className="absolute right-0 top-[calc(100%+7px)] z-40 w-52 overflow-hidden rounded-xl border border-[#3d444d] bg-[#161b22] p-1.5 shadow-[0_16px_42px_rgba(0,0,0,.55)]"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#8b949e]">Set project status</p>
          {STATUS_OPTIONS.map((option) => {
            const selected = option === status;
            return (
              <button
                key={option}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={activeIndex === index ? 0 : -1}
                onMouseEnter={() => setActiveIndex(index)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((current) => (current + 1) % STATUS_OPTIONS.length);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((current) => (current - 1 + STATUS_OPTIONS.length) % STATUS_OPTIONS.length);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    setActiveIndex(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    setActiveIndex(STATUS_OPTIONS.length - 1);
                  }
                }}
                onClick={() => {
                  onChange(option);
                  setActiveIndex(index);
                  setOpen(false);
                }}
                className={"flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8957e5] " + (selected ? STATUS_STYLES[option] + " bg-white/[.04]" : "text-[#c9d1d9] hover:bg-[#21262d]")}
              >
                <span aria-hidden="true" className={"h-2.5 w-2.5 shrink-0 rounded-full " + STATUS_DOT_STYLES[option]} />
                <span className="min-w-0 flex-1">{option}</span>
                {selected && <Check size={13} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
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
  const [signingOut, setSigningOut] = useState(false);
  const [aiSummaries, setAiSummaries] = useState<Record<number, AiRepositorySummary>>({});
  const [summarizingId, setSummarizingId] = useState<number | null>(null);
  const [organizationMode, setOrganizationMode] = useState<"manual" | "ai">("manual");
  const [aiOrganization, setAiOrganization] = useState<AiOrganization | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(76);
  const [aiChatWidth, setAiChatWidth] = useState(460);
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [aiChatRepositoryId, setAiChatRepositoryId] = useState<number | null>(null);
  const [aiRepoPickerOpen, setAiRepoPickerOpen] = useState(false);
  const [aiRepoSearch, setAiRepoSearch] = useState("");
  const [aiChatMessages, setAiChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatSending, setAiChatSending] = useState(false);
  const [aiChatHistoryLoading, setAiChatHistoryLoading] = useState(false);
  const [aiChatError, setAiChatError] = useState("");
  const [copiedChatIndex, setCopiedChatIndex] = useState<number | null>(null);
  const aiChatEndRef = useRef<HTMLDivElement>(null);
  const aiChatComposerRef = useRef<HTMLTextAreaElement>(null);
  const [aiUsage, setAiUsage] = useState({ total: 0, chats: 0, summaries: 0, organization: 0 });
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [workspaceSaveStatus, setWorkspaceSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [workspaceSaveError, setWorkspaceSaveError] = useState("");

  const buildWorkspacePayload = useCallback(() => ({
    activity: activity.slice(0, 50),
    aiSummaries,
    aiOrganization,
    assessments,
    workspace: {
      statuses: Object.fromEntries(repositories.map((repository) => [String(repository.id), repository.status])),
    },
  }), [activity, aiSummaries, aiOrganization, assessments, repositories]);

  useEffect(() => {
    if (!username) {
      setWorkspaceHydrated(false);
      return;
    }
    let active = true;
    setWorkspaceHydrated(false);
    void (async () => {
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        const saved = await response.json() as {
          exists?: boolean;
          error?: string;
          aiUsage?: Partial<typeof aiUsage>;
          activity?: typeof activity;
          aiSummaries?: Record<number, AiRepositorySummary>;
          aiOrganization?: AiOrganization | null;
          assessments?: Record<number, RepositoryAssessment>;
          workspace?: { statuses?: Record<string, ProjectStatus>; aiChatMessages?: Array<{ role: "user" | "assistant"; content: string }> };
        };
        if (!response.ok) throw new Error(saved.error || "Could not load saved workspace data.");
        if (!active) return;
        const usage = saved.aiUsage || {};
        let organization = saved.aiOrganization && Array.isArray(saved.aiOrganization.projects) ? saved.aiOrganization : null;
        const statuses: Record<string, ProjectStatus> = { ...(saved.workspace?.statuses || {}) };
        if (saved.exists === false) {
          try {
            const legacyStatuses = JSON.parse(localStorage.getItem(`repopilot-statuses:${username.toLowerCase()}`) || "{}") as Record<string, ProjectStatus>;
            Object.assign(statuses, legacyStatuses);
            const legacyOrganization = JSON.parse(localStorage.getItem(`repopilot-ai-organization:${username.toLowerCase()}`) || "null") as AiOrganization | null;
            if (!organization && legacyOrganization && Array.isArray(legacyOrganization.projects)) organization = legacyOrganization;
          } catch { /* Ignore malformed legacy browser data and use the database defaults. */ }
        }
        setAiUsage({
          total: Number(usage.total) || 0,
          chats: Number(usage.chats) || 0,
          summaries: Number(usage.summaries) || 0,
          organization: Number(usage.organization) || 0,
        });
        setActivity(Array.isArray(saved.activity) ? saved.activity : []);
        setAiSummaries(saved.aiSummaries && typeof saved.aiSummaries === "object" ? saved.aiSummaries : {});
        setAiOrganization(organization);
        setOrganizationMode(organization ? "ai" : "manual");
        setAssessments(saved.assessments && typeof saved.assessments === "object" ? saved.assessments : {});
        setRepositories((items) => items.map((repository) => ({
          ...repository,
          status: statuses[String(repository.id)] || repository.status,
        })));
        // Repository chat history loads separately from the persistent chat-history API.
        setWorkspaceHydrated(true);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load saved workspace data.");
      }
    })();
    return () => { active = false; };
  }, [username]);

  useEffect(() => {
    if (!username || !workspaceHydrated) return;
    const timer = window.setTimeout(() => {
      setWorkspaceSaveError("");
      setWorkspaceSaveStatus("saving");
      void fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildWorkspacePayload()),
        signal: AbortSignal.timeout(30_000),
      }).then(async (response) => {
        const result = await response.json().catch(() => ({})) as { error?: string; errorCode?: string; errorDetail?: string };
        if (!response.ok) {
          const details = [result.error, result.errorCode, result.errorDetail].filter(Boolean).join(" — ");
          throw new Error(details || "Workspace save failed.");
        }
        const account = username.toLowerCase();
        localStorage.removeItem(`repopilot-ai-usage:${account}`);
        localStorage.removeItem(`repopilot-statuses:${account}`);
        localStorage.removeItem(`repopilot-ai-organization:${account}`);
        setWorkspaceSaveStatus("saved");
      }).catch((cause) => {
        const message = cause instanceof Error ? cause.message : "Workspace save failed.";
        console.error("[workspace] Autosave failed:", cause);
        setWorkspaceSaveError(message);
        setWorkspaceSaveStatus("error");
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [username, workspaceHydrated, buildWorkspacePayload]);

  const clearAllWorkspaceData = async () => {
    const confirmed = window.confirm("Clear all RepoPilot workspace data saved for this GitHub account? This resets project statuses, AI suggestions, AI usage counts, and activity history in the workspace database. It does not delete GitHub repositories or disconnect your GitHub account.");
    if (!confirmed) return;

    setWorkspaceSaveStatus("saving");
    setWorkspaceSaveError("");
    try {
      const response = await fetch("/api/workspace", { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not clear the saved workspace.");

      try {
        Object.keys(localStorage).filter((key) => key.startsWith("repopilot-")).forEach((key) => localStorage.removeItem(key));
      } catch { /* Continue with the in-memory reset if browser storage is unavailable. */ }
      setRepositories((items) => items.map((item) => ({ ...item, status: item.archived ? "On hold" : "Not assessed" })));
      setAiOrganization(null);
      setOrganizationMode("manual");
      setAiSummaries({});
      setAssessments({});
      setAiChatMessages([]);
      setAiChatInput("");
      setAiChatError("");
      setAiUsage({ total: 0, chats: 0, summaries: 0, organization: 0 });
      setActivity([]);
      setOrganizationError("");
      setQuery("");
      setFilter("All projects");
      setWorkspaceSaveStatus("saved");
    } catch (cause) {
      setWorkspaceSaveError(cause instanceof Error ? cause.message : "Could not clear the saved workspace.");
      setWorkspaceSaveStatus("error");
    }
  };

  const navigateTo = (label: string) => {
    const routes: Record<string, string> = {
      "Dashboard": "/dashboard",
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
      : pathname === "/settings" ? "Settings"
      : pathname === "/ai-talk" ? "AI Talk" : "Dashboard";
    setActiveNav(page);
    setFilter(page === "Work board" ? "In progress" : page === "Priorities" ? "Needs attention" : "All projects");
    if (page === "Dashboard") setQuery("");
  }, [pathname]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      if (username && workspaceHydrated) {
        const saveResponse = await fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildWorkspacePayload()),
        });
        if (!saveResponse.ok) throw new Error("Could not save your workspace before signing out. Please try again.");
      }
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out. Please try again.");
      setWorkspaceHydrated(false);
      setGithubUser(null);
      setRepositories([]);
      setUsername("");
      setAiChatMessages([]);
      setAiChatRepositoryId(null);
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign out failed.");
      setSigningOut(false);
    }
  };

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
      setRepositories((current) => data.repositories.map((repository) => ({
        ...repository,
        status: current.find((item) => item.id === repository.id)?.status || (repository.archived ? "On hold" : "Not assessed"),
        note: "",
      })));
      setUsername(data.username);
      setSidebarCollapsed(false); // Expand navigation when the connected workspace loads.
      setSidebarWidth(260);
      try {
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
      const result = await response.json() as AiOrganization & { error?: string; aiUsage?: typeof aiUsage };
      if (!response.ok) throw new Error(result.error || "AI organization failed.");
      const { aiUsage: usage, ...organization } = result;
      setAiOrganization(organization);
      if (usage) setAiUsage(usage);
      setOrganizationMode("ai");
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
    setActivity((items) => [{ id: `ai-apply-${Date.now()}`, message: `Applied AI status suggestions to ${aiOrganization.projects.length} repositories`, time: new Date().toLocaleString() }, ...items].slice(0, 50));
    setOrganizationMode("manual");
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
      const result = await response.json() as AiRepositorySummary & { error?: string; aiUsage?: typeof aiUsage };
      if (!response.ok) throw new Error(result.error || "AI summary failed.");
      const { aiUsage: usage, ...summary } = result;
      setAiSummaries((items) => ({ ...items, [repository.id]: summary }));
      if (usage) setAiUsage(usage);
    } catch (error) {
      setAiSummaries((items) => ({ ...items, [repository.id]: { summary: "", model: "", generatedAt: new Date().toISOString(), source: "", error: error instanceof Error ? error.message : "AI summary failed." } }));
    } finally { setSummarizingId(null); }
  };

  const sendAiChatMessage = async (prompt?: string) => {
    const message = (prompt ?? aiChatInput).trim();
    const selectedRepository = aiChatRepositories.find((item) => item.id === aiChatRepositoryId) || aiChatRepositories[0];
    if (!message || !selectedRepository || aiChatSending || aiChatHistoryLoading) return;
    setAiChatMessages((items) => [...items, { role: "user", content: message }]);
    setAiChatInput("");
    setAiChatError("");
    setAiChatSending(true);
    const [owner, repoName] = selectedRepository.fullName.split("/");
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo: repoName, message }),
      });
      const result = await response.json() as { reply?: string; model?: string; error?: string; aiUsage?: typeof aiUsage };
      if (!response.ok) throw new Error(result.error || "AI Talk could not respond.");
      setAiChatMessages((items) => [...items, { role: "assistant", content: result.reply || "I couldn't generate a reply." }]);
      if (result.aiUsage) setAiUsage(result.aiUsage);
    } catch (cause) {
      setAiChatMessages((items) => items.length && items[items.length - 1]?.role === "user" ? items.slice(0, -1) : items);
      setAiChatInput(message);
      setAiChatError(cause instanceof Error ? cause.message : "AI Talk failed. Please try again.");
    } finally {
      setAiChatSending(false);
    }
  };

  const copyAiChatMessage = async (message: string, index: number) => {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedChatIndex(index);
      window.setTimeout(() => setCopiedChatIndex((current) => current === index ? null : current), 1600);
    } catch {
      setAiChatError("Clipboard access was blocked by your browser. Select the answer and copy it manually.");
    }
  };

  const startNewAiChat = async () => {
    if (aiChatSending || aiChatHistoryLoading || !selectedAiRepository) return;
    const confirmed = window.confirm("Start a new chat? This permanently clears the saved conversation for this repository.");
    if (!confirmed) return;
    const [owner, repoName] = selectedAiRepository.fullName.split("/");
    try {
      const params = new URLSearchParams({ owner, repo: repoName });
      const response = await fetch(`/api/ai/chat?${params.toString()}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not clear this conversation.");
      setAiChatMessages([]);
      setAiChatInput("");
      setAiChatError("");
      setCopiedChatIndex(null);
      aiChatComposerRef.current?.focus();
    } catch (cause) {
      setAiChatError(cause instanceof Error ? cause.message : "Could not clear this conversation.");
    }
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
    // The account-scoped workspace autosave persists status changes to the account workspace database.
  };

  const aiChatRepositories = useMemo(
    () => repositories.filter((repository) => repository.fullName.split("/")[0]?.toLowerCase() === username.toLowerCase()),
    [repositories, username],
  );
  const selectedAiRepository = aiChatRepositories.find((repository) => repository.id === aiChatRepositoryId) || aiChatRepositories[0] || null;
  const matchingAiRepositories = useMemo(() => {
    const search = aiRepoSearch.trim().toLowerCase();
    return aiChatRepositories.filter((repository) => !search || repository.fullName.toLowerCase().includes(search));
  }, [aiChatRepositories, aiRepoSearch]);

  const selectedAiRepositoryFullName = selectedAiRepository?.fullName || "";
  useEffect(() => {
    if (!username || !selectedAiRepositoryFullName) {
      setAiChatMessages([]);
      setAiChatHistoryLoading(false);
      return;
    }

    let active = true;
    const [owner, repoName] = selectedAiRepositoryFullName.split("/");
    setAiChatMessages([]);
    setAiChatError("");
    setAiChatHistoryLoading(true);
    const params = new URLSearchParams({ owner, repo: repoName });
    void fetch(`/api/ai/chat?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({})) as { messages?: Array<{ role: "user" | "assistant"; content: string }>; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not load saved chat history.");
        if (active) setAiChatMessages(Array.isArray(result.messages) ? result.messages : []);
      })
      .catch((cause) => {
        if (active) setAiChatError(cause instanceof Error ? cause.message : "Could not load saved chat history.");
      })
      .finally(() => {
        if (active) setAiChatHistoryLoading(false);
      });

    return () => { active = false; };
  }, [username, selectedAiRepositoryFullName]);

  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: aiChatSending ? "smooth" : "auto", block: "end" });
  }, [aiChatMessages, aiChatSending, aiChatError]);

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
    const interval = window.setInterval(() => void importRepositories(), 60_000);
    return () => window.clearInterval(interval);
  }, [githubUser, importRepositories]);

  const resizeSidebar = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) return;
    const requestedWidth = Math.min(360, event.clientX);
    const collapsed = requestedWidth < 150;
    // Snap to a true icon rail or keep enough room for the full navigation labels.
    setSidebarCollapsed(collapsed);
    setSidebarWidth(collapsed ? 76 : Math.max(200, requestedWidth));
  };
  const resizeAiChat = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) return;
    setAiChatWidth(Math.max(320, Math.min(760, window.innerWidth - event.clientX)));
  };

  const toggleAiSidebar = () => {
    setAiSidebarOpen((current) => {
      const next = !current;
      try { localStorage.setItem(`repopilot-ai-sidebar:${username.toLowerCase()}`, String(next)); } catch {}
      return next;
    });
  };

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(STATUS_OPTIONS.map((status) => [status, 0])) as Record<ProjectStatus, number>;
    for (const repository of repositories) {
      const suggestedStatus = organizationMode === "ai"
        ? aiOrganization?.projects.find((item) => item.id === repository.id)?.status
        : undefined;
      counts[suggestedStatus || repository.status] += 1;
    }
    return counts;
  }, [repositories, organizationMode, aiOrganization]);
  const attentionCount = statusCounts["Needs attention"];
  const inProgressCount = statusCounts["In progress"];
  const completedCount = statusCounts.Completed;
  const isOverviewPage = pathname === "/dashboard" || pathname === "/";
  const isRepositoryPage = isOverviewPage || ["/repositories", "/work-board", "/priorities"].includes(pathname);
  const isActivityPage = pathname === "/activity";
  const isSettingsPage = pathname === "/settings";



  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {mobileMenuOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}
      <aside id="workspace-sidebar" style={{ width: mobileMenuOpen ? "min(280px, 85vw)" : sidebarWidth, boxSizing: "border-box" }} className={`fixed inset-y-0 left-0 z-40 flex flex-col overflow-x-hidden overflow-y-auto overscroll-contain border-r border-[#30363d] bg-[#0d1117] py-4 transition-[width,transform] duration-200 ease-out lg:translate-x-0 ${sidebarCollapsed && !mobileMenuOpen ? "px-2" : "px-3"} ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className={`flex min-w-0 items-center gap-2 pb-4 ${sidebarCollapsed && !mobileMenuOpen ? "justify-center" : "px-2"}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f0f6fc] text-[#0d1117]"><Github size={22} /></div>
          {(!sidebarCollapsed || mobileMenuOpen) && <div className="min-w-0 flex-1 overflow-hidden"><p className="truncate text-sm font-semibold text-[#f0f6fc]">RepoPilot</p><p className="text-xs leading-4 text-[#8b949e]">Your repository workspace</p></div>}
          <div className="ml-auto flex items-center gap-1">
            
            <button className="rounded-md p-1.5 text-[#8b949e] hover:bg-[#21262d] lg:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"><X size={17} /></button>
          </div>
        </div>
        {(!sidebarCollapsed || mobileMenuOpen) && <div className="mt-5 px-2 text-xs font-semibold text-[#8b949e]">Workspace</div>}
        <nav className="mt-2 space-y-1">
          {navItems.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => navigateTo(label)} title={sidebarCollapsed && !mobileMenuOpen ? label : undefined} aria-label={label} className={`flex min-h-10 w-full min-w-0 items-center overflow-hidden rounded-md border-l-2 py-2 text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] ${sidebarCollapsed && !mobileMenuOpen ? "justify-center px-0" : "gap-2.5 px-2.5 text-left"} ${activeNav === label ? "border-l-[#f78166] bg-[#161b22] font-semibold text-[#f0f6fc]" : "border-l-transparent text-[#c9d1d9] hover:bg-[#161b22]"}`}><Icon size={16} className={`shrink-0 ${activeNav === label ? "text-[#f0f6fc]" : "text-[#8b949e]"}`} />{(!sidebarCollapsed || mobileMenuOpen) && <span className="min-w-0 truncate">{label}</span>}</button>) }
        </nav>
        <nav className="mt-2 space-y-1">
          <button type="button" onClick={() => { setMobileMenuOpen(false); router.push("/ai-talk"); }} title="AI Talk" aria-label="AI Talk" className={`flex min-h-10 w-full min-w-0 items-center overflow-hidden rounded-md border-l-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8957e5] ${sidebarCollapsed && !mobileMenuOpen ? "justify-center px-0" : "gap-2.5 px-2.5 text-left"} ${pathname === "/ai-talk" ? "border-l-[#8957e5] bg-[#211638] font-semibold text-[#e6d5ff]" : "border-l-transparent text-[#c9d1d9] hover:bg-[#161b22]"}`}><Sparkles size={16} className="shrink-0 text-[#d2a8ff]" />{(!sidebarCollapsed || mobileMenuOpen) && <span className="truncate">AI Talk</span>}</button>
          <button type="button" onClick={() => navigateTo("Settings")} title="Settings" aria-label="Settings" className={`flex min-h-10 w-full min-w-0 items-center overflow-hidden rounded-md border-l-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] ${sidebarCollapsed && !mobileMenuOpen ? "justify-center px-0" : "gap-2.5 px-2.5 text-left"} ${activeNav === "Settings" ? "border-l-[#f78166] bg-[#161b22] font-semibold text-[#f0f6fc]" : "border-l-transparent text-[#c9d1d9] hover:bg-[#161b22]"}`}><Settings2 size={16} className={`shrink-0 ${activeNav === "Settings" ? "text-[#f0f6fc]" : "text-[#8b949e]"}`} />{(!sidebarCollapsed || mobileMenuOpen) && <span className="truncate">Settings</span>}</button>
        </nav>
        <div role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); resizeSidebar(event); }} onPointerMove={resizeSidebar} className="absolute right-0 top-0 z-40 hidden h-full w-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-[#58a6ff]/50 lg:block" />
        <div className="absolute right-1.5 top-1/2 z-50 hidden -translate-y-1/2 lg:block">
          <button type="button" onClick={() => { const nextCollapsed = !sidebarCollapsed; setSidebarCollapsed(nextCollapsed); setSidebarWidth(nextCollapsed ? 76 : 260); }} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="flex h-9 w-6 items-center justify-center rounded-full border border-[#30363d] bg-[#161b22] text-[#8b949e] shadow-lg transition hover:border-[#58a6ff] hover:bg-[#1f2937] hover:text-[#e6edf3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]">
            <ChevronRight size={15} className={sidebarCollapsed ? "" : "rotate-180"} />
          </button>
        </div>
      </aside>

      <main style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties} className="min-h-screen min-w-0 pl-0 transition-[padding] duration-200 lg:pl-[var(--sidebar-width)]">
        {(aiSidebarOpen || pathname === "/ai-talk") && <>
          {pathname !== "/ai-talk" && <button aria-label="Close AI Talk" onClick={toggleAiSidebar} className="fixed inset-0 z-30 bg-black/40" />}
          <aside style={{ width: pathname === "/ai-talk" ? "100vw" : aiChatWidth, maxWidth: "100vw" }} className={`fixed z-50 flex h-[100dvh] max-w-full flex-col bg-[#0d1117] ${pathname === "/ai-talk" ? "inset-0" : "inset-y-0 right-0 border-l border-[#30363d] shadow-2xl"}`}>
            {pathname !== "/ai-talk" && <div role="separator" aria-orientation="vertical" aria-label="Resize AI chat" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); resizeAiChat(event); }} onPointerMove={resizeAiChat} className="absolute left-[-4px] top-0 z-50 hidden h-full w-2 cursor-col-resize touch-none bg-transparent hover:bg-[#8957e5]/50 sm:block" />}

            <header className="shrink-0 border-b border-[#30363d] bg-[#0d1117]">
              <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#8957e5]/40 bg-[#8957e5]/10 text-[#d2a8ff] shadow-[0_0_24px_rgba(137,87,229,.12)]"><Sparkles size={19}/></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold tracking-tight text-[#f0f6fc]">AI Talk</h2>
                        <span className="rounded-full border border-[#238636]/30 bg-[#238636]/10 px-2 py-0.5 text-[10px] font-medium text-[#3fb950]">Repository-aware</span>
                      </div>
                      <p className="mt-0.5 text-xs text-[#8b949e]">Explore issues, pull requests, workflows and next steps</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={startNewAiChat} disabled={!aiChatMessages.length || aiChatSending || aiChatHistoryLoading} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#30363d] px-2.5 text-xs font-medium text-[#c9d1d9] transition hover:border-[#8957e5]/60 hover:bg-[#8957e5]/10 hover:text-[#e6d5ff] disabled:cursor-not-allowed disabled:opacity-40 sm:px-3"><Plus size={14}/> <span className="hidden sm:inline">New chat</span></button>
                    <button type="button" onClick={() => pathname === "/ai-talk" ? router.push("/dashboard") : toggleAiSidebar()} aria-label={pathname === "/ai-talk" ? "Back to dashboard" : "Close AI Talk"} title={pathname === "/ai-talk" ? "Back to dashboard" : "Close AI Talk"} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#30363d] px-2.5 text-xs font-medium text-[#c9d1d9] transition hover:bg-[#21262d] sm:px-3 sm:text-sm">{pathname === "/ai-talk" ? <><ArrowLeft size={15}/><span className="hidden sm:inline">Back to dashboard</span></> : <X size={16}/>}</button>
                  </div>
                </div>

                <div className="mx-auto mt-4 grid w-full grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[.12em] text-[#8b949e]">Conversation context</label>
                    <div className="relative">
                      <button type="button" aria-haspopup="listbox" aria-expanded={aiRepoPickerOpen} onClick={() => { setAiRepoPickerOpen((open) => !open); setAiRepoSearch(""); }} disabled={!aiChatRepositories.length || aiChatSending} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#30363d] bg-[#161b22] px-3.5 text-left text-sm text-[#e6edf3] shadow-sm transition hover:border-[#8957e5]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8957e5] disabled:cursor-not-allowed disabled:opacity-50">
                        <span className="flex min-w-0 items-center gap-2.5"><Github size={16} className="shrink-0 text-[#8b949e]"/><span className="truncate">{selectedAiRepository?.fullName || "No personal repositories found"}</span></span>
                        <ChevronRight size={16} className={`shrink-0 text-[#8b949e] transition-transform ${aiRepoPickerOpen ? "rotate-90" : ""}`}/>
                      </button>
                      {aiRepoPickerOpen && <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22] shadow-2xl">
                        <div className="border-b border-[#30363d] p-2.5">
                          <div className="flex items-center gap-2 rounded-lg border border-[#30363d] bg-[#0d1117] px-3"><Search size={14} className="shrink-0 text-[#8b949e]"/><input autoFocus value={aiRepoSearch} onChange={(event) => setAiRepoSearch(event.target.value)} placeholder="Search your repositories…" className="h-9 min-w-0 flex-1 bg-transparent text-sm text-[#e6edf3] outline-none placeholder:text-[#6e7681]"/></div>
                          <p className="mt-2 px-1 text-[11px] text-[#8b949e]">{matchingAiRepositories.length} of {aiChatRepositories.length} personal repositories</p>
                        </div>
                        <div role="listbox" aria-label="Your GitHub repositories" className="max-h-64 overflow-y-auto p-1.5">
                          {matchingAiRepositories.length ? matchingAiRepositories.map((repository) => <button key={repository.id} type="button" role="option" aria-selected={selectedAiRepository?.id === repository.id} onClick={() => { setAiChatRepositoryId(repository.id); setAiChatMessages([]); setAiChatError(""); setAiRepoPickerOpen(false); setAiRepoSearch(""); }} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${selectedAiRepository?.id === repository.id ? "bg-[#8957e5]/15 text-[#e6d5ff]" : "text-[#c9d1d9] hover:bg-[#21262d]"}`}>
                            <span className="min-w-0"><span className="block truncate">{repository.name}</span><span className="mt-0.5 block truncate text-[11px] text-[#8b949e]">{repository.fullName}</span></span>
                            {selectedAiRepository?.id === repository.id && <Check size={15} className="shrink-0 text-[#d2a8ff]"/>}
                          </button>) : <p className="px-3 py-6 text-center text-xs text-[#8b949e]">No matching repositories. Try another search.</p>}
                        </div>
                      </div>}
                    </div>
                    <p className="mt-1.5 text-[10px] text-[#6e7681]">Answers are grounded in the selected repository&apos;s GitHub metadata and README.</p>
                  </div>
                  {selectedAiRepository && <div className="hidden items-center gap-2 pb-1 text-[11px] text-[#8b949e] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#3fb950]"/>{selectedAiRepository.language || "GitHub repository"}<span className="text-[#484f58]">·</span>{selectedAiRepository.defaultBranch}</div>}
                </div>
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-7">
                {aiChatHistoryLoading ? <div className="my-auto flex items-center justify-center gap-2 py-20 text-sm text-[#8b949e]" role="status"><LoaderCircle size={16} className="animate-spin text-[#d2a8ff]"/> Loading your saved conversation…</div> : !aiChatRepositories.length ? <div className="my-auto rounded-2xl border border-dashed border-[#30363d] bg-[#161b22]/60 p-6 text-center">
                  <Github size={24} className="mx-auto text-[#8b949e]"/>
                  <h3 className="mt-3 text-sm font-semibold text-[#f0f6fc]">No repositories available</h3>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#8b949e]">Sync GitHub or check your repository access. AI Talk can answer questions after at least one repository is loaded.</p>
                  <button type="button" onClick={() => void importRepositories()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-[#30363d] px-3 text-xs font-medium text-[#c9d1d9] transition hover:border-[#8957e5]/60 hover:bg-[#8957e5]/10"><RefreshCw size={13}/> Sync repositories</button>
                </div> : aiChatMessages.length === 0 ? <section className="my-auto w-full py-4">
                  <div className="mx-auto max-w-3xl text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#8957e5]/40 bg-[#8957e5]/10 text-[#d2a8ff] shadow-[0_0_45px_rgba(137,87,229,.13)]"><Bot size={27}/></span>
                    <p className="mt-5 text-[11px] font-semibold uppercase tracking-[.18em] text-[#b794f6]">Your repository copilot</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-[#f0f6fc] sm:text-3xl">What are we working on today?</h3>
                    <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#8b949e]">Ask RepoPilot to explore the project, investigate delivery risks, understand recent activity, or plan your next engineering task.</p>
                    {selectedAiRepository && <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-xs text-[#c9d1d9]"><Github size={13} className="shrink-0 text-[#8b949e]"/><span className="truncate">{selectedAiRepository.fullName}</span></div>}
                  </div>
                  <div className="mx-auto mt-7 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
                    {[
                      { title: "Understand this project", description: "Purpose, structure and technology", prompt: "Give me a clear overview of this repository, its purpose, main technologies, and current state.", icon: BookOpen },
                      { title: "Find what needs attention", description: "Issues, blockers and delivery risks", prompt: "Review the available repository data and identify what needs attention first. Explain the evidence.", icon: ShieldAlert },
                      { title: "Investigate workflow failures", description: "Recent GitHub Actions runs", prompt: "Explain the recent workflow failures in this repository and recommend how to investigate and fix them.", icon: GitBranch },
                      { title: "Plan my next steps", description: "A practical engineering action plan", prompt: "Based on the available repository activity, what should I work on next? Give me a prioritized action plan.", icon: ListTodo },
                    ].map(({ title, description, prompt, icon: Icon }) => <button key={title} type="button" disabled={!selectedAiRepository || aiChatSending} onClick={() => void sendAiChatMessage(prompt)} className="group flex min-h-[104px] items-start gap-3 rounded-2xl border border-[#30363d] bg-[#161b22]/85 p-4 text-left transition duration-150 hover:-translate-y-0.5 hover:border-[#8957e5]/65 hover:bg-[#211638]/65 hover:shadow-[0_10px_30px_rgba(0,0,0,.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8957e5] disabled:cursor-not-allowed disabled:opacity-50">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#8957e5]/30 bg-[#8957e5]/10 text-[#d2a8ff] transition group-hover:bg-[#8957e5]/20"><Icon size={17}/></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#e6edf3]">{title}</span><span className="mt-1 block text-xs leading-5 text-[#8b949e]">{description}</span></span>
                      <ChevronRight size={15} className="mt-1 shrink-0 text-[#6e7681] transition group-hover:translate-x-0.5 group-hover:text-[#d2a8ff]"/>
                    </button>)}
                  </div>
                  <p className="mt-5 text-center text-[10px] text-[#6e7681]">Choose a prompt to start instantly, or write your own question below.</p>
                </section> : <section aria-label="AI conversation" className="w-full space-y-5 pb-3">
                  <div className="flex justify-center"><span className="rounded-full border border-[#30363d] bg-[#161b22] px-3 py-1 text-[10px] text-[#8b949e]">Conversation · {selectedAiRepository?.name || "Repository"}</span></div>
                  {aiChatMessages.map((message, index) => message.role === "user" ? <div key={index} className="flex justify-end">
                    <div className="max-w-[92%] sm:max-w-[82%]">
                      <p className="mb-1.5 pr-1 text-right text-[10px] font-medium uppercase tracking-[.12em] text-[#8b949e]">You</p>
                      <div className="rounded-2xl rounded-br-md border border-[#315783]/70 bg-[#1f3a5f] px-4 py-3 text-sm leading-6 text-[#f0f6fc] shadow-sm"><p className="whitespace-pre-wrap break-words">{message.content}</p></div>
                    </div>
                  </div> : <div key={index} className="flex items-start gap-3">
                    <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#8957e5]/35 bg-[#8957e5]/10 text-[#d2a8ff]"><Bot size={16}/></span>
                    <div className="min-w-0 max-w-[94%] flex-1 sm:max-w-[88%]">
                      <div className="mb-1.5 flex items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#b794f6]">RepoPilot AI</p><span className="text-[10px] text-[#6e7681]">Repository assistant</span><button type="button" onClick={() => void copyAiChatMessage(message.content, index)} className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] text-[#8b949e] transition hover:bg-[#21262d] hover:text-[#e6edf3]" aria-label="Copy AI answer">{copiedChatIndex === index ? <Check size={12}/> : <Copy size={12}/>}<span>{copiedChatIndex === index ? "Copied" : "Copy"}</span></button></div>
                      <div className="rounded-2xl rounded-tl-md border border-[#30363d] bg-[#161b22] px-4 py-3 shadow-sm"><MarkdownContent content={message.content}/></div>
                    </div>
                  </div>)}
                  {aiChatSending && <div className="flex items-start gap-3" role="status" aria-live="polite">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#8957e5]/35 bg-[#8957e5]/10 text-[#d2a8ff]"><Bot size={16}/></span>
                    <div className="rounded-2xl rounded-tl-md border border-[#30363d] bg-[#161b22] px-4 py-3"><div className="flex items-center gap-2 text-xs text-[#c9d1d9]"><LoaderCircle size={13} className="animate-spin text-[#d2a8ff]"/> RepoPilot is reviewing the repository…</div><div className="mt-2 flex gap-1"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8957e5]"/><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8957e5] [animation-delay:160ms]"/><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8957e5] [animation-delay:320ms]"/></div></div>
                  </div>}
                  {aiChatError && <div role="alert" className="ml-11 flex flex-col gap-2 rounded-xl border border-[#da3633]/40 bg-[#da3633]/10 p-3 text-xs text-[#ff7b72] sm:flex-row sm:items-center sm:justify-between"><span>{aiChatError}</span><button type="button" onClick={() => void sendAiChatMessage()} disabled={!aiChatInput.trim() || aiChatSending} className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-[#da3633]/50 px-2.5 font-medium transition hover:bg-[#da3633]/10 disabled:opacity-40 sm:self-auto"><RefreshCw size={12}/> Retry</button></div>}
                </section>}
                <div ref={aiChatEndRef} />
              </div>
            </main>

            <footer className="shrink-0 border-t border-[#30363d] bg-[#0d1117]/95 p-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur sm:p-4">
              <form onSubmit={(event) => { event.preventDefault(); void sendAiChatMessage(); }} className="mx-auto w-full max-w-5xl">
                <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-2 shadow-[0_-10px_35px_rgba(0,0,0,.12)] transition focus-within:border-[#8957e5]/75 focus-within:shadow-[0_0_0_3px_rgba(137,87,229,.10)]">
                  <textarea ref={aiChatComposerRef} value={aiChatInput} onChange={(event) => { setAiChatInput(event.target.value); if (aiChatError) setAiChatError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendAiChatMessage(); } }} placeholder={selectedAiRepository ? `Ask anything about ${selectedAiRepository.name}…` : "Choose a repository to start asking questions…"} rows={2} disabled={!aiChatRepositories.length || aiChatSending || aiChatHistoryLoading} className="max-h-36 min-h-[54px] w-full resize-y bg-transparent px-3 py-2 text-sm leading-6 text-[#e6edf3] outline-none placeholder:text-[#6e7681] disabled:opacity-50"/>
                  <div className="flex items-center justify-between gap-2 border-t border-[#30363d]/70 px-1 pt-2">
                    <div className="flex min-w-0 items-center gap-3 text-[10px] text-[#6e7681]"><span className="hidden items-center gap-1 sm:inline-flex"><kbd className="rounded border border-[#30363d] bg-[#0d1117] px-1.5 py-0.5 font-sans">Enter</kbd> to send</span><span className="hidden sm:inline">·</span><span><kbd className="rounded border border-[#30363d] bg-[#0d1117] px-1.5 py-0.5 font-sans">Shift + Enter</kbd> for new line</span><span className={`hidden tabular-nums sm:inline `}>{aiChatInput.length.toLocaleString()} characters</span></div>
                    <button type="submit" disabled={!aiChatInput.trim() || !aiChatRepositories.length || aiChatSending || aiChatHistoryLoading} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-[#8957e5] px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#a371f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a1ff] disabled:cursor-not-allowed disabled:opacity-40"><Send size={14}/><span>Send</span></button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[#6e7681]"><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#3fb950]"/> AI answers use GitHub metadata, recent activity and README.</span><span>Verify important recommendations before acting.</span></div>
              </form>
            </footer>
          </aside>
        </>}
        {activePanel && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="panel-title" className="w-full max-w-lg rounded-xl border border-[#30363d] bg-[#0d1117] p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-[#8b949e]">REPOPILOT WORKSPACE</p><h2 id="panel-title" className="mt-2 text-xl font-semibold">{activePanel === "help" ? "How to use RepoPilot" : activePanel === "notifications" ? "Notifications" : activePanel === "activity" ? "Activity history" : "Settings"}</h2></div><button onClick={() => setActivePanel(null)} aria-label="Close dialog" className="rounded-md p-1.5 text-[#8b949e] hover:bg-[#21262d]"><X size={17} /></button></div>
          {activePanel === "help" ? <div className="mt-5 space-y-3 text-sm leading-6 text-[#c9d1d9]"><p><strong>Import repositories:</strong> sign in with GitHub; your repositories load automatically.</p><p><strong>Search and filter:</strong> search by repository name, description, language, branch, or topic.</p><p><strong>Track progress:</strong> change a repository status. It is saved to your GitHub account workspace.</p><p><strong>AI summaries:</strong> use the AI summary action on a repository to request an Ollama Cloud analysis. It uses repository metadata, issues, pull requests, and recent workflow runs—not source code.</p></div> : activePanel === "notifications" ? <div className="mt-5"><p className="text-sm text-[#8b949e]">{attentionCount ? `${attentionCount} project(s) marked for attention.` : "You have no projects marked as needing attention."}</p><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{repositories.filter((repo) => repo.status === "Needs attention").map((repo) => <a key={repo.id} href={repo.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-md border border-[#30363d] p-3 text-sm hover:bg-[#161b22]">{repo.name}<ExternalLink size={14} /></a>)}</div><button onClick={() => { setActivePanel(null); navigateTo("Priorities"); }} className="mt-4 rounded-md bg-[#238636] px-3 py-2 text-sm font-medium text-white hover:bg-[#2ea043]">View priorities</button></div> : activePanel === "activity" ? <div className="mt-5">{activity.length ? <ol className="max-h-80 space-y-3 overflow-y-auto">{activity.map((item) => <li key={item.id} className="border-l border-[#30363d] pl-3"><p className="text-sm">{item.message}</p><p className="mt-1 text-xs text-[#8b949e]">{item.time}</p></li>)}</ol> : <p className="rounded-md border border-dashed border-[#30363d] p-5 text-sm text-[#8b949e]">No saved status changes for this account yet.</p>}</div> : <div className="mt-5 space-y-4"><div className="rounded-md border border-[#30363d] p-3"><p className="text-sm font-medium">Connected GitHub account</p><p className="mt-1 text-xs text-[#8b949e]">{githubUser ? `Signed in as @${githubUser.login}. Repositories load automatically from this account.` : "Not connected. Sign in with GitHub to load your repositories automatically."}</p></div><div className="rounded-md border border-[#30363d] p-3"><p className="text-sm font-medium">Reset saved statuses</p><p className="mt-1 text-xs text-[#8b949e]">Remove saved status preferences for @{username}.</p><button onClick={() => { try { localStorage.removeItem(`repopilot-statuses:${username.toLowerCase()}`); } catch {} setRepositories((items) => items.map((repo) => ({ ...repo, status: repo.archived ? "On hold" : "Not assessed" }))); setActivity((items) => [{ id: `reset-${Date.now()}`, message: `Reset saved statuses for @${username}`, time: new Date().toLocaleString() }, ...items].slice(0, 50)); setActivePanel(null); }} className="mt-3 rounded-md border border-[#da3633]/60 px-3 py-1.5 text-xs text-[#ff7b72] hover:bg-[#da3633]/10">Reset statuses</button></div></div>}
          <div className="mt-6 flex justify-end border-t border-[#30363d] pt-4"><button onClick={() => setActivePanel(null)} className="rounded-md border border-[#30363d] px-3 py-1.5 text-sm hover:bg-[#21262d]">Close</button></div></section></div>}

        <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 border-b border-[#30363d] pb-5 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-3"><button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation menu" aria-controls="workspace-sidebar" aria-expanded={mobileMenuOpen} className="mt-0 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#30363d] bg-[#161b22] text-[#c9d1d9] transition hover:border-[#58a6ff] hover:bg-[#21262d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] lg:hidden"><Menu size={19}/></button><div className="min-w-0"><h1 className="mt-0 text-2xl font-semibold tracking-tight sm:text-[28px]">{activeNav === "Dashboard" ? "Dashboard" : activeNav === "Repositories" ? "Your repositories" : activeNav}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b949e]">{activeNav === "Overview" ? "Review your repositories, assess project health, and decide what to work on next." : activeNav === "Repositories" ? "Browse, search, categorize, and update your GitHub repositories." : activeNav === "Work board" ? "Track projects currently in progress." : activeNav === "Priorities" ? "Focus on repositories that need attention first." : activeNav === "Activity history" ? "Review your recent workspace changes." : "Manage your GitHub account and workspace preferences."}</p></div></div>
            
          </div>

          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-[#da3633]/50 bg-[#da3633]/10 p-3 text-sm text-[#ff7b72]"><AlertCircle size={17} className="mt-0.5 shrink-0" /><div className="flex-1">{error}</div><button onClick={() => void importRepositories()} className="font-medium underline underline-offset-4">Retry</button></div>}

          {isOverviewPage && <section aria-label="Repository status filters" className="mt-5 flex flex-wrap items-center gap-1.5 rounded-md border border-[#30363d] bg-[#0d1117] p-2">
            {([
              { label: "Repositories", value: repositories.length, icon: FolderGit2, filter: "All projects", textClass: "text-[#79c0ff]", activeClass: "border-[#1f6feb]/65 bg-[#1f3a5f]/45 text-[#79c0ff]" },
              { label: "Not assessed", value: statusCounts["Not assessed"], icon: CircleDot, filter: "Not assessed", textClass: "text-[#aab2bd]", activeClass: "border-[#6e7681]/65 bg-[#6e7681]/15 text-[#aab2bd]" },
              { label: "Needs review", value: statusCounts["Needs review"], icon: BookOpen, filter: "Needs review", textClass: "text-[#d2a8ff]", activeClass: "border-[#8957e5]/65 bg-[#2b1f45]/60 text-[#d2a8ff]" },
              { label: "In progress", value: inProgressCount, icon: GitBranch, filter: "In progress", textClass: "text-[#79c0ff]", activeClass: "border-[#1f6feb]/65 bg-[#1f3a5f]/50 text-[#79c0ff]" },
              { label: "Needs attention", value: attentionCount, icon: ShieldAlert, filter: "Needs attention", textClass: "text-[#ff7b72]", activeClass: "border-[#da3633]/65 bg-[#3b171b]/65 text-[#ff7b72]" },
              { label: "Completed", value: completedCount, icon: Check, filter: "Completed", textClass: "text-[#3fb950]", activeClass: "border-[#238636]/65 bg-[#12351f]/65 text-[#3fb950]" },
              { label: "On hold", value: statusCounts["On hold"], icon: Clock3, filter: "On hold", textClass: "text-[#e3b341]", activeClass: "border-[#9e6a03]/65 bg-[#3d2e12]/55 text-[#e3b341]" },
            ] as const).map((item) => {
              const selected = filter === item.filter;
              return <button key={item.label} type="button" aria-pressed={selected} onClick={() => { setFilter(selected && item.filter !== "All projects" ? "All projects" : item.filter); setQuery(""); }} className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] sm:px-3 sm:text-sm ${selected ? item.activeClass : `border-transparent ${item.textClass} hover:border-[#30363d] hover:bg-[#161b22]`}`}>
                <item.icon size={15} className="shrink-0"/>
                <span className="whitespace-nowrap">{item.label}</span>
                <span className="font-semibold tabular-nums">{item.value}</span>
              </button>;
            })}
            <span className="ml-auto hidden px-2 text-xs text-[#8b949e] lg:inline">{lastSynced ? `Last synced at ${lastSynced}` : "Waiting for import"}</span>
          </section>}

          {isRepositoryPage && <section id="repositories" className="mt-7 scroll-mt-24">
            <div className="flex flex-col justify-between gap-3 border-b border-[#30363d] pb-4 sm:flex-row sm:items-center">
              <div><h2 className="text-lg font-semibold">Repositories <span className="ml-1 rounded-full bg-[#21262d] px-2 py-0.5 text-sm font-normal text-[#8b949e]">{filteredRepositories.length}</span></h2><p className="mt-1 text-xs text-[#8b949e]">{githubUser ? "Authorized repositories for " : "Public repositories from "}<a className="text-[#58a6ff] hover:underline" href={`https://github.com/${username}?tab=repositories`} target="_blank" rel="noreferrer">@{username}</a>{lastSynced ? ` · synced ${lastSynced}` : ""}</p></div>
            </div>
            <section aria-label="Project organization" className="mt-4 overflow-hidden rounded-xl border border-[#30363d] bg-[#0d1117]">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#e6edf3]">Project organization</p>
                  <p className="mt-1 text-xs leading-5 text-[#8b949e]">Choose how your repository list is organized.</p>
                </div>
                <div role="group" aria-label="Repository organization mode" className="grid w-full grid-cols-2 gap-1 rounded-lg border border-[#30363d] bg-[#010409] p-1 sm:w-auto sm:min-w-[260px]">
                  <button type="button" aria-pressed={organizationMode === "manual"} onClick={() => setOrganizationMode("manual")} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] ${organizationMode === "manual" ? "bg-[#30363d] text-white shadow-sm" : "text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]"}`}>
                    <ListTodo size={15} /> Manual
                  </button>
                  <button type="button" aria-pressed={organizationMode === "ai"} onClick={() => { if (aiOrganization) setOrganizationMode("ai"); else void organizeAllRepositories(); }} disabled={organizing || repositories.length === 0} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a1ff] disabled:cursor-not-allowed disabled:opacity-50 ${organizationMode === "ai" ? "bg-[#39245d] text-[#e6d5ff] shadow-sm" : "text-[#8b949e] hover:bg-[#211638] hover:text-[#d2a8ff]"}`}>
                    {organizing ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
                    {organizing ? "Organizing…" : "AI organized"}
                  </button>
                </div>
              </div>
              <div className="border-t border-[#30363d] px-4 py-3 sm:px-5">
                {organizationMode === "manual" ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2.5"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#1f6feb]/15 text-[#79c0ff]"><ListTodo size={15}/></span><div><p className="text-xs font-medium text-[#c9d1d9]">Manual organization is active</p><p className="mt-1 text-xs leading-5 text-[#8b949e]">You control each project status using the status selector on its repository card. Your choices are saved to your GitHub account workspace.</p></div></div>
                  {aiOrganization && <button type="button" onClick={() => setOrganizationMode("ai")} className="shrink-0 self-start rounded-md border border-[#8957e5]/40 px-3 py-2 text-xs font-medium text-[#d2a8ff] transition hover:bg-[#8957e5]/10 sm:self-center">View AI suggestions</button>}
                </div> : <div className="flex flex-col gap-3">
                  {aiOrganization ? <>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-2.5"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#8957e5]/20 text-[#d2a8ff]"><Sparkles size={15}/></span><div className="min-w-0"><p className="text-xs font-medium text-[#e6d5ff]">AI recommendations are active</p><p className="mt-1 text-xs leading-5 text-[#8b949e]">Sorted by priority · {aiOrganization.model} · Generated {relativeDate(aiOrganization.generatedAt)}</p></div></div>
                      <button type="button" onClick={() => void organizeAllRepositories()} disabled={organizing || repositories.length === 0} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-[#8957e5]/60 bg-[#8957e5]/10 px-3 text-xs font-medium text-[#d2a8ff] transition hover:bg-[#8957e5]/20 disabled:cursor-wait disabled:opacity-50">{organizing ? <LoaderCircle size={14} className="animate-spin"/> : <RefreshCw size={14}/>} {organizing ? "Refreshing recommendations…" : "Regenerate AI suggestions"}</button>
                    </div>
                    <div className="flex flex-col gap-2 rounded-lg border border-[#238636]/30 bg-[#0d1b12] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-[#a8c7ad]">AI suggestions never change your manual statuses unless you apply them.</p>
                      <button type="button" onClick={applyAllAiSuggestions} disabled={!aiOrganization.projects.length} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-[#238636]/50 bg-[#238636]/10 px-3 text-xs font-medium text-[#3fb950] transition hover:bg-[#238636]/20 disabled:cursor-not-allowed disabled:opacity-40"><Check size={14}/> Apply all suggestions</button>
                    </div>
                  </> : <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-medium text-[#c9d1d9]">AI organization is not generated yet</p><p className="mt-1 text-xs text-[#8b949e]">Generate recommendations from your repository activity and workflow data.</p></div><button type="button" onClick={() => void organizeAllRepositories()} disabled={organizing || repositories.length === 0} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[#8957e5]/60 bg-[#8957e5]/10 px-3 text-xs font-medium text-[#d2a8ff] hover:bg-[#8957e5]/20 disabled:opacity-50">{organizing ? <LoaderCircle size={14} className="animate-spin"/> : <Sparkles size={14}/>} {organizing ? "Organizing…" : "Generate AI suggestions"}</button></div>}
                </div>}
                {organizationError && <p role="alert" className="mt-3 text-sm text-[#ff7b72]">{organizationError}</p>}
              </div>
            </section>
            <div className="mt-3">
              <label className="flex min-h-10 w-full items-center gap-2 rounded-md border border-[#30363d] bg-[#010409] px-3 focus-within:border-[#2f81f7]"><Search size={16} className="shrink-0 text-[#8b949e]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a repository…" className="w-full bg-transparent text-sm outline-none placeholder:text-[#6e7681]" aria-label="Search repositories" />{query && <button onClick={() => setQuery("")} aria-label="Clear search" className="text-[#8b949e] hover:text-[#e6edf3]"><X size={14} /></button>}</label>
            </div>

            {loading && repositories.length === 0 ? <div className="mt-4 flex items-center justify-center gap-3 rounded-md border border-[#30363d] px-6 py-16 text-sm text-[#8b949e]"><LoaderCircle className="animate-spin" size={18} />Loading your authorized GitHub repositories…</div> : filteredRepositories.length > 0 ? (
              <div className="mt-4 overflow-visible rounded-md border border-[#30363d]">
                {filteredRepositories.map((repository) => <article key={repository.id} className="border-b border-[#30363d] bg-[#0d1117] px-4 py-4 last:border-b-0 hover:bg-[#161b22]/70 sm:px-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#30363d] bg-[#161b22] text-[#8b949e]"><FolderGit2 size={18} /></div>
                      <div className="w-full min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><a href={repository.url} target="_blank" rel="noreferrer" className="break-all text-base font-semibold text-[#58a6ff] hover:underline">{repository.name}</a>{repository.archived && <span className="rounded-full border border-[#6e7681]/60 px-2 py-0.5 text-xs text-[#8b949e]">Archived</span>}{repository.private && <span className="rounded-full border border-[#d29922]/60 px-2 py-0.5 text-xs text-[#e3b341]">Private</span>}{organizationMode === "ai" && aiOrganization ? (() => { const suggestion = aiOrganization.projects.find((item) => item.id === repository.id); return suggestion ? <><StatusPill status={suggestion.status} /><span title={suggestion.reason} className="rounded-full border border-[#8957e5]/50 bg-[#8957e5]/10 px-2 py-0.5 text-xs text-[#d2a8ff]">AI priority {suggestion.priority}</span></> : <StatusPill status={repository.status}/>; })() : <StatusPill status={repository.status}/>}</div>
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
                    <div className="flex w-full flex-wrap items-center gap-2 border-t border-[#30363d] pt-3 sm:justify-end">
                      <button type="button" title="Generate an AI summary for this repository" aria-busy={summarizingId === repository.id} onClick={() => void summarizeRepository(repository)} disabled={summarizingId !== null} className="group inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#8957e5]/50 bg-[#8957e5]/10 px-3 text-xs font-medium text-[#d2a8ff] shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-[#a371f7] hover:bg-[#8957e5]/20 hover:shadow-[0_4px_16px_rgba(137,87,229,.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a1ff] active:translate-y-0 active:scale-[.97] disabled:cursor-wait disabled:opacity-50">{summarizingId === repository.id ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} className="transition-transform group-hover:rotate-12" />}{summarizingId === repository.id ? "Generating…" : "AI summary"}</button>
                      <button type="button" title="Check repository activity and project health signals" aria-busy={assessingId === repository.id} onClick={() => void assessRepository(repository)} disabled={assessingId !== null} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#30363d] bg-[#161b22] px-3 text-xs font-medium text-[#c9d1d9] shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-[#8b949e] hover:bg-[#21262d] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] active:translate-y-0 active:scale-[.97] disabled:cursor-wait disabled:opacity-50">{assessingId === repository.id ? <LoaderCircle size={13} className="animate-spin" /> : <ShieldAlert size={13} />}{assessingId === repository.id ? "Assessing…" : "Assess"}</button>
                      {organizationMode === "manual" ? <>
                        <StatusSelector status={repository.status} repositoryName={repository.fullName} onChange={(status) => updateStatus(repository.id, status)} />
                      </> : (() => { const suggestion = aiOrganization?.projects.find((item) => item.id === repository.id); return suggestion ? <button type="button" onClick={() => updateStatus(repository.id, suggestion.status)} title={`Apply AI suggestion: ${suggestion.status}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#238636]/50 bg-[#238636]/10 px-3 text-xs font-medium text-[#3fb950] transition hover:bg-[#238636]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3fb950]"><Check size={13}/> Apply suggestion</button> : <span className="text-xs text-[#8b949e]">No AI suggestion</span>; })()}
                      <a href={repository.url} target="_blank" rel="noreferrer" aria-label={`Open ${repository.name} on GitHub`} title="Open repository on GitHub" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[#8b949e] transition-all hover:-translate-y-0.5 hover:border-[#30363d] hover:bg-[#21262d] hover:text-[#e6edf3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] active:scale-[.95]"><ExternalLink size={15} /></a>
                    </div>
                    {aiSummaries[repository.id] && <div className="mt-4 w-full rounded-lg border border-[#8957e5]/40 bg-[#161326] p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#d2a8ff]"><Sparkles size={13} /> Ollama Cloud analysis</p><span className="text-xs text-[#8b949e]">{aiSummaries[repository.id].model}</span></div>{aiSummaries[repository.id].error ? <p className="mt-2 text-sm text-[#ff7b72]">{aiSummaries[repository.id].error}</p> : <><div className="mt-2"><MarkdownContent content={aiSummaries[repository.id].summary} /></div><p className="mt-3 text-xs text-[#8b949e]">Generated {relativeDate(aiSummaries[repository.id].generatedAt)} · Based on GitHub metadata, open issues, pull requests and recent workflow runs. No source files were analyzed.</p></>}</div>}{assessments[repository.id] && <div className="mt-3 w-full rounded-lg border border-[#30363d] bg-[#010409] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-[#c9d1d9]">Evidence-based assessment · {assessments[repository.id].confidence} confidence</p><p className="text-xs text-[#8b949e]">Checked {relativeDate(assessments[repository.id].assessedAt)}</p></div>{assessments[repository.id].error ? <p className="mt-2 text-sm text-[#ff7b72]">{assessments[repository.id].error}</p> : <><p className="mt-2 text-sm">Suggested status: <span className="font-semibold">{assessments[repository.id].status}</span></p>{assessments[repository.id].evidence.length > 0 ? <ul className="mt-2 space-y-1.5">{assessments[repository.id].evidence.map((item, index) => <li key={index} className="text-xs leading-5 text-[#8b949e]">• {item.url ? <a className="text-[#58a6ff] hover:underline" href={item.url} target="_blank" rel="noreferrer">{item.detail}</a> : item.detail}</li>)}</ul> : <p className="mt-2 text-xs text-[#8b949e]">No evidence was returned. Keep this repository unassessed.</p>}<div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={assessments[repository.id].status === "Not assessed"} onClick={() => applyAssessment(repository, assessments[repository.id])} className="rounded-md bg-[#238636] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-50">Apply suggestion</button><span className="text-xs text-[#8b949e]">Suggestions never change your status until applied.</span></div></>}</div>}
                  </div>
                </article>)}
              </div>
            ) : <div className="mt-4 rounded-md border border-dashed border-[#30363d] px-6 py-14 text-center"><Search size={23} className="mx-auto text-[#6e7681]" /><h3 className="mt-3 font-semibold">{repositories.length ? "No matching repositories" : "No repositories imported yet"}</h3><p className="mt-1 text-sm text-[#8b949e]">{repositories.length ? "Try another search term or clear the status filter." : githubUser ? "No repositories were returned for this GitHub account." : "Sign in with GitHub above. RepoPilot will automatically load the repositories your account can access."}</p>{repositories.length > 0 && <button onClick={() => { setQuery(""); setFilter("All projects"); }} className="mt-4 rounded-md border border-[#30363d] px-3 py-1.5 text-sm hover:bg-[#21262d]">Clear filters</button>}</div>}
          </section>}

          {isActivityPage && <section className="mt-7 rounded-lg border border-[#30363d] bg-[#0d1117] p-5">
            <h1 className="text-2xl font-semibold">Activity history</h1><p className="mt-2 text-sm text-[#8b949e]">Saved account-wide across sign-ins and devices.</p>
            {activity.length ? <ol className="mt-6 space-y-4">{activity.map((item) => <li key={item.id} className="border-l-2 border-[#30363d] pl-4"><p className="text-sm">{item.message}</p><p className="mt-1 text-xs text-[#8b949e]">{item.time}</p></li>)}</ol> : <p className="mt-6 rounded-md border border-dashed border-[#30363d] p-6 text-sm text-[#8b949e]">No saved activity has been recorded for this account yet.</p>}
          </section>}

          {isSettingsPage && <section className="mt-7 space-y-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1f6feb]/15 text-[#79c0ff]"><Github size={20}/></div>
                  <div className="min-w-0 flex-1"><h2 className="font-semibold text-[#f0f6fc]">GitHub connection</h2><p className="mt-1 text-sm text-[#8b949e]">Your repositories are read from your connected GitHub account.</p><p className="mt-3 text-sm text-[#c9d1d9]">{githubUser ? <><span className="text-[#3fb950]">●</span> Connected as <strong>@{githubUser.login}</strong></> : "Not connected"}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {githubUser ? <>
                        <button type="button" onClick={() => void importRepositories()} disabled={loading || signingOut} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#1f6feb]/60 bg-[#1f6feb]/10 px-3 py-2 text-sm font-medium text-[#79c0ff] transition hover:bg-[#1f6feb]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] disabled:cursor-wait disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/>{loading ? "Syncing GitHub…" : "Sync GitHub"}</button>
                        <a href={"https://github.com/" + githubUser.login} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#30363d] px-3 py-2 text-sm text-[#c9d1d9] transition hover:border-[#58a6ff] hover:bg-[#161b22]">Open GitHub profile <ExternalLink size={13}/></a>
                        <button type="button" onClick={() => void handleSignOut()} disabled={signingOut || loading} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#da3633]/60 px-3 py-2 text-sm font-medium text-[#ff7b72] transition hover:bg-[#da3633]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7b72] disabled:cursor-wait disabled:opacity-50"><LogOut size={14}/>{signingOut ? "Signing out…" : "Sign out"}</button>
                      </> : <a href="/api/auth/github" className="inline-flex items-center gap-2 rounded-md border border-[#30363d] px-3 py-2 text-sm hover:border-[#58a6ff] hover:bg-[#161b22]">Connect GitHub <ExternalLink size={13}/></a>}
                    </div></div>
                </div>
              </div>
              <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-5">
                <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-[#f0f6fc]">AI usage</h2><p className="mt-1 text-sm text-[#8b949e]">Successful AI requests saved to your GitHub account workspace.</p></div><span className="rounded-lg bg-[#8957e5]/15 p-2 text-[#d2a8ff]"><Sparkles size={18}/></span></div>
                <div className="mt-5 flex items-end gap-2"><span className="text-4xl font-semibold tracking-tight tabular-nums text-[#f0f6fc]">{aiUsage.total.toLocaleString()}</span><span className="pb-1 text-sm text-[#8b949e]">total requests</span></div>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-[#161b22] p-3"><p className="text-xl font-semibold tabular-nums text-[#d2a8ff]">{aiUsage.chats}</p><p className="mt-1 text-xs text-[#8b949e]">AI chats</p></div>
                  <div className="rounded-lg bg-[#161b22] p-3"><p className="text-xl font-semibold tabular-nums text-[#79c0ff]">{aiUsage.summaries}</p><p className="mt-1 text-xs text-[#8b949e]">Summaries</p></div>
                  <div className="rounded-lg bg-[#161b22] p-3"><p className="text-xl font-semibold tabular-nums text-[#3fb950]">{aiUsage.organization}</p><p className="mt-1 text-xs text-[#8b949e]">Organize runs</p></div>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-[#6e7681]">Counts start after account-backed tracking is deployed. This is a request count, not token, time, or billing usage; it is synchronized through Supabase PostgreSQL for this GitHub account.</p>
                <p role="status" aria-live="polite" className={`mt-2 text-xs ${workspaceSaveStatus === "error" ? "text-[#ff7b72]" : workspaceSaveStatus === "saved" ? "text-[#3fb950]" : "text-[#8b949e]"}`}>{workspaceSaveStatus === "saving" ? "Saving workspace…" : workspaceSaveStatus === "saved" ? "Workspace saved" : workspaceSaveStatus === "error" ? "Workspace save failed or timed out. Please retry; check Render logs for the database error." : "Waiting for workspace changes…"}</p>
                {workspaceSaveStatus === "error" && workspaceSaveError && <p role="alert" className="mt-1 break-words text-xs text-[#ff7b72]">{workspaceSaveError}</p>}
              </div>
            </div>
            <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-5">
              <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#da3633]/10 text-[#ff7b72]"><Trash2 size={19}/></div><div className="min-w-0 flex-1"><h2 className="font-semibold text-[#f0f6fc]">Clear workspace data</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[#8b949e]">Remove project statuses, AI organization results, AI summaries, assessments, AI usage counts, and activity history saved for this GitHub account. Your GitHub repositories and account are not deleted or disconnected.</p><button type="button" onClick={clearAllWorkspaceData} className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#da3633]/60 px-3.5 py-2 text-sm font-medium text-[#ff7b72] transition hover:bg-[#da3633]/10"><Trash2 size={14}/> Clear all workspace data</button></div></div>
            </div>
          </section>}

          <footer className="mt-10 flex flex-col gap-2 border-t border-[#30363d] py-5 text-xs text-[#8b949e] sm:flex-row sm:items-center sm:justify-between"><span>RepoPilot · Ghost-Machine</span><span className="inline-flex items-center gap-1.5"><BookOpen size={13} />{lastSynced ? "GitHub repositories synchronized" : "Waiting for repository import"}</span></footer>
        </div>
      </main>
    </div>
  );
}

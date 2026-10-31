export type ProjectStatus =
  | "Not assessed"
  | "Needs review"
  | "In progress"
  | "Needs attention"
  | "Completed"
  | "On hold";

export type Repository = {
  id: number;
  name: string;
  fullName: string;
  url: string;
  description: string;
  language: string;
  stars: number;
  updatedAt: string;
  pushedAt: string | null;
  defaultBranch: string;
  archived: boolean;
  openIssues: number;
  topics: string[];
  private?: boolean;
  visibility?: string;
  status: ProjectStatus;
  note: string;
};

export type RepositoryImportResponse = {
  username: string;
  count: number;
  repositories: Omit<Repository, "status" | "note">[];
  error?: string;
  authenticated?: boolean;
  visibility?: string;
  rateLimit?: { remaining: string | null; retryAt: string | null };
};

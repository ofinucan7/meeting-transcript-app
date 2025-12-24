import type {
  Meeting,
  Task,
  TranscriptVersion,
  User,
  Workspace,
  Invite,
  WorkspaceMember,
  Extraction,
  ExtractedItem,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
    },
    credentials: "include",
  });

  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) msg = data.detail;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export const api = {
  me: () => request<User>("/auth/me"),

  startExtraction: (meetingId: number, model = "hf_structured") =>
    request<Extraction>(`/meetings/${meetingId}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    }),

  listExtractions: (meetingId: number) =>
    request<Extraction[]>(`/meetings/${meetingId}/extractions`),

  listItems: (meetingId: number) =>
    request<ExtractedItem[]>(`/meetings/${meetingId}/items`),
  
  listExtractionItems: (extractionId: number) =>
  request<any[]>(`/extractions/${extractionId}/items`),

patchExtractedItem: (itemId: number, patch: Partial<ExtractedItem> & { edit_reason?: string | null }) =>
  request<ExtractedItem>(`/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }),


  patchItem: (
    itemId: number,
    patch: Partial<
      Pick<
        ExtractedItem,
        | "title"
        | "details"
        | "speaker"
        | "timestamp_start"
        | "timestamp_end"
        | "status"
        | "needs_review"
        | "review_reasons"
      >
    > & { edit_reason?: string }
  ) =>
    request<ExtractedItem>(`/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  signup: (email: string, password: string) =>
    request<User>("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<User>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  listWorkspaces: () => request<Workspace[]>("/workspaces"),

  createWorkspace: (name: string) =>
    request<Workspace>("/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  listMeetings: (workspaceId: number) =>
    request<Meeting[]>(`/meetings?workspace_id=${workspaceId}`),

  createMeeting: (payload: {
    workspace_id: number;
    title: string;
    meeting_date: string | null;
  }) =>
    request<Meeting>("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  uploadTranscript: async (meetingId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${API_BASE}/meetings/${meetingId}/transcripts`, {
      method: "POST",
      body: form,
      credentials: "include",
    });

    if (!res.ok) {
      let msg = `Upload failed: ${res.status}`;
      try {
        const data = await res.json();
        if (data?.detail) msg = data.detail;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }

    return res.json() as Promise<TranscriptVersion>;
  },

  listTasks: (
    workspaceId: number,
    opts?: { assignee_display_name?: string }
  ) => {
    const params = new URLSearchParams({ workspace_id: String(workspaceId) });
    if (opts?.assignee_display_name) {
      params.set("assignee_display_name", opts.assignee_display_name);
    }
    return request<Task[]>(`/tasks?${params.toString()}`);
  },

  createTask: (payload: {
    workspace_id: number;
    title: string;
    details?: string | null;
    due_at?: string | null;
    assignee_display_name?: string | null;
    assignee_user_id?: number | null;
  }) =>
    request<Task>("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  patchTask: (taskId: number, patch: Partial<Task>) =>
    request<Task>(`/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
    patchExtractedItem: (
  itemId: number,
  patch: Partial<{
    status: "pending" | "approved" | "rejected";
    title: string;
    details: string | null;
    speaker: string | null;
    timestamp_start: number | null;
    timestamp_end: number | null;
    needs_review: boolean;
    review_reasons: string[] | null;
    edit_reason: string | null;
  }>
) =>
  request<ExtractedItem>(`/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }),

  listPendingInvites: () => request<Invite[]>("/invites/pending"),
  

  createInvite: (workspace_id: number, email: string) =>
    request<Invite>("/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id, email }),
    }),

  acceptInvite: (inviteId: number) =>
    request<void>(`/invites/${inviteId}/accept`, { method: "POST" }),

  declineInvite: (inviteId: number) =>
    request<void>(`/invites/${inviteId}/decline`, { method: "POST" }),

  listWorkspaceMembers: (workspaceId: number) =>
    request<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),

  updateWorkspaceMember: (
    workspaceId: number,
    memberId: number,
    display_name: string | null
  ) =>
    request<WorkspaceMember>(`/workspaces/${workspaceId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name }),
    }),


};

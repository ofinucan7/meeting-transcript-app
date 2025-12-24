export type User = { id: number; email: string };

export type Workspace = { id: number; name: string };

export type TaskStatus = "todo" | "in_progress" | "done";

export type Task = {
  id: number;
  workspace_id: number;
  user_id: number;
  title: string;
  details: string | null;
  due_at: string | null;
  status: TaskStatus;
  created_at: string;
};

export type Meeting = {
  id: number;
  workspace_id: number;
  title: string;
  meeting_date: string | null;
  created_at: string;
};

export type TranscriptVersion = {
  id: number;
  meeting_id: number;
  checksum: string;
  created_at: string;
};

export type Invite = {
  id: number;
  workspace_id: number;
  workspace_name: string;
  email: string;
  status: "pending" | "accepted" | "declined";
  invited_by_email: string | null;
  created_at: string;
};

export type WorkspaceMember = {
  id: number;
  user_id: number;
  email: string;
  role: "owner" | "member";
  display_name: string | null;
};

export type ExtractionStatus = "processing" | "complete" | "failed";

export type Extraction = {
  id: number;
  meeting_id: number;
  transcript_version_id: number;
  status: ExtractionStatus;
  model: string;
  created_at: string;
  error: string | null;
};

export type ExtractedItemKind =
  | "summary"
  | "decision"
  | "action_item"
  | "open_question"
  | "estimate"
  | "risk"
  | "note";

export type ExtractedItemStatus = "pending" | "approved" | "rejected";

export type ExtractedItem = {
  id: number;
  extraction_id: number;
  kind: ExtractedItemKind;
  title: string;
  details: string | null;
  contexts: string[];
  speaker: string | null;
  timestamp_start: string | null;
  timestamp_end: string | null;
  confidence: number | null;
  needs_review: boolean;
  review_reasons: string[] | null;
  status: ExtractedItemStatus;
  created_at: string;
};
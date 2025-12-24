from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

TaskStatus = Literal["todo", "in_progress", "done"]


class SignupIn(BaseModel):
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    model_config = ConfigDict(from_attributes=True)


class WorkspaceCreateIn(BaseModel):
    name: str


class WorkspaceOut(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class TaskCreateIn(BaseModel):
    workspace_id: int
    title: str
    details: str | None = None
    due_at: datetime | None = None
    assignee_display_name: str | None = None
    assignee_user_id: int | None = None


class TaskPatchIn(BaseModel):
    title: str | None = None
    details: str | None = None
    due_at: datetime | None = None
    status: TaskStatus | None = None


class TaskOut(BaseModel):
    id: int
    workspace_id: int
    user_id: int
    title: str
    details: str | None
    due_at: datetime | None
    status: TaskStatus
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class MeetingCreateIn(BaseModel):
    workspace_id: int
    title: str
    meeting_date: datetime | None = None


class MeetingOut(BaseModel):
    id: int
    workspace_id: int
    title: str
    meeting_date: datetime | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TranscriptVersionOut(BaseModel):
    id: int
    meeting_id: int
    checksum: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class InviteCreateIn(BaseModel):
    workspace_id: int
    email: EmailStr


class InviteOut(BaseModel):
    id: int
    workspace_id: int
    workspace_name: str
    email: EmailStr
    status: str
    invited_by_email: EmailStr | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class WorkspaceMemberOut(BaseModel):
    id: int
    user_id: int
    email: EmailStr
    role: str
    display_name: str | None

    model_config = ConfigDict(from_attributes=True)

class WorkspaceMemberUpdateIn(BaseModel):
    display_name: str | None = None

ExtractionStatus = Literal["processing", "ready", "failed"]
ItemStatus = Literal["pending", "approved", "rejected"]
ItemType = Literal["summary_topic", "decision", "action_item", "open_question", "estimate"]


class ExtractionStartIn(BaseModel):
    model: str | None = None
    transcript_version_id: int | None = None


class ExtractionOut(BaseModel):
    id: int
    meeting_id: int
    transcript_version_id: int
    status: ExtractionStatus
    model: str | None
    error: str | None
    created_at: datetime
    error: str | None = None
    raw_output: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ExtractedItemOut(BaseModel):
    id: int
    extraction_id: int
    item_type: str
    title: str
    details: str | None

    speaker: str | None
    timestamp_start: str | None
    timestamp_end: str | None

    confidence: float
    field_confidence: dict | None

    needs_review: bool
    review_reasons: list[str] | None

    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExtractedItemPatchIn(BaseModel):
    title: str | None = None
    details: str | None = None
    speaker: str | None = None
    timestamp_start: str | None = None
    timestamp_end: str | None = None
    status: ItemStatus | None = None
    needs_review: bool | None = None
    review_reasons: list[str] | None = None
    edit_reason: str | None = None
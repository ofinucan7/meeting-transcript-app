import hashlib
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..deps import get_current_user, require_membership
from ..models import Meeting, TranscriptVersion, User
from ..schemas import MeetingCreateIn, MeetingOut, TranscriptVersionOut

router = APIRouter(prefix="/meetings", tags=["meetings"])

@router.get("", response_model=list[MeetingOut])
async def list_meetings(
    workspace_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(workspace_id, user, db)
    rows = await db.execute(
        select(Meeting)
        .where(Meeting.workspace_id == workspace_id)
        .order_by(Meeting.created_at.desc())
    )
    return list(rows.scalars().all())


@router.post("", response_model=MeetingOut)
async def create_meeting(
    payload: MeetingCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(payload.workspace_id, user, db)

    m = Meeting(
        workspace_id=payload.workspace_id,
        title=payload.title,
        meeting_date=payload.meeting_date,
        created_by=user.id,
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return m

@router.post("/{meeting_id}/transcripts", response_model=TranscriptVersionOut)
async def upload_transcript(
    meeting_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meeting = await db.scalar(select(Meeting).where(Meeting.id == meeting_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    await require_membership(meeting.workspace_id, user, db)

    if not file.filename.lower().endswith(".txt"):
        raise HTTPException(status_code=400, detail="Please upload a .txt file")

    raw = (await file.read()).decode("utf-8", errors="replace").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Transcript file is empty")

    checksum = hashlib.sha256(raw.encode("utf-8")).hexdigest()

    tv = TranscriptVersion(
        meeting_id=meeting_id,
        uploaded_by=user.id,
        raw_text=raw,
        checksum=checksum,
    )
    db.add(tv)
    await db.commit()
    await db.refresh(tv)
    return tv
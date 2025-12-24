from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user, require_membership
from ..models import (
    User,
    Meeting,
    TranscriptVersion,
    Extraction,
    ExtractedItem,
    ItemEdit,
)
from ..schemas import (
    ExtractionStartIn,
    ExtractionOut,
    ExtractedItemOut,
    ExtractedItemPatchIn,
)
from ..extraction_runner import run_extraction_job

router = APIRouter(prefix="", tags=["extractions"])


@router.post("/meetings/{meeting_id}/extract", response_model=ExtractionOut)
async def start_extraction(
    meeting_id: int,
    payload: ExtractionStartIn,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    meeting = await db.scalar(select(Meeting).where(Meeting.id == meeting_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    await require_membership(meeting.workspace_id, me, db)

    tv_id = payload.transcript_version_id
    if tv_id is None:
        tv = await db.scalar(
            select(TranscriptVersion)
            .where(TranscriptVersion.meeting_id == meeting_id)
            .order_by(desc(TranscriptVersion.created_at))
        )
        if not tv:
            raise HTTPException(status_code=400, detail="No transcript uploaded for this meeting")
        tv_id = tv.id
    else:
        tv = await db.scalar(
            select(TranscriptVersion).where(
                TranscriptVersion.id == tv_id,
                TranscriptVersion.meeting_id == meeting_id,
            )
        )
        if not tv:
            raise HTTPException(status_code=404, detail="Transcript version not found")

    extraction = Extraction(
        meeting_id=meeting_id,
        transcript_version_id=tv_id,
        status="processing",
        model=payload.model,
        created_by=me.id,
    )
    db.add(extraction)
    await db.commit()
    await db.refresh(extraction)

    background_tasks.add_task(run_extraction_job, extraction.id)

    return extraction


@router.get("/meetings/{meeting_id}/extractions", response_model=list[ExtractionOut])
async def list_extractions(
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    meeting = await db.scalar(select(Meeting).where(Meeting.id == meeting_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    await require_membership(meeting.workspace_id, me, db)

    res = await db.execute(
        select(Extraction).where(Extraction.meeting_id == meeting_id).order_by(desc(Extraction.created_at))
    )
    return res.scalars().all()


@router.get("/extractions/{extraction_id}/items", response_model=list[ExtractedItemOut])
async def list_extracted_items(
    extraction_id: int,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    extraction = await db.scalar(select(Extraction).where(Extraction.id == extraction_id))
    if not extraction:
        raise HTTPException(status_code=404, detail="Extraction not found")

    meeting = await db.scalar(select(Meeting).where(Meeting.id == extraction.meeting_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    await require_membership(meeting.workspace_id, me, db)

    res = await db.execute(
        select(ExtractedItem)
        .where(ExtractedItem.extraction_id == extraction_id)
        .order_by(ExtractedItem.created_at.asc())
    )
    return res.scalars().all()


@router.patch("/items/{item_id}", response_model=ExtractedItemOut)
async def patch_item(
    item_id: int,
    payload: ExtractedItemPatchIn,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    item = await db.scalar(select(ExtractedItem).where(ExtractedItem.id == item_id))
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    extraction = await db.scalar(select(Extraction).where(Extraction.id == item.extraction_id))
    if not extraction:
        raise HTTPException(status_code=404, detail="Extraction not found")

    meeting = await db.scalar(select(Meeting).where(Meeting.id == extraction.meeting_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    await require_membership(meeting.workspace_id, me, db)

    before = {
        "title": item.title,
        "details": item.details,
        "speaker": item.speaker,
        "timestamp_start": item.timestamp_start,
        "timestamp_end": item.timestamp_end,
        "status": item.status,
        "needs_review": item.needs_review,
        "review_reasons": item.review_reasons,
    }

    data = payload.model_dump(exclude_unset=True)
    edit_reason = data.pop("edit_reason", None)

    for k, v in data.items():
        setattr(item, k, v)

    after = {
        "title": item.title,
        "details": item.details,
        "speaker": item.speaker,
        "timestamp_start": item.timestamp_start,
        "timestamp_end": item.timestamp_end,
        "status": item.status,
        "needs_review": item.needs_review,
        "review_reasons": item.review_reasons,
    }

    db.add(
        ItemEdit(
            item_id=item.id,
            edited_by=me.id,
            prev_json=before,
            next_json=after,
            reason=edit_reason,
        )
    )

    await db.commit()
    await db.refresh(item)
    return item
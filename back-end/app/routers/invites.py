from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..deps import get_current_user, require_owner
from ..models import User, Workspace, WorkspaceInvite, WorkspaceMember
from ..schemas import InviteCreateIn, InviteOut

router = APIRouter(prefix="/invites", tags=["invites"])

@router.post("", response_model=InviteOut)
async def create_invite(
    payload: InviteCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_owner(payload.workspace_id, user, db)

    email = payload.email.lower().strip()

    existing_member = await db.scalar(
        select(WorkspaceMember)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == payload.workspace_id, User.email == email)
    )
    if existing_member:
        raise HTTPException(status_code=400, detail="That email is already a member of this workspace")

    pending = await db.scalar(
        select(WorkspaceInvite).where(
            WorkspaceInvite.workspace_id == payload.workspace_id,
            WorkspaceInvite.email == email,
            WorkspaceInvite.status == "pending",
        )
    )
    if pending:
        raise HTTPException(status_code=400, detail="An invite for that email is already pending")

    ws = await db.scalar(select(Workspace).where(Workspace.id == payload.workspace_id))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    inv = WorkspaceInvite(
        workspace_id=payload.workspace_id,
        email=email,
        invited_by=user.id,
        status="pending",
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)

    return InviteOut(
        id=inv.id,
        workspace_id=inv.workspace_id,
        workspace_name=ws.name,
        email=inv.email,
        status=inv.status,
        invited_by_email=user.email,
        created_at=inv.created_at,
    )


@router.get("/pending", response_model=list[InviteOut])
async def list_my_pending_invites(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    email = user.email.lower().strip()

    rows = await db.execute(
        select(WorkspaceInvite, Workspace, User)
        .join(Workspace, Workspace.id == WorkspaceInvite.workspace_id)
        .outerjoin(User, User.id == WorkspaceInvite.invited_by)
        .where(WorkspaceInvite.email == email, WorkspaceInvite.status == "pending")
        .order_by(WorkspaceInvite.created_at.desc())
    )

    out: list[InviteOut] = []
    for inv, ws, inviter in rows.all():
        out.append(
            InviteOut(
                id=inv.id,
                workspace_id=inv.workspace_id,
                workspace_name=ws.name,
                email=inv.email,
                status=inv.status,
                invited_by_email=(inviter.email if inviter else None),
                created_at=inv.created_at,
            )
        )
    return out


@router.post("/{invite_id}/accept", response_model=InviteOut)
async def accept_invite(
    invite_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    inv = await db.scalar(select(WorkspaceInvite).where(WorkspaceInvite.id == invite_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    if inv.status != "pending":
        raise HTTPException(status_code=400, detail="Invite is not pending")
    if inv.email.lower().strip() != user.email.lower().strip():
        raise HTTPException(status_code=403, detail="This invite is not for your email")

    ws = await db.scalar(select(Workspace).where(Workspace.id == inv.workspace_id))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    inviter = None
    if inv.invited_by is not None:
        inviter = await db.scalar(select(User).where(User.id == inv.invited_by))

    existing = await db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == inv.workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if not existing:
        db.add(WorkspaceMember(workspace_id=inv.workspace_id, user_id=user.id, role="member"))

    inv.status = "accepted"
    inv.responded_at = datetime.now(timezone.utc)
    await db.commit()

    return InviteOut(
        id=inv.id,
        workspace_id=inv.workspace_id,
        workspace_name=ws.name,
        email=inv.email,
        status=inv.status,
        invited_by_email=(inviter.email if inviter else None),
        created_at=inv.created_at,
    )


@router.post("/{invite_id}/decline", response_model=InviteOut)
async def decline_invite(
    invite_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    inv = await db.scalar(select(WorkspaceInvite).where(WorkspaceInvite.id == invite_id))
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    if inv.status != "pending":
        raise HTTPException(status_code=400, detail="Invite is not pending")
    if inv.email.lower().strip() != user.email.lower().strip():
        raise HTTPException(status_code=403, detail="This invite is not for your email")

    ws = await db.scalar(select(Workspace).where(Workspace.id == inv.workspace_id))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    inviter = None
    if inv.invited_by is not None:
        inviter = await db.scalar(select(User).where(User.id == inv.invited_by))

    inv.status = "declined"
    inv.responded_at = datetime.now(timezone.utc)
    await db.commit()

    return InviteOut(
        id=inv.id,
        workspace_id=inv.workspace_id,
        workspace_name=ws.name,
        email=inv.email,
        status=inv.status,
        invited_by_email=(inviter.email if inviter else None),
        created_at=inv.created_at,
    )
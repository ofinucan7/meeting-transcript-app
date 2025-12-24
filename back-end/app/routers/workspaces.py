from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..deps import get_current_user, require_membership
from ..models import User, Workspace, WorkspaceMember
from ..schemas import (
    WorkspaceCreateIn,
    WorkspaceOut,
    WorkspaceMemberOut,
    WorkspaceMemberUpdateIn,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    res = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == me.id)
        .order_by(Workspace.created_at.desc())
    )
    return res.scalars().all()


@router.post("", response_model=WorkspaceOut)
async def create_workspace(
    payload: WorkspaceCreateIn,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    ws = Workspace(name=payload.name)
    db.add(ws)
    await db.flush()

    db.add(
        WorkspaceMember(
            workspace_id=ws.id,
            user_id=me.id,
            role="owner",
            display_name=None,
        )
    )

    await db.commit()
    await db.refresh(ws)
    return ws


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberOut])
async def list_members(
    workspace_id: int,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    await require_membership(workspace_id, me, db)

    res = await db.execute(
        select(WorkspaceMember, User.email)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.id.asc())
    )

    out: list[WorkspaceMemberOut] = []
    for member, email in res.all():
        out.append(
            WorkspaceMemberOut(
                id=member.id,
                user_id=member.user_id,
                email=email,
                role=member.role,
                display_name=member.display_name,
            )
        )
    return out


@router.patch("/{workspace_id}/members/{member_id}", response_model=WorkspaceMemberOut)
async def update_member(
    workspace_id: int,
    member_id: int,
    payload: WorkspaceMemberUpdateIn,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    my_membership = await require_membership(workspace_id, me, db)

    member = await db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.id == member_id,
            WorkspaceMember.workspace_id == workspace_id,
        )
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if my_membership.role != "owner" and member.user_id != me.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    member.display_name = payload.display_name
    await db.commit()
    await db.refresh(member)

    email = await db.scalar(select(User.email).where(User.id == member.user_id))
    return WorkspaceMemberOut(
        id=member.id,
        user_id=member.user_id,
        email=email,
        role=member.role,
        display_name=member.display_name,
    )
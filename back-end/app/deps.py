from __future__ import annotations
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .db import get_db
from .models import User, WorkspaceMember
from .security import decode_token


def get_token_from_cookie(request: Request) -> str | None:
    return request.cookies.get("access_token")


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    token = get_token_from_cookie(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


async def require_membership(workspace_id: int, user: User, db: AsyncSession) -> WorkspaceMember:
    member = await db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not a workspace member")
    return member


async def require_owner(workspace_id: int, user: User, db: AsyncSession) -> None:
    member = await require_membership(workspace_id, user, db)
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Only workspace owners can perform this action")
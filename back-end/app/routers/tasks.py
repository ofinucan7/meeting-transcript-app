from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..deps import get_current_user, require_membership
from ..models import Task, User, WorkspaceMember
from ..schemas import TaskCreateIn, TaskOut, TaskPatchIn

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
async def list_tasks(
  workspace_id: int,
  db: AsyncSession = Depends(get_db),
  user: User = Depends(get_current_user),
):
  await require_membership(workspace_id, user, db)

  rows = await db.execute(
    select(Task)
    .where(Task.workspace_id == workspace_id, Task.user_id == user.id)
    .order_by(Task.created_at.desc())
  )
  return list(rows.scalars().all())


@router.post("", response_model=TaskOut)
async def create_task(
  payload: TaskCreateIn,
  db: AsyncSession = Depends(get_db),
  user: User = Depends(get_current_user),
):
  me_member = await require_membership(payload.workspace_id, user, db)

  assignee_user_id = user.id

  if payload.assignee_user_id is not None:
    if payload.assignee_user_id != user.id and me_member.role != "owner":
      raise HTTPException(status_code=403, detail="Only owners can assign tasks to others")

    member = await db.scalar(
      select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == payload.workspace_id,
        WorkspaceMember.user_id == payload.assignee_user_id,
      )
    )
    if not member:
      raise HTTPException(status_code=400, detail="assignee_user_id is not a workspace member")
    assignee_user_id = payload.assignee_user_id

  elif payload.assignee_display_name:
    cleaned = payload.assignee_display_name.strip()
    if cleaned:
      member = await db.scalar(
        select(WorkspaceMember).where(
          WorkspaceMember.workspace_id == payload.workspace_id,
          func.lower(WorkspaceMember.display_name) == func.lower(cleaned),
        )
      )
      if not member:
        raise HTTPException(
          status_code=400,
          detail="assignee_display_name did not match any workspace member display_name",
        )

      if member.user_id != user.id and me_member.role != "owner":
        raise HTTPException(status_code=403, detail="Only owners can assign tasks to others")

      assignee_user_id = member.user_id

  task = Task(
    workspace_id=payload.workspace_id,
    user_id=assignee_user_id,
    title=payload.title,
    details=payload.details,
    due_at=payload.due_at,
    status="todo",
  )
  db.add(task)

  await db.commit()
  await db.refresh(task)
  return task

@router.patch("/{task_id}", response_model=TaskOut)
async def patch_task(
  task_id: int,
  payload: TaskPatchIn,
  db: AsyncSession = Depends(get_db),
  user: User = Depends(get_current_user),
):
  task = await db.scalar(select(Task).where(Task.id == task_id))
  if not task:
    raise HTTPException(status_code=404, detail="Task not found")

  await require_membership(task.workspace_id, user, db)

  if task.user_id != user.id:
    raise HTTPException(status_code=403, detail="Not your task")

  data = payload.model_dump(exclude_unset=True)
  for k, v in data.items():
    setattr(task, k, v)

  await db.commit()
  await db.refresh(task)
  return task
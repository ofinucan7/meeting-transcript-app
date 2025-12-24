from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..models import User
from ..schemas import LoginIn, SignupIn, UserOut
from ..security import create_access_token, hash_password, verify_password
from ..deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

def _ensure_bcrypt_password_ok(pw: str):
    if len(pw.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="Password too long (bcrypt max is 72 bytes). Use a shorter password.",
        )


def _set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="none",
        secure=True,
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


@router.post("/signup", response_model=UserOut)
async def signup(
    payload: SignupIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    _ensure_bcrypt_password_ok(payload.password)

    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")

    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    _set_auth_cookie(response, token)

    return user


@router.post("/login", response_model=UserOut)
async def login(
    payload: LoginIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(str(user.id))
    _set_auth_cookie(response, token)

    return user


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user

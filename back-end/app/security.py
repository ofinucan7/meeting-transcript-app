import os
from datetime import datetime, timedelta, timezone
from jose import jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY", "dev_secret_change_me")
ALGORITHM = "HS256"
EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))

def hash_password(pw: str) -> str:
  return pwd_context.hash(pw)

def verify_password(pw: str, pw_hash: str) -> bool:
  return pwd_context.verify(pw, pw_hash)

def create_access_token(sub: str) -> str:
  exp = datetime.now(timezone.utc) + timedelta(minutes=EXPIRE_MINUTES)
  payload = {"sub": sub, "exp": exp}
  return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
  return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

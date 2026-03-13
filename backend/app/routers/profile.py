from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserProfile
from app.schemas import UserProfileOut, UserProfileUpdate

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/", response_model=UserProfileOut)
def get_profile(db: Session = Depends(get_db)):
    profile = db.get(UserProfile, 1)
    if profile is None:
        return UserProfileOut(id=1)
    return profile


@router.patch("/", response_model=UserProfileOut)
def update_profile(body: UserProfileUpdate, db: Session = Depends(get_db)):
    profile = db.get(UserProfile, 1)
    if profile is None:
        profile = UserProfile(id=1)
        db.add(profile)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile

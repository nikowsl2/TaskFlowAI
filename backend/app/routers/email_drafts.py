"""CRUD endpoints for email drafts."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import EmailDraft
from app.schemas import EmailDraftCreate, EmailDraftOut, EmailDraftUpdate

router = APIRouter(prefix="/drafts", tags=["email_drafts"])


@router.get("/", response_model=list[EmailDraftOut])
def list_drafts(db: Session = Depends(get_db)):
    return db.query(EmailDraft).order_by(EmailDraft.created_at.desc()).all()


@router.post("/", response_model=EmailDraftOut, status_code=201)
def create_draft(payload: EmailDraftCreate, db: Session = Depends(get_db)):
    draft = EmailDraft(**payload.model_dump())
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft


@router.get("/{draft_id}", response_model=EmailDraftOut)
def get_draft(draft_id: int, db: Session = Depends(get_db)):
    draft = db.get(EmailDraft, draft_id)
    if not draft:
        raise HTTPException(404, f"Draft #{draft_id} not found")
    return draft


@router.patch("/{draft_id}", response_model=EmailDraftOut)
def update_draft(draft_id: int, payload: EmailDraftUpdate, db: Session = Depends(get_db)):
    draft = db.get(EmailDraft, draft_id)
    if not draft:
        raise HTTPException(404, f"Draft #{draft_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(draft, field, value)
    db.commit()
    db.refresh(draft)
    return draft


@router.delete("/{draft_id}", status_code=204)
def delete_draft(draft_id: int, db: Session = Depends(get_db)):
    draft = db.get(EmailDraft, draft_id)
    if not draft:
        raise HTTPException(404, f"Draft #{draft_id} not found")
    db.delete(draft)
    db.commit()

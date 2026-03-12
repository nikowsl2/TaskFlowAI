"""CRUD endpoints for saved meeting notes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MeetingNote
from app.schemas import MeetingNoteCreate, MeetingNoteOut, MeetingNoteUpdate

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/", response_model=list[MeetingNoteOut])
def list_notes(db: Session = Depends(get_db)):
    return db.query(MeetingNote).order_by(MeetingNote.meeting_time.desc()).all()


@router.post("/", response_model=MeetingNoteOut, status_code=201)
def create_note(payload: MeetingNoteCreate, db: Session = Depends(get_db)):
    note = MeetingNote(**payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/{note_id}", response_model=MeetingNoteOut)
def get_note(note_id: int, db: Session = Depends(get_db)):
    note = db.get(MeetingNote, note_id)
    if not note:
        raise HTTPException(404, f"Note #{note_id} not found")
    return note


@router.patch("/{note_id}", response_model=MeetingNoteOut)
def update_note(note_id: int, payload: MeetingNoteUpdate, db: Session = Depends(get_db)):
    note = db.get(MeetingNote, note_id)
    if not note:
        raise HTTPException(404, f"Note #{note_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = db.get(MeetingNote, note_id)
    if not note:
        raise HTTPException(404, f"Note #{note_id} not found")
    db.delete(note)
    db.commit()

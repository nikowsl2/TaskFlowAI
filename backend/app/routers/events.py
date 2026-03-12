"""CRUD endpoints for calendar events."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CalendarEvent
from app.schemas import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/", response_model=list[CalendarEventOut])
def list_events(db: Session = Depends(get_db)):
    return db.query(CalendarEvent).order_by(CalendarEvent.start_time.asc()).all()


@router.post("/", response_model=CalendarEventOut, status_code=201)
def create_event(payload: CalendarEventCreate, db: Session = Depends(get_db)):
    ev = CalendarEvent(**payload.model_dump())
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.patch("/{event_id}", response_model=CalendarEventOut)
def update_event(event_id: int, payload: CalendarEventUpdate, db: Session = Depends(get_db)):
    ev = db.get(CalendarEvent, event_id)
    if not ev:
        raise HTTPException(404, f"Event #{event_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ev, field, value)
    db.commit()
    db.refresh(ev)
    return ev


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: int, db: Session = Depends(get_db)):
    ev = db.get(CalendarEvent, event_id)
    if not ev:
        raise HTTPException(404, f"Event #{event_id} not found")
    db.delete(ev)
    db.commit()

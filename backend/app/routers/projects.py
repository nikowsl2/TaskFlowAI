from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai import episodic
from app.database import get_db
from app.models import Project
from app.schemas import LogEpisodeRequest, ProjectCreate, ProjectOut, ProjectUpdate

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.created_at.desc()).all()


@router.post("/", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(name=body.name, description=body.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, body: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        episodic.delete_project_episodes(project_id)
    except Exception:
        log.warning("Failed to delete episodes for project %d", project_id)
    db.delete(project)
    db.commit()


@router.post("/{project_id}/episodes", status_code=status.HTTP_201_CREATED)
def log_episode(project_id: int, body: LogEpisodeRequest, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    episode_id = episodic.log_episode(project_id, body.memory_text)
    return {"episode_id": episode_id}


@router.get("/{project_id}/episodes")
def list_episodes(project_id: int, db: Session = Depends(get_db)):
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return episodic.get_project_episodes(project_id)


@router.delete("/{project_id}/episodes/{episode_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_single_episode(project_id: int, episode_id: str, db: Session = Depends(get_db)):
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        episodic.delete_episode(episode_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete memory")

"""Controlled disclosure, bounded private evidence, and explicit membership."""
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user, require_reviewer
from ..models import AuditLog, Evidence, Organization, Project, User
from ..platform_models import DataRoom, EvidenceFile, Invitation, NexusResource, RoomAccess, RoomDisclosure, RoomQuestion
from ..schemas import UserOut
from ..security import create_token, hash_password
from .core import get_project_or_404
from ..auth_limits import limit_auth

router = APIRouter(prefix="/api", tags=["collaboration"])
MAX_FILE = 5 * 1024 * 1024


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class AccountIn(Payload):
    email: str = Field(min_length=5, max_length=255)
    password: Annotated[str, StringConstraints(strip_whitespace=False, min_length=12, max_length=128)]
    full_name: str = Field(min_length=2, max_length=255)
    organization_name: str = Field(min_length=2, max_length=255)
    locale: Literal["ar", "fr", "en"] = "ar"

    @field_validator("email")
    @classmethod
    def email_valid(cls, value):
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Invalid email")
        return value.lower()


class InvitationIn(Payload):
    email: str = Field(min_length=5, max_length=255)
    role: Literal["member", "reviewer"] = "member"
    _email_valid = field_validator("email")(AccountIn.email_valid.__func__)


class AcceptInvitation(Payload):
    token: str = Field(min_length=40, max_length=100)
    full_name: str = Field(min_length=2, max_length=255)
    password: Annotated[str, StringConstraints(strip_whitespace=False, min_length=12, max_length=128)]


class RoomIn(Payload):
    project_id: int
    title: str = Field(min_length=3, max_length=255)
    purpose: str = Field(min_length=5, max_length=3000)
    discoverable: bool = False


class ReasonIn(Payload):
    reason: str = Field(min_length=5, max_length=3000)


class AccessDecision(ReasonIn):
    status: Literal["approved", "rejected", "revoked"]


class RoomUpdate(Payload):
    status: Literal["open", "closed"]


class DisclosureIn(Payload):
    evidence_id: int


class QuestionIn(Payload):
    question: str = Field(min_length=5, max_length=3000)


class AnswerIn(Payload):
    answer: str = Field(min_length=2, max_length=3000)


class ResourceIn(Payload):
    project_id: int
    domain: Literal["water", "energy", "food", "ecosystem", "health"]
    name: str = Field(min_length=2, max_length=255)
    kind: str = Field(min_length=2, max_length=100)
    quantity: str = Field(max_length=80)
    unit: str = Field(min_length=1, max_length=40)
    source: str = Field(min_length=2, max_length=255)
    provenance: Literal["OBSERVED", "PROPOSED"] = "OBSERVED"

    @field_validator("quantity")
    @classmethod
    def valid_quantity(cls, value):
        try:
            number = Decimal(value)
            if not number.is_finite() or number < 0:
                raise ValueError("Invalid quantity")
        except Exception as exc:
            raise ValueError("Invalid quantity") from exc
        return str(number)


def commit(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        api_error(409, "CONFLICT", "Record already exists or was modified")


def admin(user=Depends(get_current_user)):
    if user.role != "admin":
        api_error(403, "ROLE_FORBIDDEN", "Administrator required")
    return user


def token_response(user):
    return {"token": create_token(user.id, user.password_hash), "user": UserOut.model_validate(user)}


@router.post("/auth/register", status_code=201, dependencies=[Depends(limit_auth)])
def register(payload: AccountIn, db: Session = Depends(get_db)):
    if db.scalar(select(User.id).where(User.email == payload.email)):
        api_error(409, "CONFLICT", "Account already exists")
    org = Organization(code="ORG-" + secrets.token_hex(8), name_ar=payload.organization_name,
                       name_fr=payload.organization_name, name_en=payload.organization_name, is_demo=False)
    db.add(org)
    db.flush()
    user = User(org_id=org.id, email=payload.email, password_hash=hash_password(payload.password),
                full_name=payload.full_name, role="admin", locale=payload.locale)
    db.add(user)
    try:
        db.flush()
        audit(db, user, "register", "organization", entity_id=org.id)
        commit(db)
    except IntegrityError:
        db.rollback()
        api_error(409, "CONFLICT", "Account already exists")
    return token_response(user)


@router.get("/org/members", response_model=list[UserOut])
def members(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(User).where(User.org_id == user.org_id).order_by(User.id)).all()


def invite_view(inv):
    return {"id": inv.id, "email": inv.email, "role": inv.role, "status": inv.status, "expires_at": inv.expires_at}


@router.get("/org/invitations")
def invitations(user=Depends(admin), db: Session = Depends(get_db)):
    return [invite_view(i) for i in db.scalars(select(Invitation).where(Invitation.org_id == user.org_id)).all()]


@router.post("/org/invitations", status_code=201)
def invite(payload: InvitationIn, user=Depends(admin), db: Session = Depends(get_db)):
    if db.scalar(select(User.id).where(User.email == payload.email)):
        api_error(409, "CONFLICT", "Account already exists")
    # Only hashes persist; a new invitation revokes earlier unused invitations.
    for old in db.scalars(select(Invitation).where(Invitation.org_id == user.org_id, Invitation.email == payload.email, Invitation.status == "pending")):
        old.status = "revoked"
    token = secrets.token_urlsafe(32)
    inv = Invitation(org_id=user.org_id, email=payload.email, role=payload.role,
                     token_hash=hashlib.sha256(token.encode()).hexdigest(), created_by=user.id,
                     expires_at=datetime.now(timezone.utc) + timedelta(days=3))
    db.add(inv)
    db.flush()
    audit(db, user, "invite", "invitation", entity_id=inv.id)
    commit(db)
    return {**invite_view(inv), "token": token, "delivery": "manual"}


@router.post("/org/invitations/accept", status_code=201, dependencies=[Depends(limit_auth)])
def accept_invite(payload: AcceptInvitation, db: Session = Depends(get_db)):
    inv = db.scalar(select(Invitation).where(Invitation.token_hash == hashlib.sha256(payload.token.encode()).hexdigest()).with_for_update())
    if inv is None or inv.status != "pending" or inv.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        api_error(400, "INVITATION_INVALID", "Invitation invalid or expired")
    if db.scalar(select(User.id).where(User.email == inv.email)):
        api_error(409, "CONFLICT", "Account already exists")
    user = User(org_id=inv.org_id, email=inv.email, full_name=payload.full_name,
                password_hash=hash_password(payload.password), role=inv.role)
    db.add(user)
    try:
        db.flush()
        inv.status = "accepted"
        audit(db, user, "accept_invitation", "invitation", entity_id=inv.id)
        commit(db)
    except IntegrityError:
        db.rollback()
        api_error(409, "CONFLICT", "Account already exists")
    return token_response(user)


@router.patch("/org/invitations/{invitation_id}/revoke")
def revoke_invite(invitation_id: int, user=Depends(admin), db: Session = Depends(get_db)):
    inv = db.get(Invitation, invitation_id)
    if not inv or inv.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Invitation not found")
    if inv.status != "pending":
        api_error(409, "CONFLICT", "Invitation already resolved")
    inv.status = "revoked"
    audit(db, user, "revoke", "invitation", entity_id=inv.id)
    commit(db)
    return invite_view(inv)


def evidence_for_user(evidence_id, user, db):
    ev = db.get(Evidence, evidence_id)
    if not ev or ev.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Evidence not found")
    return ev


def file_view(f):
    return {"id": f.id, "filename": f.filename, "media_type": f.media_type, "size": f.size, "sha256": f.sha256, "created_at": f.created_at}


@router.get("/evidences/{evidence_id}/files")
def evidence_files(evidence_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    evidence_for_user(evidence_id, user, db)
    return [file_view(f) for f in db.scalars(select(EvidenceFile).where(EvidenceFile.evidence_id == evidence_id))]


@router.post("/evidences/{evidence_id}/files", status_code=201)
async def upload_file(evidence_id: int, request: Request, filename: str,
                      user=Depends(get_current_user), db: Session = Depends(get_db)):
    ev = evidence_for_user(evidence_id, user, db)
    if ev.submitted_by != user.id or ev.status != "submitted":
        api_error(403, "FILE_LOCKED", "Only the submitter may attach files before review")
    # Bound memory before concatenating; never use user input as a filesystem path.
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_FILE:
            api_error(413, "FILE_TOO_LARGE", "Maximum file size is 5 MiB")
        chunks.append(chunk)
    data = b"".join(chunks)
    media = request.headers.get("content-type", "").split(";")[0]
    signatures = {"application/pdf": b"%PDF-", "image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff"}
    extensions = {"application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg"}
    if media not in signatures or not data.startswith(signatures[media]):
        api_error(415, "FILE_TYPE_INVALID", "PDF, PNG or JPEG required")
    safe_name = re.sub(r"[^\w. -]", "_", filename.replace("\\", "/").split("/")[-1])[:180]
    safe_name = (safe_name.rsplit(".", 1)[0] or "evidence") + extensions[media]
    # Hold the evidence row while attaching, so review and upload cannot race.
    db.refresh(ev, with_for_update=True)
    if ev.status != "submitted":
        api_error(409, "FILE_LOCKED", "Evidence already reviewed")
    if len(db.scalars(select(EvidenceFile.id).where(EvidenceFile.evidence_id == ev.id)).all()) >= 10:
        api_error(409, "FILE_LIMIT", "Maximum ten attachments per evidence")
    record = EvidenceFile(org_id=user.org_id, evidence_id=ev.id, uploaded_by=user.id,
                          filename=safe_name, media_type=media, sha256=hashlib.sha256(data).hexdigest(), size=size, content=data)
    db.add(record)
    db.flush()
    audit(db, user, "upload", "evidence_file", entity_id=record.id, project_id=ev.project_id, meta={"sha256": record.sha256, "size": size})
    commit(db)
    return file_view(record)


def file_response(record):
    # Download only. No HTML/SVG, previews, execution or external processing.
    return Response(record.content, media_type="application/octet-stream", headers={"Content-Disposition": "attachment", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.get("/evidence-files/{file_id}/download")
def download_file(file_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.get(EvidenceFile, file_id)
    if not f or f.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "File not found")
    ev = evidence_for_user(f.evidence_id, user, db)
    audit(db, user, "download", "evidence_file", entity_id=f.id, project_id=ev.project_id)
    commit(db)
    return file_response(f)


def room_owner(room_id, user, db):
    room = db.get(DataRoom, room_id)
    if not room or room.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Room not found")
    if user.role not in ("reviewer", "admin"):
        api_error(403, "ROLE_FORBIDDEN", "Reviewer required")
    return room


def room_access(room_id, user, db):
    room = db.get(DataRoom, room_id)
    if not room or room.status != "open":
        api_error(404, "NOT_FOUND", "Room not found")
    if room.org_id != user.org_id:
        grant = db.scalar(select(RoomAccess).where(RoomAccess.room_id == room.id, RoomAccess.user_id == user.id, RoomAccess.status == "approved"))
        if not grant:
            api_error(404, "NOT_FOUND", "Room not found")
    return room


def room_summary(room, user, db):
    grant = db.scalar(select(RoomAccess).where(RoomAccess.room_id == room.id, RoomAccess.user_id == user.id))
    own = room.org_id == user.org_id
    return {"id": room.id, "title": room.title, "purpose": room.purpose, "status": room.status,
            "discoverable": room.discoverable, "own": own, "can_manage": own and user.role in ("reviewer", "admin"),
            "access": "owner" if own else grant.status if grant else "none"}


@router.get("/data-rooms")
def list_rooms(user=Depends(get_current_user), db: Session = Depends(get_db)):
    grants = select(RoomAccess.room_id).where(RoomAccess.user_id == user.id)
    rooms = db.scalars(select(DataRoom).where(or_(DataRoom.org_id == user.org_id, DataRoom.id.in_(grants),
                                                  (DataRoom.discoverable.is_(True) & (DataRoom.status == "open")))).order_by(DataRoom.id.desc())).all()
    return [room_summary(r, user, db) for r in rooms]


@router.post("/data-rooms", status_code=201)
def create_room(payload: RoomIn, user=Depends(require_reviewer), db: Session = Depends(get_db)):
    get_project_or_404(db, user, payload.project_id)
    room = DataRoom(org_id=user.org_id, created_by=user.id, **payload.model_dump())
    db.add(room)
    db.flush()
    audit(db, user, "create", "data_room", entity_id=room.id, project_id=room.project_id)
    commit(db)
    return room_summary(room, user, db)


@router.patch("/data-rooms/{room_id}")
def update_room(room_id: int, payload: RoomUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    room = room_owner(room_id, user, db)
    room.status = payload.status
    audit(db, user, "status_change", "data_room", entity_id=room.id, project_id=room.project_id, meta={"status": room.status})
    commit(db)
    return room_summary(room, user, db)


@router.post("/data-rooms/{room_id}/access", status_code=201)
def request_access(room_id: int, payload: ReasonIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    room = db.get(DataRoom, room_id)
    if not room or not room.discoverable or room.status != "open":
        api_error(404, "NOT_FOUND", "Room not found")
    if room.org_id == user.org_id:
        api_error(409, "CONFLICT", "Already an organization member")
    access = RoomAccess(room_id=room.id, user_id=user.id, reason=payload.reason)
    db.add(access)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        api_error(409, "CONFLICT", "Access request already exists")
    audit(db, user, "request_access", "data_room", entity_id=room.id, org_id=room.org_id)
    commit(db)
    return {"id": access.id, "status": access.status}


@router.get("/data-rooms/{room_id}/access")
def list_access(room_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    room_owner(room_id, user, db)
    out = []
    for grant in db.scalars(select(RoomAccess).where(RoomAccess.room_id == room_id)):
        person = db.get(User, grant.user_id)
        out.append({"id": grant.id, "user_name": person.full_name, "organization": db.get(Organization, person.org_id).code,
                    "reason": grant.reason, "status": grant.status, "decision_reason": grant.decision_reason})
    return out


@router.patch("/data-rooms/{room_id}/access/{access_id}")
def decide_access(room_id: int, access_id: int, payload: AccessDecision, user=Depends(get_current_user), db: Session = Depends(get_db)):
    room = room_owner(room_id, user, db)
    grant = db.scalar(select(RoomAccess).where(RoomAccess.id == access_id, RoomAccess.room_id == room_id).with_for_update())
    if not grant:
        api_error(404, "NOT_FOUND", "Request not found")
    allowed = {"pending": {"approved", "rejected"}, "approved": {"revoked"}}
    if payload.status not in allowed.get(grant.status, set()):
        api_error(409, "CONFLICT", "Invalid access transition")
    grant.status, grant.decision_reason, grant.decided_by = payload.status, payload.reason, user.id
    audit(db, user, "access_" + payload.status, "data_room", entity_id=room.id, project_id=room.project_id, meta={"request_id": grant.id, "reason": payload.reason})
    commit(db)
    return {"id": grant.id, "status": grant.status}


@router.post("/data-rooms/{room_id}/disclosures", status_code=201)
def disclose(room_id: int, payload: DisclosureIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    room = room_owner(room_id, user, db)
    ev = evidence_for_user(payload.evidence_id, user, db)
    if room.status != "open" or ev.project_id != room.project_id or ev.status != "verified":
        api_error(409, "DISCLOSURE_INVALID", "Only verified evidence from this room's project may be disclosed")
    record = RoomDisclosure(room_id=room.id, evidence_id=ev.id, disclosed_by=user.id)
    db.add(record)
    audit(db, user, "disclose", "data_room", entity_id=room.id, project_id=room.project_id, meta={"evidence_id": ev.id})
    commit(db)
    return {"evidence_id": ev.id}


@router.delete("/data-rooms/{room_id}/disclosures/{evidence_id}")
def withdraw(room_id: int, evidence_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    room = room_owner(room_id, user, db)
    record = db.scalar(select(RoomDisclosure).where(RoomDisclosure.room_id == room.id, RoomDisclosure.evidence_id == evidence_id))
    if not record:
        api_error(404, "NOT_FOUND", "Disclosure not found")
    db.delete(record)
    audit(db, user, "withdraw", "data_room", entity_id=room.id, project_id=room.project_id, meta={"evidence_id": evidence_id})
    commit(db)
    return {"status": "withdrawn"}


@router.get("/data-rooms/{room_id}")
def room_detail(room_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    room = room_access(room_id, user, db)
    evs = db.scalars(select(Evidence).join(RoomDisclosure, RoomDisclosure.evidence_id == Evidence.id).where(RoomDisclosure.room_id == room.id, Evidence.status == "verified"))
    disclosed = [{"id": e.id, "title": e.title, "doc_type": e.doc_type, "license": e.license, "content_note": e.content_note,
                  "provenance": "VERIFIED", "is_demo": e.is_demo,
                  "files": [file_view(f) for f in db.scalars(select(EvidenceFile).where(EvidenceFile.evidence_id == e.id))]} for e in evs]
    # Guests see their own Q&A only; one guest cannot harvest another guest's questions.
    qs = select(RoomQuestion).where(RoomQuestion.room_id == room.id)
    if room.org_id != user.org_id:
        qs = qs.where(RoomQuestion.asked_by == user.id)
    questions = [{"id": q.id, "question": q.question, "answer": q.answer, "created_at": q.created_at} for q in db.scalars(qs.order_by(RoomQuestion.id))]
    audit(db, user, "view", "data_room", entity_id=room.id, org_id=room.org_id, project_id=room.project_id)
    commit(db)
    return {**room_summary(room, user, db), "project_id": room.project_id if room.org_id == user.org_id else None,
            "evidence": disclosed, "questions": questions}


@router.get("/data-rooms/{room_id}/files/{file_id}")
def room_file(room_id: int, file_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    room = room_access(room_id, user, db)
    f = db.get(EvidenceFile, file_id)
    disclosure = db.scalar(select(RoomDisclosure).where(RoomDisclosure.room_id == room.id, RoomDisclosure.evidence_id == f.evidence_id)) if f else None
    ev = db.get(Evidence, f.evidence_id) if f else None
    if not disclosure or not ev or ev.status != "verified":
        api_error(404, "NOT_FOUND", "File not disclosed")
    audit(db, user, "download", "data_room", entity_id=room.id, project_id=room.project_id, org_id=room.org_id, meta={"file_id": f.id})
    commit(db)
    return file_response(f)


@router.post("/data-rooms/{room_id}/questions", status_code=201)
def ask(room_id: int, payload: QuestionIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    room = room_access(room_id, user, db)
    q = RoomQuestion(room_id=room.id, asked_by=user.id, question=payload.question)
    db.add(q)
    db.flush()
    audit(db, user, "question", "data_room", entity_id=room.id, org_id=room.org_id, project_id=room.project_id, meta={"question_id": q.id})
    commit(db)
    return {"id": q.id, "question": q.question}


@router.patch("/data-rooms/{room_id}/questions/{question_id}")
def answer(room_id: int, question_id: int, payload: AnswerIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    room = room_owner(room_id, user, db)
    if room.status != "open":
        api_error(409, "CONFLICT", "Room is closed")
    q = db.get(RoomQuestion, question_id)
    if not q or q.room_id != room.id:
        api_error(404, "NOT_FOUND", "Question not found")
    if q.answer:
        api_error(409, "CONFLICT", "Answer already recorded")
    q.answer, q.answered_by = payload.answer, user.id
    audit(db, user, "answer", "data_room", entity_id=room.id, project_id=room.project_id, meta={"question_id": q.id})
    commit(db)
    return {"id": q.id, "answer": q.answer}


@router.get("/data-rooms/{room_id}/audit")
def room_audit(room_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    room_owner(room_id, user, db)
    rows = db.scalars(select(AuditLog).where(AuditLog.entity_type == "data_room", AuditLog.entity_id == room_id).order_by(AuditLog.id.desc()).limit(200))
    return [{"id": r.id, "action": r.action, "user_id": r.user_id, "created_at": r.created_at, "meta": r.meta} for r in rows]


@router.get("/nexus/resources")
def nexus_resources(user=Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(NexusResource).where(NexusResource.org_id == user.org_id).order_by(NexusResource.id.desc()))
    return [{"id": r.id, "project_id": r.project_id, "domain": r.domain, "name": r.name, "kind": r.kind,
             "quantity": r.quantity, "unit": r.unit, "source": r.source, "provenance": r.provenance, "is_demo": r.is_demo} for r in rows]


@router.post("/nexus/resources", status_code=201)
def add_resource(payload: ResourceIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    project = get_project_or_404(db, user, payload.project_id)
    record = NexusResource(org_id=user.org_id, is_demo=project.is_demo, **payload.model_dump())
    db.add(record)
    db.flush()
    audit(db, user, "create", "nexus_resource", entity_id=record.id, project_id=project.id)
    commit(db)
    return {"id": record.id}

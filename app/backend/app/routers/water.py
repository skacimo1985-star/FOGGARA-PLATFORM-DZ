"""نطاق المياه (Contract §4) — المرحلة 1.

السلسلة التشغيلية: مصدر (بئر/خزان) → ضخ → توزيع (صمام) → منطقة سقي → تخصيص.
القراءات المائية تُدار عبر خط القياسات/المترولوجيا القائم (القاعدة 1).
كل كيان معزول بـ org_id من هوية المستخدم المصادق عليها (القاعدة 6) —
لا يُقبل أي org_id من العميل إطلاقًا.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import (ALLOCATION_TRANSITIONS, VFD, IrrigationZone, Pump,
                      Reservoir, Site, User, Valve, WaterAllocation, Well)
from ..schemas import (AllocationIn, AllocationOut, AllocationTransitionIn,
                       PumpIn, PumpOut, ReservoirIn, ReservoirOut, ValveIn,
                       ValveOut, VfdIn, VfdOut, WellIn, WellOut, ZoneIn,
                       ZoneOut)

router = APIRouter(prefix="/api/water", tags=["water"])


def _owned(db: Session, model, org_id: int, obj_id: int, what: str):
    """جلب كيان مع التحقق من ملكية المستأجر — 404 عند الغياب أو الانتساب لمؤسسة أخرى."""
    obj = db.get(model, obj_id)
    if obj is None or obj.org_id != org_id:
        api_error(404, "NOT_FOUND", f"{what} not found")
    return obj


def _site(db: Session, org_id: int, site_id: int):
    return _owned(db, Site, org_id, site_id, "Site")


# ---------- Wells (مصدر) ----------
@router.get("/wells", response_model=list[WellOut])
def list_wells(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Well).where(Well.org_id == user.org_id).order_by(Well.id)).scalars().all()


@router.post("/wells", response_model=WellOut, status_code=201)
def create_well(payload: WellIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _site(db, user.org_id, payload.site_id)
    w = Well(org_id=user.org_id, **payload.model_dump())
    db.add(w); db.flush()
    audit(db, user, "create", "well", entity_id=w.id)
    db.commit()
    return w


# ---------- Reservoirs (تخزين) ----------
@router.get("/reservoirs", response_model=list[ReservoirOut])
def list_reservoirs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Reservoir).where(Reservoir.org_id == user.org_id).order_by(Reservoir.id)).scalars().all()


@router.post("/reservoirs", response_model=ReservoirOut, status_code=201)
def create_reservoir(payload: ReservoirIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _site(db, user.org_id, payload.site_id)
    r = Reservoir(org_id=user.org_id, **payload.model_dump())
    db.add(r); db.flush()
    audit(db, user, "create", "reservoir", entity_id=r.id)
    db.commit()
    return r


# ---------- Pumps (ضخ) — مصدر واحد بالضبط: بئر أو خزان ----------
@router.get("/pumps", response_model=list[PumpOut])
def list_pumps(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Pump).where(Pump.org_id == user.org_id).order_by(Pump.id)).scalars().all()


@router.post("/pumps", response_model=PumpOut, status_code=201)
def create_pump(payload: PumpIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if (payload.well_id is None) == (payload.reservoir_id is None):
        api_error(422, "PUMP_SOURCE_REQUIRED", "Pump needs exactly one source: well_id or reservoir_id")
    _site(db, user.org_id, payload.site_id)
    if payload.well_id is not None:
        _owned(db, Well, user.org_id, payload.well_id, "Well")
    if payload.reservoir_id is not None:
        _owned(db, Reservoir, user.org_id, payload.reservoir_id, "Reservoir")
    p = Pump(org_id=user.org_id, **payload.model_dump())
    db.add(p); db.flush()
    audit(db, user, "create", "pump", entity_id=p.id)
    db.commit()
    return p


# ---------- VFDs (مغيّر تردد المضخة) ----------
@router.get("/vfds", response_model=list[VfdOut])
def list_vfds(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(VFD).where(VFD.org_id == user.org_id).order_by(VFD.id)).scalars().all()


@router.post("/vfds", response_model=VfdOut, status_code=201)
def create_vfd(payload: VfdIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _owned(db, Pump, user.org_id, payload.pump_id, "Pump")
    v = VFD(org_id=user.org_id, **payload.model_dump())
    db.add(v); db.flush()
    audit(db, user, "create", "vfd", entity_id=v.id)
    db.commit()
    return v


# ---------- Irrigation Zones (مناطق السقي) ----------
@router.get("/zones", response_model=list[ZoneOut])
def list_zones(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(IrrigationZone).where(IrrigationZone.org_id == user.org_id)
                      .order_by(IrrigationZone.id)).scalars().all()


@router.post("/zones", response_model=ZoneOut, status_code=201)
def create_zone(payload: ZoneIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _site(db, user.org_id, payload.site_id)
    z = IrrigationZone(org_id=user.org_id, **payload.model_dump())
    db.add(z); db.flush()
    audit(db, user, "create", "irrigation_zone", entity_id=z.id)
    db.commit()
    return z


# ---------- Valves (توزيع) ----------
@router.get("/valves", response_model=list[ValveOut])
def list_valves(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Valve).where(Valve.org_id == user.org_id).order_by(Valve.id)).scalars().all()


@router.post("/valves", response_model=ValveOut, status_code=201)
def create_valve(payload: ValveIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _site(db, user.org_id, payload.site_id)
    if payload.zone_id is not None:
        _owned(db, IrrigationZone, user.org_id, payload.zone_id, "IrrigationZone")
    v = Valve(org_id=user.org_id, **payload.model_dump())
    db.add(v); db.flush()
    audit(db, user, "create", "valve", entity_id=v.id)
    db.commit()
    return v


# ---------- Water Allocations (تخصيص — انتقالات حالة من الخادم) ----------
@router.get("/allocations", response_model=list[AllocationOut])
def list_allocations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(WaterAllocation).where(WaterAllocation.org_id == user.org_id)
                      .order_by(WaterAllocation.id)).scalars().all()


@router.post("/allocations", response_model=AllocationOut, status_code=201)
def create_allocation(payload: AllocationIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if (payload.well_id is None) == (payload.reservoir_id is None):
        api_error(422, "ALLOC_SOURCE_REQUIRED", "Allocation needs exactly one source: well_id or reservoir_id")
    if payload.period_end <= payload.period_start:
        api_error(422, "PERIOD_ORDER", "period_end must be after period_start")
    _owned(db, IrrigationZone, user.org_id, payload.zone_id, "IrrigationZone")
    if payload.well_id is not None:
        _owned(db, Well, user.org_id, payload.well_id, "Well")
    if payload.reservoir_id is not None:
        _owned(db, Reservoir, user.org_id, payload.reservoir_id, "Reservoir")
    a = WaterAllocation(org_id=user.org_id, created_by=user.id, **payload.model_dump())
    db.add(a); db.flush()
    audit(db, user, "create", "water_allocation", entity_id=a.id)
    db.commit()
    return a


@router.post("/allocations/{alloc_id}/transition", response_model=AllocationOut)
def transition_allocation(alloc_id: int, payload: AllocationTransitionIn,
                          user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _owned(db, WaterAllocation, user.org_id, alloc_id, "WaterAllocation")
    from_status = a.status
    allowed = ALLOCATION_TRANSITIONS[from_status]
    if payload.to not in allowed:
        api_error(409, "INVALID_STATE_TRANSITION",
                  f"Cannot move allocation from '{from_status}' to '{payload.to}'")
    # الاعتماد والتنفيذ والإلغاء قرارات بشرية مخوَّلة — ليست آلية (القاعدة 5)
    if payload.to in ("approved", "executed", "cancelled") and user.role not in ("reviewer", "admin"):
        api_error(403, "ROLE_FORBIDDEN", "Only reviewer/admin can approve, execute or cancel an allocation")
    a.status = payload.to
    a.decided_by = user.id
    a.decided_at = datetime.now(timezone.utc)
    audit(db, user, f"transition.{payload.to}", "water_allocation", entity_id=a.id,
          meta={"from_status": from_status, "to": payload.to})
    db.commit()
    return a

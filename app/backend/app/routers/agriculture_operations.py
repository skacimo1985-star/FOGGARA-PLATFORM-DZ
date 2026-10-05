"""Organization-isolated agricultural records. Never substitutes inference for evidence."""
from datetime import date, datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user, require_reviewer
from ..models import AgriParcel, AgriObservation, AgriPlan, AgriTask, User
from ..services.agriculture_operations import irrigation_scenario
from ..services.service_delivery import soil_assessment, irrigation_water_assessment

operations_router = APIRouter(prefix='/api/agriculture', tags=['agriculture-operations'])

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)

class ParcelIn(Input):
    name: str = Field(min_length=1, max_length=160)
    crop: str = Field(min_length=1, max_length=80)
    area_ha: float = Field(gt=0, le=100000)
    location: str = Field(min_length=1, max_length=160)
    stage: Literal['initial', 'development', 'mid', 'late'] = 'initial'

class ParcelUpdate(Input):
    stage: Literal['initial', 'development', 'mid', 'late'] | None = None
    archived: bool | None = None

METRICS = {
    'ph': ('pH', 0, 14), 'nitrogen': ('mg/kg', 0, 1000000),
    'phosphorus': ('mg/kg', 0, 1000000), 'potassium': ('mg/kg', 0, 1000000),
    'soc': ('%', 0, 100), 'moisture': ('% VWC', 0, 100),
    'ndvi': ('index', -1, 1), 'lswi': ('index', -1, 1), 'ec': ('dS/m', 0, 100),
}
class ObservationIn(Input):
    parcel_id: int = Field(gt=0)
    metric: Literal['ph','nitrogen','phosphorus','potassium','soc','moisture','ndvi','lswi','ec']
    value: float
    source_type: Literal['lab','sensor','satellite','manual']
    source_ref: str = Field(min_length=3, max_length=300)
    observed_at: AwareDatetime

    @model_validator(mode='after')
    def ranges(self):
        _, lo, hi = METRICS[self.metric]
        if not lo <= self.value <= hi:
            raise ValueError('Observation outside permitted range')
        if self.observed_at > datetime.now(timezone.utc):
            raise ValueError('Observation cannot be in the future')
        # No unsupported NPK/pH inference is admitted as a laboratory measurement.
        if self.source_type == 'satellite' and self.metric not in ('ndvi', 'lswi', 'moisture'):
            raise ValueError('Satellite soil chemistry requires a separately validated model')
        return self

class PlanIn(Input):
    parcel_id: int = Field(gt=0)
    eto_mm_day: float = Field(ge=0, le=30)
    kc: float = Field(ge=0, le=2)
    effective_rain_mm: float = Field(ge=0, le=2000)
    efficiency: float = Field(gt=0, le=1)
    days: int = Field(ge=1, le=30)
    input_source: str = Field(min_length=3, max_length=300)

class TaskIn(Input):
    parcel_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=200)
    due_date: date

class TaskUpdate(Input):
    completed: bool


def own(db, cls, identity, user):
    row = db.scalar(select(cls).where(cls.id == identity, cls.org_id == user.org_id))
    if row is None:
        api_error(404, 'NOT_FOUND', 'Record not found')
    return row


def out(row):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}


def record(db, user, row, action='create'):
    db.add(row)
    db.flush()
    audit(db, user, action, row.__tablename__, entity_id=row.id)
    db.commit()
    return out(row)


@operations_router.get('/parcels')
def parcels(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [out(p) for p in db.scalars(select(AgriParcel).where(AgriParcel.org_id == user.org_id).order_by(AgriParcel.id.desc()).limit(500))]

@operations_router.post('/parcels', status_code=201)
def create_parcel(payload: ParcelIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return record(db, user, AgriParcel(org_id=user.org_id, created_by=user.id, **payload.model_dump()))

@operations_router.patch('/parcels/{identity}')
def update_parcel(identity: int, payload: ParcelUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = own(db, AgriParcel, identity, user)
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(row, k, v)
    return record(db, user, row, 'update')

@operations_router.get('/observations')
def observations(parcel_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(AgriObservation).where(AgriObservation.org_id == user.org_id)
    if parcel_id is not None:
        own(db, AgriParcel, parcel_id, user)
        q = q.where(AgriObservation.parcel_id == parcel_id)
    return [out(o) for o in db.scalars(q.order_by(AgriObservation.observed_at.desc()).limit(1000))]

@operations_router.post('/observations', status_code=201)
def create_observation(payload: ObservationIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    own(db, AgriParcel, payload.parcel_id, user)
    return record(db, user, AgriObservation(org_id=user.org_id, created_by=user.id,
        unit=METRICS[payload.metric][0], evidence_status='INFERRED' if payload.source_type == 'satellite' else 'OBSERVED', **payload.model_dump()))

@operations_router.post('/observations/{identity}/verify')
def verify_observation(identity: int, user: User = Depends(require_reviewer), db: Session = Depends(get_db)):
    row = own(db, AgriObservation, identity, user)
    if row.source_type == 'satellite':
        api_error(409, 'INFERENCE_NOT_MEASUREMENT', 'Satellite estimates remain inferred')
    if row.created_by == user.id:
        api_error(409, 'INDEPENDENT_REVIEW_REQUIRED', 'A different reviewer must verify the record')
    if row.verified_by is not None:
        api_error(409, 'ALREADY_VERIFIED', 'Record already verified')
    row.evidence_status, row.verified_by = 'VERIFIED', user.id
    row.verified_at = datetime.now(timezone.utc)
    return record(db, user, row, 'verify')

@operations_router.get('/parcels/{identity}/service-summary')
def service_summary(identity: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    parcel = own(db, AgriParcel, identity, user)
    observations = list(db.scalars(select(AgriObservation).where(
        AgriObservation.org_id == user.org_id,
        AgriObservation.parcel_id == parcel.id,
    ).order_by(AgriObservation.observed_at.desc()).limit(1000)))
    soil = soil_assessment(observations)
    water = irrigation_water_assessment({row.metric: row.value for row in observations if row.metric in ('ph', 'ec')})
    latest = {}
    for row in observations:
        if row.metric not in latest:
            latest[row.metric] = {
                'value': float(row.value), 'unit': row.unit, 'source_type': row.source_type,
                'source_ref': row.source_ref, 'observed_at': row.observed_at,
                'evidence_status': row.evidence_status,
            }
    return {
        'parcel': out(parcel),
        'latest_observations': latest,
        'soil_assessment': soil,
        'irrigation_water_assessment': water,
        'available_services': {
            'soil_screening': bool(soil['coverage']),
            'irrigation_water_screening': bool(water['coverage']),
            'irrigation_planning': True,
            'vegetation_monitoring': 'ndvi' in latest or 'lswi' in latest,
            'satellite_live': False,
            'weather_live': False,
        },
        'provenance': 'RECORDED_AND_COMPUTED',
    }

@operations_router.get('/plans')
def plans(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [out(p) for p in db.scalars(select(AgriPlan).where(AgriPlan.org_id == user.org_id).order_by(AgriPlan.id.desc()).limit(500))]

@operations_router.post('/plans', status_code=201)
def create_plan(payload: PlanIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    parcel = own(db, AgriParcel, payload.parcel_id, user)
    if parcel.archived:
        api_error(409, 'PARCEL_ARCHIVED', 'Parcel is archived')
    inputs = payload.model_dump()
    inputs['area_ha'] = float(parcel.area_ha)
    result = irrigation_scenario(float(parcel.area_ha), payload.eto_mm_day, payload.kc,
                                 payload.effective_rain_mm, payload.efficiency, payload.days)
    return record(db, user, AgriPlan(org_id=user.org_id, parcel_id=parcel.id, inputs=inputs,
                                   result=result, created_by=user.id))

@operations_router.get('/tasks')
def tasks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [out(t) for t in db.scalars(select(AgriTask).where(AgriTask.org_id == user.org_id).order_by(AgriTask.due_date).limit(1000))]

@operations_router.post('/tasks', status_code=201)
def create_task(payload: TaskIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    own(db, AgriParcel, payload.parcel_id, user)
    return record(db, user, AgriTask(org_id=user.org_id, created_by=user.id, parcel_id=payload.parcel_id,
                                   title=payload.title, due_date=payload.due_date.isoformat()))

@operations_router.patch('/tasks/{identity}')
def update_task(identity: int, payload: TaskUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = own(db, AgriTask, identity, user)
    row.completed = payload.completed
    return record(db, user, row, 'complete' if payload.completed else 'reopen')

"""Organization-isolated agricultural records. Never substitutes inference for evidence."""
from datetime import date, datetime, timezone
import json
from typing import Literal
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .. import config
from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user, require_reviewer
from ..models import AgriParcel, AgriObservation, AgriPlan, AgriTask, Evidence, Measurement, Project, Site, User
from ..services.agriculture_operations import irrigation_scenario
from ..services.parcel_geometry import ParcelGeometryError, normalize_parcel_boundary
from ..services.service_delivery import irrigation_water_assessment, soil_assessment, soil_assessment_values

operations_router = APIRouter(prefix='/api/agriculture', tags=['agriculture-operations'])

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)

class ParcelIn(Input):
    name: str = Field(min_length=1, max_length=160)
    crop: str = Field(min_length=1, max_length=80)
    area_ha: float = Field(gt=0, le=100000)
    location: str = Field(min_length=1, max_length=160)
    site_id: int | None = Field(default=None, gt=0)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    boundary_geojson: dict | None = None
    stage: Literal['initial', 'development', 'mid', 'late'] = 'initial'

    @model_validator(mode='after')
    def geometry(self):
        if self.boundary_geojson is not None:
            try:
                normalized, meta = normalize_parcel_boundary(self.boundary_geojson)
            except ParcelGeometryError as exc:
                raise ValueError(str(exc)) from exc
            self.boundary_geojson = normalized
            self.lon, self.lat = meta['centroid']
            self.area_ha = meta['estimated_area_ha']
        elif (self.lat is None) != (self.lon is None):
            raise ValueError('Latitude and longitude must be supplied together')
        return self

class ParcelUpdate(Input):
    stage: Literal['initial', 'development', 'mid', 'late'] | None = None
    archived: bool | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    boundary_geojson: dict | None = None

    @model_validator(mode='after')
    def geometry(self):
        if 'boundary_geojson' in self.model_fields_set and self.boundary_geojson is not None:
            try:
                normalized, meta = normalize_parcel_boundary(self.boundary_geojson)
            except ParcelGeometryError as exc:
                raise ValueError(str(exc)) from exc
            self.boundary_geojson = normalized
            self.lon, self.lat = meta['centroid']
        elif ('lat' in self.model_fields_set) != ('lon' in self.model_fields_set):
            raise ValueError('Latitude and longitude must be provided together')
        return self

METRICS = {
    'ph': ('pH', 0, 14), 'nitrogen': ('mg/kg', 0, 1000000),
    'phosphorus': ('mg/kg', 0, 1000000), 'potassium': ('mg/kg', 0, 1000000),
    'soc': ('%', 0, 100), 'moisture': ('% VWC', 0, 100),
    'ndvi': ('index', -1, 1), 'evi': ('index', -2, 2), 'savi': ('index', -1.5, 1.5),
    'ndwi': ('index', -1, 1), 'lswi': ('index', -1, 1), 'ec': ('dS/m', 0, 100),
}
class ObservationIn(Input):
    parcel_id: int = Field(gt=0)
    metric: Literal['ph','nitrogen','phosphorus','potassium','soc','moisture','ndvi','evi','savi','ndwi','lswi','ec']
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
        if self.source_type == 'satellite' and self.metric not in ('ndvi', 'evi', 'savi', 'ndwi', 'lswi', 'moisture'):
            raise ValueError('Satellite soil chemistry requires a separately validated model')
        return self

class RemoteSensingIn(Input):
    provider: str = Field(min_length=2, max_length=40, pattern=r'^[A-Za-z0-9][A-Za-z0-9_-]*$')
    scene_id: str = Field(min_length=3, max_length=120)
    acquired_at: AwareDatetime
    ndvi: float | None = Field(default=None, ge=-1, le=1)
    lswi: float | None = Field(default=None, ge=-1, le=1)
    moisture: float | None = Field(default=None, ge=0, le=100)
    cloud_cover_pct: float | None = Field(default=None, ge=0, le=100)
    confidence: float | None = Field(default=None, ge=0, le=1)
    source_uri: str | None = Field(default=None, min_length=3, max_length=500)

    @model_validator(mode='after')
    def validate_scene(self):
        if self.acquired_at > datetime.now(timezone.utc):
            raise ValueError('Satellite acquisition cannot be in the future')
        if self.ndvi is None and self.lswi is None and self.moisture is None:
            raise ValueError('At least one satellite-derived metric is required')
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

class ServiceEvidenceIn(Input):
    project_id: int = Field(gt=0)



SOIL_MEASUREMENT_PARAMETER_MAP = {
    "ph": "ph",
    "soil_ec": "ec",
    "soil_moisture": "moisture",
    "soil_temperature": "temperature",
    "soil_nitrogen": "nitrogen",
    "soil_phosphorus": "phosphorus",
    "soil_potassium": "potassium",
    "soil_soc": "soc",
    "soil_organic_matter": "organic_matter",
}


def verified_soil_assessment(db: Session, user: User, parcel: AgriParcel):
    rows = list(db.scalars(select(Measurement).where(
        Measurement.org_id == user.org_id,
        Measurement.parcel_id == parcel.id,
        Measurement.parameter.in_(tuple(SOIL_MEASUREMENT_PARAMETER_MAP)),
        Measurement.quality_status == "validated",
        Measurement.verification_status == "verified",
    ).order_by(Measurement.measured_at.desc(), Measurement.id.desc()).limit(300)))
    latest = {}
    ids = []
    sources = []
    for row in rows:
        metric = SOIL_MEASUREMENT_PARAMETER_MAP[row.parameter]
        if metric in latest:
            continue
        latest[metric] = float(row.value)
        ids.append(row.id)
        sources.append({
            "measurement_id": row.id,
            "parameter": row.parameter,
            "metric": metric,
            "source": row.source,
            "method": row.method,
            "measured_at": row.measured_at.isoformat(),
        })
    if not latest:
        return {
            "service": "soil_screening",
            "evidence_status": "MISSING",
            "decision_status": "UNAVAILABLE",
            "inputs": {},
            "findings": [],
            "actions": [],
            "coverage": [],
            "measurement_ids": [],
            "measurement_sources": [],
            "limitations": ["VERIFIED_PARCEL_SOIL_MEASUREMENTS_REQUIRED"],
        }
    result = soil_assessment_values(
        latest, evidence_status="COMPUTED_FROM_VERIFIED_MEASUREMENTS"
    )
    result["measurement_ids"] = ids
    result["measurement_sources"] = sources
    return result


def verified_water_assessment(db: Session, user: User, project: Project | None):
    if project is None or project.resource_id is None:
        return {'service': 'irrigation_water_screening', 'evidence_status': 'MISSING', 'decision_status': 'UNAVAILABLE',
                'inputs': {}, 'findings': [], 'actions': [], 'coverage': [],
                'measurement_ids': [], 'measurement_sources': [], 'resource_id': None,
                'limitations': ['PROJECT_WATER_RESOURCE_REQUIRED', 'VERIFIED_WATER_MEASUREMENTS_REQUIRED']}
    rows = list(db.scalars(select(Measurement).where(
        Measurement.org_id == user.org_id,
        Measurement.project_id == project.id,
        Measurement.resource_id == project.resource_id,
        Measurement.parameter.in_(('ph', 'ec', 'tds', 'salinity', 'sar', 'sodium', 'calcium', 'magnesium', 'chloride', 'bicarbonate', 'temperature', 'turbidity', 'dissolved_oxygen')),
        Measurement.quality_status == 'validated',
        Measurement.verification_status == 'verified',
    ).order_by(Measurement.measured_at.desc(), Measurement.id.desc()).limit(100)))
    latest = {}
    units = {}
    ids = []
    sources = []
    for row in rows:
        if row.parameter not in latest:
            latest[row.parameter] = float(row.value)
            units[row.parameter] = row.unit
            ids.append(row.id)
            sources.append({'measurement_id': row.id, 'parameter': row.parameter, 'source': row.source, 'method': row.method})
    if not latest:
        return {'service': 'irrigation_water_screening', 'evidence_status': 'MISSING', 'decision_status': 'UNAVAILABLE',
                'inputs': {}, 'findings': [], 'actions': [], 'coverage': [],
                'measurement_ids': [], 'measurement_sources': [], 'resource_id': project.resource_id,
                'limitations': ['VERIFIED_WATER_MEASUREMENTS_REQUIRED']}
    result = irrigation_water_assessment(latest, units=units)
    result['evidence_status'] = 'COMPUTED_FROM_VERIFIED_MEASUREMENTS'
    result['measurement_ids'] = ids
    result['measurement_sources'] = sources
    result['measurement_units'] = units
    result['resource_id'] = project.resource_id
    return result


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
    if payload.site_id is not None:
        site = db.scalar(select(Site).where(Site.id == payload.site_id, Site.org_id == user.org_id))
        if site is None:
            api_error(404, 'NOT_FOUND', 'Site not found')
    return record(db, user, AgriParcel(org_id=user.org_id, created_by=user.id, **payload.model_dump()))

@operations_router.patch('/parcels/{identity}')
def update_parcel(identity: int, payload: ParcelUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = own(db, AgriParcel, identity, user)
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(row, k, v)
    if 'boundary_geojson' in payload.model_fields_set:
        meta = None
        if row.boundary_geojson is not None:
            _normalized, meta = normalize_parcel_boundary(row.boundary_geojson)
            row.area_ha = meta['estimated_area_ha']
        audit(db, user, 'boundary_update', 'agri_parcels', entity_id=row.id,
              meta={'has_boundary': row.boundary_geojson is not None, 'geometry': meta})
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

@operations_router.post('/parcels/{identity}/remote-sensing/ingest', status_code=201)
def ingest_remote_sensing(identity: int, payload: RemoteSensingIn,
                          user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    parcel = own(db, AgriParcel, identity, user)
    if parcel.archived:
        api_error(409, 'PARCEL_ARCHIVED', 'Parcel is archived')

    source_ref = f'{payload.provider}:{payload.scene_id}'
    values = {'ndvi': payload.ndvi, 'lswi': payload.lswi, 'moisture': payload.moisture}
    created = []
    skipped = []
    for metric, value in values.items():
        if value is None:
            continue
        existing = db.scalar(select(AgriObservation).where(
            AgriObservation.org_id == user.org_id,
            AgriObservation.parcel_id == parcel.id,
            AgriObservation.metric == metric,
            AgriObservation.source_type == 'satellite',
            AgriObservation.source_ref == source_ref,
        ))
        if existing is not None:
            skipped.append(metric)
            continue
        row = AgriObservation(
            org_id=user.org_id,
            parcel_id=parcel.id,
            metric=metric,
            value=value,
            unit=METRICS[metric][0],
            source_type='satellite',
            source_ref=source_ref,
            observed_at=payload.acquired_at,
            evidence_status='INFERRED',
            created_by=user.id,
        )
        db.add(row)
        db.flush()
        audit(db, user, 'remote_sensing_ingest', 'agri_observations', entity_id=row.id,
              meta={
                  'parcel_id': parcel.id,
                  'provider': payload.provider,
                  'scene_id': payload.scene_id,
                  'metric': metric,
                  'cloud_cover_pct': payload.cloud_cover_pct,
                  'confidence': payload.confidence,
                  'source_uri': payload.source_uri,
                  'evidence_status': 'INFERRED',
              })
        created.append(out(row))
    db.commit()
    return {
        'parcel_id': parcel.id,
        'provider': payload.provider,
        'scene_id': payload.scene_id,
        'acquired_at': payload.acquired_at,
        'created': created,
        'skipped_metrics': skipped,
        'provenance': 'INFERRED',
        'live_provider_connected': False,
    }


@operations_router.get('/parcels/{identity}/remote-sensing')
def remote_sensing_history(
    identity: int,
    metric: str | None = Query(default=None, pattern='^(ndvi|lswi|moisture)$'),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parcel = own(db, AgriParcel, identity, user)
    q = select(AgriObservation).where(
        AgriObservation.org_id == user.org_id,
        AgriObservation.parcel_id == parcel.id,
        AgriObservation.source_type == 'satellite',
    )
    if metric is not None:
        q = q.where(AgriObservation.metric == metric)
    rows = list(db.scalars(
        q.order_by(AgriObservation.observed_at.desc(), AgriObservation.id.desc()).limit(1000)
    ))
    return {
        'parcel_id': parcel.id,
        'supported_metrics': ['ndvi', 'lswi', 'moisture'],
        'observations': [out(row) for row in rows],
        'provenance': 'INFERRED',
        'live_provider_connected': False,
        'adapter_contract': 'provider_neutral',
    }


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
def service_summary(identity: int, project_id: int | None = Query(default=None, gt=0), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    parcel = own(db, AgriParcel, identity, user)
    observations = list(db.scalars(select(AgriObservation).where(
        AgriObservation.org_id == user.org_id,
        AgriObservation.parcel_id == parcel.id,
    ).order_by(AgriObservation.observed_at.desc()).limit(1000)))
    recorded_soil = soil_assessment(observations)
    verified_soil = verified_soil_assessment(db, user, parcel)
    soil = verified_soil if verified_soil["coverage"] else recorded_soil
    soil_provenance = "VERIFIED_MEASUREMENTS" if verified_soil["coverage"] else "AGRICULTURE_OBSERVATIONS"
    project = None
    if project_id is not None:
        project = db.scalar(select(Project).where(Project.id == project_id, Project.org_id == user.org_id))
        if project is None:
            api_error(404, 'NOT_FOUND', 'Project not found')
    water = verified_water_assessment(db, user, project)
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
            'satellite_live': True,
            'weather_live': config.WEATHER_PROVIDER_ENABLED,
        },
        'provenance': 'RECORDED_AND_COMPUTED',
        'soil_provenance': soil_provenance,
    }

@operations_router.post('/parcels/{identity}/service-summary/evidence', status_code=201)
def save_service_summary_evidence(identity: int, payload: ServiceEvidenceIn,
                                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    parcel = own(db, AgriParcel, identity, user)
    project = db.scalar(select(Project).where(Project.id == payload.project_id, Project.org_id == user.org_id))
    if project is None:
        api_error(404, 'NOT_FOUND', 'Project not found')
    observations = list(db.scalars(select(AgriObservation).where(
        AgriObservation.org_id == user.org_id,
        AgriObservation.parcel_id == parcel.id,
    ).order_by(AgriObservation.observed_at.desc()).limit(1000)))
    recorded_soil = soil_assessment(observations)
    verified_soil = verified_soil_assessment(db, user, parcel)
    soil = verified_soil if verified_soil["coverage"] else recorded_soil
    soil_provenance = "VERIFIED_MEASUREMENTS" if verified_soil["coverage"] else "AGRICULTURE_OBSERVATIONS"
    water = verified_water_assessment(db, user, project)
    if not soil['coverage'] and not water['coverage']:
        api_error(409, 'INSUFFICIENT_EVIDENCE', 'Recorded observations are required before saving a service result')
    source_refs = sorted({row.source_ref for row in observations if row.metric in set(soil['coverage'])})
    soil_measurement_ids = soil.get('measurement_ids', [])
    soil_measurement_sources = soil.get('measurement_sources', [])
    water_measurement_ids = water['measurement_ids']
    water_measurement_sources = water['measurement_sources']
    summary = {
        'kind': 'FOGGARA_AGRICULTURE_SERVICE_SUMMARY',
        'parcel_id': parcel.id,
        'parcel_name': parcel.name,
        'provenance': 'RECORDED_AND_COMPUTED',
        'soil_provenance': soil_provenance,
        'source_refs': source_refs if soil_provenance == "AGRICULTURE_OBSERVATIONS" else [],
        'measurement_ids': sorted(set(soil_measurement_ids + water_measurement_ids)),
        'measurement_sources': soil_measurement_sources + water_measurement_sources,
        'soil_measurement_ids': soil_measurement_ids,
        'soil_measurement_sources': soil_measurement_sources,
        'water_measurement_ids': water_measurement_ids,
        'water_measurement_sources': water_measurement_sources,
        'soil_assessment': soil,
        'irrigation_water_assessment': water,
    }
    evidence = Evidence(
        org_id=user.org_id, project_id=project.id,
        title=f'FOGGARA service summary - {parcel.name}',
        doc_type='report', license='FOGGARA internal generated analysis',
        content_note=json.dumps(summary, ensure_ascii=False, sort_keys=True),
        status='submitted', submitted_by=user.id,
    )
    db.add(evidence)
    db.flush()
    audit(db, user, 'create', 'evidence', entity_id=evidence.id, project_id=project.id,
          meta={'source': 'agriculture_service_summary', 'parcel_id': parcel.id})
    db.commit()
    return {'evidence_id': evidence.id, 'status': evidence.status, 'project_id': project.id,
            'parcel_id': parcel.id, 'provenance': 'RECORDED_AND_COMPUTED'}

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

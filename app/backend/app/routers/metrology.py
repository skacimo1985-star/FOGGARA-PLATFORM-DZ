"""Metrology endpoints: instruments, calibrations, certificates, inspections."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import (Asset, Calibration, Certificate, Inspection, Instrument,
                      Site, User)
from ..schemas import (CalibrationIn, CalibrationOut, CertificateIn,
                       CertificateOut, InspectionIn, InspectionOut,
                       InstrumentIn, InstrumentOut)
from ..services.metrology import (instrument_has_active_certificate,
                                  instrument_has_valid_calibration)

router = APIRouter(prefix="/api", tags=["metrology"])


def get_instrument_or_404(db: Session, user: User, instrument_id: int) -> Instrument:
    inst = db.get(Instrument, instrument_id)
    if inst is None or inst.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Instrument not found")
    return inst


# ---------- Instruments ----------
@router.get("/instruments", response_model=list[InstrumentOut])
def list_instruments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Instrument).where(Instrument.org_id == user.org_id)
                      .order_by(Instrument.id)).scalars().all()


@router.post("/instruments", response_model=InstrumentOut, status_code=201)
def create_instrument(payload: InstrumentIn, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    if payload.site_id is not None:
        s = db.get(Site, payload.site_id)
        if s is None or s.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Site not found")
    if payload.asset_id is not None:
        a = db.get(Asset, payload.asset_id)
        if a is None or a.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Asset not found")
    inst = Instrument(org_id=user.org_id, **payload.model_dump())
    db.add(inst)
    db.flush()
    audit(db, user, "create", "instrument", entity_id=inst.id,
          meta={"type": inst.type, "serial_number": inst.serial_number})
    db.commit()
    return inst


@router.get("/instruments/{instrument_id}", response_model=InstrumentOut)
def get_instrument(instrument_id: int, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    return get_instrument_or_404(db, user, instrument_id)


@router.get("/instruments/{instrument_id}/metrology-status")
def instrument_metrology_status(instrument_id: int, user: User = Depends(get_current_user),
                                db: Session = Depends(get_db)):
    inst = get_instrument_or_404(db, user, instrument_id)
    return {
        "instrument_id": inst.id,
        "has_valid_calibration": instrument_has_valid_calibration(db, inst.id),
        "has_active_certificate": instrument_has_active_certificate(db, inst.id),
    }


# ---------- Calibrations ----------
@router.get("/instruments/{instrument_id}/calibrations", response_model=list[CalibrationOut])
def list_calibrations(instrument_id: int, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    get_instrument_or_404(db, user, instrument_id)
    return db.execute(select(Calibration).where(Calibration.instrument_id == instrument_id)
                      .order_by(Calibration.calibrated_on.desc())).scalars().all()


@router.post("/instruments/{instrument_id}/calibrations", response_model=CalibrationOut, status_code=201)
def create_calibration(instrument_id: int, payload: CalibrationIn,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_instrument_or_404(db, user, instrument_id)
    if payload.certificate_id is not None:
        cert = db.get(Certificate, payload.certificate_id)
        if cert is None or cert.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Certificate not found")
    cal = Calibration(org_id=user.org_id, instrument_id=instrument_id, **payload.model_dump())
    db.add(cal)
    db.flush()
    audit(db, user, "create", "calibration", entity_id=cal.id,
          meta={"instrument_id": instrument_id, "result": cal.result, "next_due": cal.next_due.isoformat()})
    db.commit()
    return cal


# ---------- Certificates ----------
@router.get("/certificates", response_model=list[CertificateOut])
def list_certificates(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Certificate).where(Certificate.org_id == user.org_id)
                      .order_by(Certificate.id)).scalars().all()


@router.post("/instruments/{instrument_id}/certificates", response_model=CertificateOut, status_code=201)
def create_certificate(instrument_id: int, payload: CertificateIn,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_instrument_or_404(db, user, instrument_id)
    if payload.valid_to <= payload.valid_from:
        api_error(422, "VALIDATION_ERROR", "valid_to must be after valid_from")
    cert = Certificate(org_id=user.org_id, instrument_id=instrument_id, **payload.model_dump())
    db.add(cert)
    db.flush()
    audit(db, user, "create", "certificate", entity_id=cert.id,
          meta={"instrument_id": instrument_id, "number": cert.number, "status": cert.status})
    db.commit()
    return cert


@router.get("/certificates/{certificate_id}", response_model=CertificateOut)
def get_certificate(certificate_id: int, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    cert = db.get(Certificate, certificate_id)
    if cert is None or cert.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Certificate not found")
    return cert


# ---------- Inspections ----------
@router.get("/inspections", response_model=list[InspectionOut])
def list_inspections(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Inspection).where(Inspection.org_id == user.org_id)
                      .order_by(Inspection.id.desc())).scalars().all()


@router.post("/inspections", response_model=InspectionOut, status_code=201)
def create_inspection(payload: InspectionIn, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    if payload.instrument_id is None and payload.asset_id is None:
        api_error(422, "VALIDATION_ERROR", "Inspection must target an instrument or an asset")
    if payload.instrument_id is not None:
        get_instrument_or_404(db, user, payload.instrument_id)
    if payload.asset_id is not None:
        a = db.get(Asset, payload.asset_id)
        if a is None or a.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Asset not found")
    insp = Inspection(org_id=user.org_id, **payload.model_dump())
    db.add(insp)
    db.flush()
    audit(db, user, "create", "inspection", entity_id=insp.id,
          meta={"instrument_id": insp.instrument_id, "asset_id": insp.asset_id, "result": insp.result})
    db.commit()
    return insp

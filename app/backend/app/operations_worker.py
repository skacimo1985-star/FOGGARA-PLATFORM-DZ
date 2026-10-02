"""Run after migrations: python -m app.operations_worker [--once].

PostgreSQL workers use SKIP LOCKED; job and outputs commit atomically. Process
death rolls back the transaction, keeping the pending job available for retry.
--once drains up to 100 pending jobs and exits nonzero if a job failed.
"""
import argparse
import logging
import signal
import time
from datetime import datetime, timezone
from sqlalchemy import select
from .db import SessionLocal
from .audit import audit
from .operations_models import MatrixJob, MatrixPolicy, MatrixObservation
from .operations_engine import lock_org, enqueue, evaluate, match_listings

log = logging.getLogger("foggara.worker")
running = True

def process_one():
    with SessionLocal() as db:
        job = db.execute(select(MatrixJob).where(MatrixJob.status == "pending")
                         .order_by(MatrixJob.id).with_for_update(skip_locked=True).limit(1)).scalar_one_or_none()
        if job is None:
            return None
        job.attempts += 1
        try:
            # Nested transaction isolates job output failures; job retry state still persists.
            with db.begin_nested():
                lock_org(db, job.org_id)
                if job.kind == "wefeh":
                    row = evaluate(db, job.org_id, job.project_id)
                    if row is None:
                        raise ValueError("POLICY_REQUIRED")
                elif job.kind == "matching":
                    match_listings(db, job.org_id)
                else:
                    raise ValueError("UNKNOWN_JOB")
                audit(db, None, "job_completed", "matrix_jobs", entity_id=job.id,
                      org_id=job.org_id, project_id=job.project_id, meta={"kind": job.kind})
            job.status, job.error = "completed", None
            job.finished_at = datetime.now(timezone.utc)
        except Exception as exc:
            # Never persist raw database exceptions (may contain personal data or secrets).
            job.error = type(exc).__name__
            job.status = "failed" if job.attempts >= 3 else "pending"
            if job.status == "failed":
                job.finished_at = datetime.now(timezone.utc)
            log.warning("job=%s attempt=%s error=%s", job.id, job.attempts, job.error)
        db.commit()
        return job.status

def refresh():
    # Re-evaluate freshness hourly, including quiet projects with no new readings.
    with SessionLocal() as db:
        orgs = db.scalars(select(MatrixPolicy.org_id).where(MatrixPolicy.active.is_(True))).all()
    for org_id in orgs:
        with SessionLocal() as db:
            lock_org(db, org_id)
            ids = db.scalars(select(MatrixObservation.project_id).where(
                MatrixObservation.org_id == org_id).distinct()).all()
            for project_id in ids:
                enqueue(db, org_id, "wefeh", project_id)
            db.commit()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    def stop(*_):
        global running
        running = False
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    logging.basicConfig(level=logging.INFO)
    last_refresh = 0.0
    failed = False
    processed = 0
    while running:
        if not args.once and time.monotonic() - last_refresh > 3600:
            refresh()
            last_refresh = time.monotonic()
        result = process_one()
        failed = failed or result == "failed"
        if args.once:
            processed += 1
            if result is None or processed >= 100:
                break
        elif result is None:
            time.sleep(2)
    raise SystemExit(1 if failed else 0)

if __name__ == "__main__":
    main()

"""
Demo data seed script — inserts 20 fake quantum jobs for development/testing.
Run from the project root: python scripts/seed_demo_data.py
"""

import random
import string
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from storage.database import QuantumJob, engine, init_db

BACKENDS = ["ibm_fez", "ibm_brisbane", "ibm_kyoto"]
SHOTS_OPTIONS = [1024, 4096]
NUM_QUBITS = 156
NOW = datetime.now(timezone.utc).replace(tzinfo=None)

# Each tuple is (days_ago, hour) — deliberately clustered to create visible
# peaks (4-5 jobs) on some days and quiet days (0-1 jobs) on others.
JOB_SCHEDULE = [
    # Day 0 (today) — quiet
    (0, 14),
    # Day 1 — peak (5 jobs, mid-morning cluster)
    (1, 9), (1, 10), (1, 10), (1, 11), (1, 11),
    # Day 2 — quiet
    (2, 16),
    # Day 3 — peak (4 jobs, afternoon cluster)
    (3, 13), (3, 14), (3, 14), (3, 15),
    # Day 4 — silent (0 jobs)
    # Day 5 — moderate (2 jobs)
    (5, 8), (5, 21),
    # Day 6 — peak (4 jobs, evening cluster)
    (6, 18), (6, 19), (6, 19), (6, 20), (6, 20),
    # Day 7 — quiet (1 job)
    (7, 7),
]


def random_job_id() -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=20))


def make_job(days_ago: int, hour: int) -> QuantumJob:
    base = NOW - timedelta(days=days_ago)
    created_at = base.replace(hour=hour, minute=random.randint(0, 59), second=random.randint(0, 59), microsecond=0)
    return QuantumJob(
        id=random_job_id(),
        backend=random.choice(BACKENDS),
        queue_time=round(random.uniform(30, 7200), 2),
        execution_time=round(random.uniform(2, 60), 2),
        shots=random.choice(SHOTS_OPTIONS),
        created_at=created_at,
        num_qubits=NUM_QUBITS,
        circuit_depth=random.randint(3, 8),
    )


DEMO_JOBS = [make_job(days_ago, hour) for days_ago, hour in JOB_SCHEDULE]


def seed():
    init_db()
    with Session(engine) as session:
        existing_ids = {row[0] for row in session.query(QuantumJob.id).all()}
        new_jobs = [j for j in DEMO_JOBS if j.id not in existing_ids]
        session.add_all(new_jobs)
        session.commit()
        print(f"Inserted {len(new_jobs)} demo job(s). Skipped {len(DEMO_JOBS) - len(new_jobs)} duplicate(s).")


if __name__ == "__main__":
    seed()

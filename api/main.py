from fastapi import FastAPI
from storage.database import QuantumJob, engine
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel
from datetime import datetime
from fastapi import HTTPException
from collector.job_runner import fetch_job, sync_jobs
from fastapi.middleware.cors import CORSMiddleware
from collections import defaultdict

app = FastAPI()

# allow requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic model for response
# It maps the database table columns to the response
# It's the data validation layer

class JobResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    backend: str
    queue_time: float
    execution_time: float
    shots: int
    created_at: datetime
    num_qubits: int | None = None
    circuit_depth: int | None = None

class JobRequest(BaseModel):
    job_id: str

class BackendStats(BaseModel):
    name: str
    total_jobs: int
    avg_queue_time: float
    avg_execution_time: float

class CircuitResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    backend: str
    num_qubits: int | None = None
    circuit_depth: int | None = None
    created_at: datetime

class SyncResponse(BaseModel):
    new: int
    existing: int


# get all jobs
@app.get("/jobs", response_model=list[JobResponse])
def get_jobs():
    session = sessionmaker(bind=engine)()
    jobs = session.query(QuantumJob).all()

    session.close()
    return jobs

# get a job by id
@app.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: str):
    session = sessionmaker(bind=engine)()
    job = session.query(QuantumJob).filter_by(id=job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    session.close()
    return job

# create a job
@app.post("/jobs", response_model=JobResponse)
def create_job(request: JobRequest):
    session = sessionmaker(bind=engine)()
    fetch_job(request.job_id)
    job = session.query(QuantumJob).filter_by(id=request.job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    session.close()
    return job

# backends: aggregated stats per backend
@app.get("/backends", response_model=list[BackendStats])
def get_backends():
    session = sessionmaker(bind=engine)()
    jobs = session.query(QuantumJob).all()
    session.close()
    agg = defaultdict(lambda: {"total": 0, "queue_sum": 0.0, "exec_sum": 0.0})
    for job in jobs:
        b = agg[job.backend]
        b["total"] += 1
        b["queue_sum"] += job.queue_time or 0.0
        b["exec_sum"] += job.execution_time or 0.0
    return [
        BackendStats(
            name=name,
            total_jobs=d["total"],
            avg_queue_time=round(d["queue_sum"] / d["total"], 2),
            avg_execution_time=round(d["exec_sum"] / d["total"], 2),
        )
        for name, d in sorted(agg.items(), key=lambda x: -x[1]["total"])
    ]

# circuits: all jobs with circuit metadata
@app.get("/circuits", response_model=list[CircuitResponse])
def get_circuits():
    session = sessionmaker(bind=engine)()
    jobs = session.query(QuantumJob).all()
    session.close()
    return jobs

# throughput: job counts grouped by hour
@app.get("/metrics/throughput")
def get_throughput():
    session = sessionmaker(bind=engine)()
    jobs = session.query(QuantumJob).all()
    session.close()
    buckets = defaultdict(int)
    for job in jobs:
        if job.created_at:
            hour = job.created_at.replace(minute=0, second=0, microsecond=0)
            buckets[hour] += 1
    return [{"hour": k.isoformat(), "count": v} for k, v in sorted(buckets.items())]

# sync: pull recent jobs from IBM Quantum and store new ones
@app.post("/sync", response_model=SyncResponse)
def sync_ibm():
    try:
        result = sync_jobs()
        return SyncResponse(new=result["new"], existing=result["existing"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# delete a job
@app.delete("/jobs/{job_id}", response_model=JobResponse)
def delete_job(job_id: str):
    session = sessionmaker(bind=engine)()
    job = session.query(QuantumJob).filter_by(id=job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    session.delete(job)
    session.commit()
    result = JobResponse.model_validate(job)
    session.close()
    return result   

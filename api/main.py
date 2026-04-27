from fastapi import FastAPI
from storage.database import QuantumJob, engine
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel
from datetime import datetime
from fastapi import HTTPException
from collector.job_runner import fetch_job
from fastapi.middleware.cors import CORSMiddleware

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
    model_config = {"from_attributes": True} #  allows Pydantic to read data from SQLAlchemy models
    id: str
    backend: str
    queue_time: float
    execution_time: float
    shots: int
    created_at: datetime

class JobRequest(BaseModel):
    job_id: str


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

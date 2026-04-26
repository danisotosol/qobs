import os
import sys
from datetime import datetime
from dotenv import load_dotenv
from qiskit_ibm_runtime import QiskitRuntimeService
from storage.database import init_db, QuantumJob, engine
from sqlalchemy.orm import sessionmaker


# Load environment variables
load_dotenv()

def parse_timestamp(ts: str) -> datetime:
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)

def fetch_job(job_id: str):
    """
    Fetches the job from the IBM Quantum Experience and calculates metrics.
    get the token from the environment variables
    """
    # 1. create a session and query the database for the job id
    session = sessionmaker(bind=engine)()
    # 2. if the job id already exists, close the session and return
    existing_job = session.query(QuantumJob).filter_by(id=job_id).first()
    if existing_job:
        print(f"The job {job_id} already exists in the database. Skipping...")
        session.close()
        return

    # create a session and insert the job data
    
    token = os.getenv("IBM_TOKEN")
    service = QiskitRuntimeService(token=token, channel="ibm_quantum_platform")

    job = service.job(job_id=job_id)
    
    # Extract timestamps from metrics
    metrics = job.metrics()
    timestamps = metrics.get("timestamps", {})
    
    created_str = timestamps.get("created")
    running_str = timestamps.get("running")
    completed_str = timestamps.get("finished") # Often 'completed' in Qiskit metrics
    
    # convert string to datetime
    created = parse_timestamp(created_str)
    running = parse_timestamp(running_str)
    completed = parse_timestamp(completed_str)
    
    # calculate queue and execution time in seconds or 0 if not available
    queue_time = 0
    execution_time = 0
    
    # calculate queue time in seconds or 0 if not available 
    if running and created:
        queue_time = (running - created).total_seconds()
    
    # calculate execution time in seconds or 0 if not available
    if completed and running:
        execution_time = (completed - running).total_seconds()

    # get the shots from the job.inputs in case of error return 0   
    try:
        shots = job.inputs["pubs"][0][2]
    except (KeyError, IndexError, TypeError):
        shots = 0

    # prepare job data to be stored in the database
    job_data = {
        "id": job.job_id(),
        "backend": job.backend().name,
        "queue_time": queue_time,
        "execution_time": execution_time,
        "shots": shots,
        "created_at": created,
    }

    # create a quantum job object, a quantumjob is an object that represents a quantum job in the database
    # with all the data extracted from the job
    job = QuantumJob(**job_data)
    # add the job to the session and commit it to the database
    session.add(job)
    session.commit()
    session.close()

    print(job_data)

# initialize database and fetch job data
try:
    job_id = sys.argv[1]
except (IndexError, TypeError):
    raise SystemExit("Usage: python -m collector.job_runner <job_id>")

init_db()
fetch_job(job_id)





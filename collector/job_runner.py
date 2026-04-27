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

def fetch_job(job_id: str) -> str:
    """
    Fetches the job from IBM Quantum and stores it. Returns 'existing' if the job
    was already in the database (circuit metadata patched), 'new' otherwise.
    """
    session = sessionmaker(bind=engine)()
    existing_job = session.query(QuantumJob).filter_by(id=job_id).first()
    if existing_job:
        token = os.getenv("IBM_TOKEN")
        service = QiskitRuntimeService(token=token, channel="ibm_quantum_platform")
        job = service.job(job_id=job_id)
        try:
            circuit = job.inputs["pubs"][0][0]
            existing_job.num_qubits = circuit.num_qubits
            existing_job.circuit_depth = circuit.depth()
        except (KeyError, IndexError, TypeError, AttributeError):
            pass
        session.commit()
        session.close()
        return "existing"

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

    try:
        shots = job.inputs["pubs"][0][2]
    except (KeyError, IndexError, TypeError):
        shots = 0

    try:
        circuit = job.inputs["pubs"][0][0]
        num_qubits = circuit.num_qubits
        circuit_depth = circuit.depth()
    except (KeyError, IndexError, TypeError, AttributeError):
        num_qubits = None
        circuit_depth = None

    job_data = {
        "id": job.job_id(),
        "backend": job.backend().name,
        "queue_time": queue_time,
        "execution_time": execution_time,
        "shots": shots,
        "created_at": created,
        "num_qubits": num_qubits,
        "circuit_depth": circuit_depth,
    }

    # create a quantum job object, a quantumjob is an object that represents a quantum job in the database
    # with all the data extracted from the job
    job = QuantumJob(**job_data)
    session.add(job)
    session.commit()
    session.close()

    print(job_data)
    return "new"


def sync_jobs(limit: int = 100) -> dict:
    """
    Pulls up to `limit` recent jobs from IBM Quantum and stores any that are new.
    Returns a dict with 'new' and 'existing' counts.
    """
    token = os.getenv("IBM_TOKEN")
    service = QiskitRuntimeService(token=token, channel="ibm_quantum_platform")
    ibm_jobs = service.jobs(limit=limit)
    new_count = 0
    existing_count = 0
    for ibm_job in ibm_jobs:
        result = fetch_job(ibm_job.job_id())
        if result == "new":
            new_count += 1
        else:
            existing_count += 1
    return {"new": new_count, "existing": existing_count}

# initialize database and fetch job data in background
    
if __name__ == "__main__":
    try:
        job_id = sys.argv[1]
    except (IndexError, TypeError):
        raise SystemExit("Usage: python -m collector.job_runner <job_id>")
    
    init_db()
    fetch_job(job_id)


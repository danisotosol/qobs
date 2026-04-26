from storage.database import init_db, QuantumJob, engine
from sqlalchemy.orm import sessionmaker

def list_jobs():
    session = sessionmaker(bind=engine)()
    # order by the creation time in descending order
    jobs = session.query(QuantumJob).order_by(QuantumJob.created_at.desc()).all()
    for job in jobs:
        print(job)
    session.close()

list_jobs()
    
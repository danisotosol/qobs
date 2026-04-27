from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime
from sqlalchemy.orm import declarative_base

# create a base class for all the models
Base = declarative_base()
# create the engine and the database, the engine is like a connection to the database
# the database will be created if it doesn't exist
engine = create_engine("sqlite:///quantum_jobs.db")

class QuantumJob(Base):
    # representation of the job when printed or str() is called
    def __repr__(self):
        return f"Job {self.id} | backend: {self.backend} | queue: {self.queue_time}s | execution: {self.execution_time}s | shots: {self.shots} | created: {self.created_at}"

    __tablename__ = "quantum_jobs"
    # table that stores all the quantum jobs, ex: crv6x9zy7k2000089g0g
    id = Column(String, primary_key=True)
    #ibm job id
    backend = Column(String)
    #queue time in ms
    queue_time = Column(Float)
    #execution time in ms, why float? because sometimes it can be a decimal
    execution_time = Column(Float)
    #total shots
    shots = Column(Integer)
    #job creation time
    created_at = Column(DateTime)
    #circuit metadata (nullable — older jobs won't have these)
    num_qubits = Column(Integer, nullable=True)
    circuit_depth = Column(Integer, nullable=True)

    # initialize database

def init_db():
    Base.metadata.create_all(engine)
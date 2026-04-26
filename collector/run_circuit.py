import os
from dotenv import load_dotenv
from qiskit import QuantumCircuit
from qiskit_ibm_runtime import QiskitRuntimeService
from qiskit_ibm_runtime import SamplerV2 as Sampler
from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager


load_dotenv()
token = os.getenv("IBM_TOKEN")
service = QiskitRuntimeService(token=token, channel="ibm_quantum_platform")

# create a quantum circuit with 1 qubit
qc = QuantumCircuit(1)  # 1 qubit
qc.h(0)                 # Hadamard gate en el qubit 0
qc.measure_all()        # medir todos los qubits

backend = service.least_busy()
# transpile the circuit for the backend, transpilaion is the process of converting the circuit to the backend's native gates
pm = generate_preset_pass_manager(backend=backend, optimization_level=1)
qc_transpiled = pm.run(qc)

# queue the job to a backend and get the job id
sampler = Sampler(backend)
job = sampler.run([qc_transpiled], shots=1024)
print(job.job_id())


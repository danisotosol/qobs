<h1 align="center">
  <img src="assets/logo.svg" width="80" height="80" alt="QOBS" /><br />
  QOBS
  <br />
  <small>Quantum Job Observability System</small>
</h1>

<p align="center">
  <a href="https://www.python.org/downloads/">
    <img src="https://img.shields.io/badge/python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.10+" />
  </a>
  <a href="https://fastapi.tiangolo.com">
    <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  </a>
  <a href="https://react.dev">
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  </a>
  <a href="https://qiskit.org">
    <img src="https://img.shields.io/badge/Qiskit-IBM%20Quantum-6929C4?style=flat-square&logo=ibm&logoColor=white" alt="Qiskit" />
  </a>
  <a href="https://www.docker.com/">
    <img src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="MIT License" />
  </a>
</p>

<p align="center">
  <a href="#why-qobs"><strong>Why</strong></a>
  &middot;
  <a href="#quick-start"><strong>Quick start</strong></a>
  &middot;
  <a href="#features"><strong>Features</strong></a>
  &middot;
  <a href="#architecture"><strong>Architecture</strong></a>
  &middot;
  <a href="#api-reference"><strong>API</strong></a>
  &middot;
  <a href="#roadmap"><strong>Roadmap</strong></a>
</p>

<p align="center">
  Track what IBM Quantum won't — queue times, execution trends, and the submission data to stop guessing and start optimizing.
</p>

<p align="center">
  <img src="assets/dashboard.png" alt="QOBS Dashboard" width="100%" />
</p>

---

## Why QOBS

IBM Quantum's cloud dashboard tells you whether a job completed. It does not tell you:

- How long your job sat in queue before the device touched it
- Whether that backend runs faster on Wednesday nights than Monday mornings
- How execution time drifts as your circuit depth grows

Without that data, every job submission is a guess. QOBS records every metric Qiskit returns and makes the full history searchable — through a local REST API and a live dashboard built for researchers, not cloud product managers.

```python
# After any job completes, one line is all it takes:
requests.post("http://localhost:8000/jobs", json={"job_id": job.job_id()})
```

Or click **Sync with IBM** in the dashboard and QOBS pulls your last 100 jobs automatically.

---

## Quick start

### Docker — recommended, zero setup required

```bash
git clone https://github.com/danisotosol/qobs.git
cd qobs
echo "IBM_TOKEN=your_api_token_here" > .env
docker-compose up --build
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:5173 |
| API + interactive docs | http://localhost:8000/docs |

The SQLite database persists on the host at `./quantum_jobs.db` — data survives container restarts.

### Manual setup

Prefer running without Docker? See the [full manual installation guide](#manual-installation) below.

---

## Features

| Feature | Description |
|---|---|
| **Queue time tracking** | Records the gap between job submission and device pickup for every run — the metric IBM Quantum does not persist or expose historically |
| **Execution time trends** | Tracks QPU runtime separately from queue overhead, so you can distinguish hardware variability from scheduling variability |
| **One-click sync** | "Sync with IBM" on the Overview page pulls your 100 most recent jobs and stores any that are new — no manual job IDs required |
| **Live dashboard** | Metric summary cards with sparklines, an hourly job throughput chart, and a searchable job history table |
| **Backend comparison** | The Backends page aggregates all stored jobs by device and shows total jobs, average queue time, and average execution time per backend |
| **Circuit tracking** | `num_qubits` and `circuit_depth` are captured for every job. Re-posting an existing job ID backfills circuit data without touching other fields |
| **Searchable job table** | Full job history in a sortable table — queue and execution times in human-readable form (`25s`, `3m 12s`, `1h 4m`), job IDs truncated with full ID on hover, inline delete confirmation |
| **REST API** | All job history exposed as JSON — queryable from notebooks, scripts, or CI pipelines without touching the dashboard |
| **Docker support** | `docker-compose up --build` starts the full stack in one command |
| **Local-first** | Everything runs on your machine. One SQLite file. No telemetry, no third-party accounts beyond the IBM credentials you already have |

---

## Architecture

```
qobs/
├── api/
│   └── main.py            # FastAPI — endpoints, CORS, Pydantic response models
├── collector/
│   └── job_runner.py      # Fetches job metrics from IBM Quantum via Qiskit
├── storage/
│   └── database.py        # SQLAlchemy ORM (QuantumJob) + SQLite engine
├── dashboard/             # React 19 + Vite frontend
│   └── src/App.jsx
├── Dockerfile             # Backend container
├── docker-compose.yml     # Full-stack orchestration
└── quantum_jobs.db        # SQLite — created automatically on first run
```

**Data flow:**

```
IBM Quantum
    │  Qiskit IBM Runtime
    ▼
collector/job_runner.py
    │  SQLAlchemy
    ▼
quantum_jobs.db (SQLite)
    │  FastAPI
    ▼
api/main.py  :8000
    │  axios / HTTP
    ▼
dashboard (React)  :5173
```

**Data model — `quantum_jobs` table:**

| Column | Type | Description |
|---|---|---|
| `id` | TEXT | IBM Quantum job ID — primary key |
| `backend` | TEXT | Device name, e.g. `ibm_fez` |
| `queue_time` | REAL | Seconds between submission and execution start |
| `execution_time` | REAL | Seconds the QPU spent running the circuit |
| `shots` | INTEGER | Number of measurement shots |
| `created_at` | DATETIME | Job creation timestamp (UTC) |
| `num_qubits` | INTEGER | Qubits in the submitted circuit (nullable) |
| `circuit_depth` | INTEGER | Transpiled circuit depth (nullable) |

---

## Manual installation

### Requirements

- Python 3.10 or later
- Node.js 18 or later
- An [IBM Quantum](https://quantum.ibm.com) account with an API token

### 1. Clone

```bash
git clone https://github.com/danisotosol/qobs.git
cd qobs
```

### 2. Python environment

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install fastapi uvicorn sqlalchemy qiskit qiskit-ibm-runtime python-dotenv
```

### 3. IBM Quantum credentials

Create a `.env` file in the project root:

```
IBM_TOKEN=your_api_token_here
```

This file is already listed in `.gitignore` — never commit it.

### 4. Start the API

```bash
python -c "from storage.database import init_db; init_db()"
uvicorn api.main:app --reload
```

API → `http://localhost:8000` · Interactive docs → `http://localhost:8000/docs`

### 5. Start the dashboard

```bash
cd dashboard
npm install
npm run dev
```

Dashboard → `http://localhost:5173`

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/jobs` | Return all collected jobs |
| `GET` | `/jobs/{job_id}` | Return a single job by IBM job ID |
| `POST` | `/jobs` | Fetch a job from IBM Quantum and store it |
| `DELETE` | `/jobs/{job_id}` | Delete a job from the database |
| `POST` | `/sync` | Pull the 100 most recent IBM jobs and store any that are new |
| `GET` | `/backends` | Return aggregated stats per backend |
| `GET` | `/circuits` | Return all jobs with circuit metadata |
| `GET` | `/metrics/throughput` | Return hourly job counts for the throughput chart |

**POST `/jobs` — request body:**

```json
{ "job_id": "crv6x9zy7k2000089g0g" }
```

**POST `/sync` — response:**

```json
{ "new": 12, "existing": 88 }
```

**GET `/jobs` — example job object:**

```json
{
  "id": "crv6x9zy7k2000089g0g",
  "backend": "ibm_fez",
  "queue_time": 47.3,
  "execution_time": 2.8,
  "shots": 4096,
  "created_at": "2025-04-26T14:22:01",
  "num_qubits": 127,
  "circuit_depth": 312
}
```

---

## Collecting jobs

### Sync button (recommended)

Open the dashboard Overview page and click **↻ Sync with IBM**. QOBS pulls your 100 most recent IBM Quantum jobs and stores any it hasn't seen before — no job IDs needed.

### After running a circuit

```python
import requests
from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2

service = QiskitRuntimeService()
backend = service.least_busy(operational=True, simulator=False)

job = SamplerV2(backend).run([circuit], shots=1024)
job.wait_for_final_state()

requests.post("http://localhost:8000/jobs", json={"job_id": job.job_id()})
```

Add this at the end of every experiment session and QOBS builds a longitudinal record of your backend's behaviour over time.

### From the command line

```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{"job_id": "your-ibm-job-id"}'
```

### Backfilling circuit metadata

If you collected jobs before circuit tracking was added, re-post any job ID and QOBS will fetch `num_qubits` and `circuit_depth` from IBM and patch the existing record — no other data is changed.

```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{"job_id": "your-existing-job-id"}'
```

---

## Roadmap

- [x] Queue time and execution time collection
- [x] Live dashboard with metric cards and sparklines
- [x] Hourly job throughput chart (real data, not simulated)
- [x] Searchable and deletable job history table
- [x] Backend comparison page
- [x] Circuit metadata tracking (`num_qubits`, `circuit_depth`)
- [x] One-click IBM sync (`POST /sync`)
- [x] Docker support
- [ ] **Job status tracking** — record `queued`, `running`, `completed`, `failed` at collection time; add status filter tabs to the job table
- [ ] **Best time to submit** — aggregate queue time by hour-of-day and day-of-week to surface the consistently fastest submission windows per backend
- [ ] **Fidelity tracking** — pull measurement fidelity from job results and add per-job fidelity bars and a trend card to the dashboard
- [ ] **Scheduled auto-sync** — background scheduler that polls IBM Quantum at a configurable interval, removing the need to trigger sync manually
- [ ] **Multi-provider support** — extend the collector to IonQ and Quantinuum backends using Qiskit-compatible SDKs with the same shared schema and dashboard

---

## Contributing

Bug reports, feature requests, and pull requests are welcome. Open an issue before starting significant work so the approach can be discussed first.

---

## License

MIT

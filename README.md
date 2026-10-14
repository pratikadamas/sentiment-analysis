# Sentiment Pulse — Customer Feedback Intelligence Platform

[![FastAPI](https://img.shields.io/badge/FastAPI-0.143+-009688.svg?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-1.23+-005CED.svg?style=flat&logo=onnx&logoColor=white)](https://onnxruntime.ai/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0+-D71F00.svg?style=flat&logo=sqlalchemy&logoColor=white)](https://www.sqlalchemy.org/)
[![Alembic](https://img.shields.io/badge/Alembic-Migrations-red.svg?style=flat)](https://alembic.sqlalchemy.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-psycopg3-336791.svg?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Render](https://img.shields.io/badge/Deploy-Render-46E3B7.svg?style=flat&logo=render&logoColor=white)](https://render.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Sentiment Pulse** is a production-grade customer feedback intelligence platform built on **FastAPI**, **PostgreSQL / SQLite**, **SQLAlchemy 2.0**, **Alembic**, and **ONNX Runtime (INT8 Quantized Transformer)**. It enables teams to ingest customer reviews via API or bulk CSV, classify sentiment with sub-25ms latency, monitor customer experience trends, and proactively detect churn risks with persistent storage and interactive dashboards.

---

## 🚀 Key Features

* **⚡ Ultra-Fast ONNX Transformer Inference:** Powered by an INT8 dynamically quantized transformer (`sentiment_model.onnx`, 67.4MB) and Hugging Face tokenizer (`tokenizer.json`). Runs on CPU with **sub-25ms latency**, lightweight memory footprint (<90MB RAM), and zero PyTorch production dependencies.
* **💾 Enterprise Database & Schema Migrations:** Multi-dialect SQLAlchemy 2.0 engine supporting local SQLite and managed PostgreSQL on Render via `psycopg` (Psycopg 3). Full schema evolution managed with **Alembic migrations** (no unsafe `create_all()` in production).
* **📋 Persistent Customer Feedback API:** Full CRUD lifecycle for customer feedback records including category tagging, source channel attributes, customer ratings (1–5), and persisted probability score distributions.
* **📊 Business Intelligence & Sentiment Trends:** Server-side SQL aggregations providing volume metrics, sentiment percentages, temporal trends grouped by day, category breakdown, and proactive highlighting of recent negative feedback.
* **📦 Bounded CSV Batch Ingestion & Secure Export:** Upload CSV reviews up to 5,000 rows in bounded streaming chunks with progress tracking (`ImportJob`), encoding autodetection, and **CSV Formula Injection Sanitization** (`=`, `+`, `-`, `@`) on export.
* **🔭 Production Observability & Rate Limiting:** Request correlation IDs (`X-Request-ID`), execution latency metrics (`X-Process-Time`), sliding-window IP rate limiting, structured logging, separated liveness (`/health/live`) and readiness (`/health/ready`) probes.
* **🎨 Modern SaaS Web Dashboard:** Single-page application interface opening directly to feedback analytics, real-time single and batch prediction playgrounds, paginated feedback explorer, and CSV import/export.

---

## 🛠️ Architecture & Tech Stack

```text
├── main.py                         # ASGI entry point, lifespan, CORS, middleware assembly
├── database.py                     # Backward-compatible database facade
├── model.py                        # Core ONNX SentimentAnalyzer singleton engine
├── core/
│   ├── config.py                   # Centralized Pydantic Settings & environment validation
│   ├── logging.py                  # Structured logging & request context formatting
│   ├── middleware.py               # X-Request-ID & X-Process-Time middleware
│   └── security.py                 # Sliding-window IP rate limiting utilities
├── db/
│   ├── session.py                  # SQLAlchemy engine, connection pooling & get_db dependency
│   └── models.py                   # ORM models (Feedback, ImportJob)
├── alembic/                        # Alembic migration environment
│   ├── env.py                      # Dynamic database URL & batch migration configuration
│   └── versions/                   # Versioned migration scripts
├── schemas/                        # Pydantic v2 validation contracts
│   ├── prediction.py               # Inference request & response schemas
│   ├── feedback.py                 # Feedback CRUD, filtering & stats schemas
│   ├── import_job.py               # Import job tracking schemas
│   ├── analytics.py                # Business intelligence & trend schemas
│   └── health.py                   # Health, liveness & readiness schemas
├── services/
│   ├── sentiment_service.py        # Inference lifecycle & latency benchmarking
│   ├── feedback_service.py         # Feedback CRUD, pagination & persistence
│   ├── analytics_service.py        # SQL aggregations & negative feedback tracking
│   └── import_service.py           # Chunked CSV ingestion & formula-safe exports
├── api/
│   └── routes/
│       ├── predictions.py          # /predict, /predict/batch
│       ├── feedback.py             # /feedback, /feedback/{id}, /feedback/stats, /feedback/export
│       ├── imports.py              # /feedback/import, /feedback/import/{job_id}
│       ├── analytics.py            # /feedback/analytics
│       └── health.py               # /health, /health/live, /health/ready
├── templates/                      # Frontend HTML templates
│   └── index.html                  # Main SaaS dashboard shell (Overview, Analyze, Explorer, Analytics, Imports)
├── static/                         # Static assets & modular JavaScript
│   ├── css/
│   │   └── app.css                 # SaaS design tokens, card styles, badges, focus rings, toast animations
│   ├── js/
│   │   ├── api.js                  # Centralized REST API client wrapper
│   │   ├── overview.js             # Overview KPI metrics & recent alert card controller
│   │   ├── analyze.js              # Real-time sentiment prediction & persistence controller
│   │   ├── explorer.js             # Feedback table, pagination, search & detail modal controller
│   │   ├── analytics.js            # Chart.js data visualization & temporal trend controller
│   │   ├── imports.js              # Drag-and-drop CSV batch import & export controller
│   │   └── app.js                  # Shell routing, navigation, modals & toast notification manager
│   └── theme.js                    # Zero-FOUC light/dark theme persistence controller
├── tests/                          # Automated integration, reliability & frontend test suites
├── render.yaml                     # Infrastructure-as-Code deployment blueprint
├── requirements.txt                # Production backend dependencies
└── .env.example                    # Environment configuration template
```

---

## 💻 Local Setup & Installation

### 1. Prerequisites
- Python 3.10+
- SQLite (included) or PostgreSQL 14+

### 2. Clone & Setup Virtual Environment
```bash
git clone https://github.com/ranitadhikari2023/sentiment-pulse-app.git
cd sentiment-pulse-app

# Create and activate virtual environment
python -m venv venv

# Windows (PowerShell):
.\venv\Scripts\Activate.ps1

# Linux / macOS:
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment
```bash
cp .env.example .env
```
*(Optionally adjust `DATABASE_URL` in `.env`)*

### 5. Run Database Migrations
```bash
# Upgrade database to latest revision
alembic upgrade head
```

### 6. Start the Development Server
```bash
uvicorn main:app --reload --port 8000
```
Open **`http://127.0.0.1:8000`** in your browser.  
Interactive OpenAPI documentation is available at **`http://127.0.0.1:8000/docs`**.

---

## 🧪 Testing

The repository includes an automated test suite covering inference accuracy, feedback CRUD, database transactions, batch processing, CSV formula injection protection, health probes, and frontend static asset & template delivery.

```bash
# Run the full test suite with pytest
pytest -v

# Run diagnostic script on hand-written sanity samples and linguistic stress tests
python check_handwritten.py
```

### Frontend Unit Testing & Code Quality

Frontend logic is zero-build browser ES modules. Pure helpers (formatters, batch chunker) and API cold-start resilience are tested using Node.js's built-in test runner (`node --test`), requiring zero test framework dependencies.

```bash
# Run frontend unit tests (Node built-in test runner)
npm test

# Run ESLint across static modules and tests
npm run lint

# Check code formatting with Prettier
npm run format:check

# Auto-format frontend code
npm run format
```

---


## 📚 API Reference

### System & Health Probes
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :---: |
| `GET` | `/health` | Service uptime, model metadata & inference benchmark | None |
| `GET` | `/health/live` | Liveness probe for container orchestrators | None |
| `GET` | `/health/ready` | Readiness probe verifying DB & ONNX availability | None |

### Sentiment Predictions
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :---: |
| `POST` | `/predict` | Real-time sentiment prediction for single string | None |
| `POST` | `/predict/batch` | Batch prediction for up to 50 text items | None |

### Customer Feedback Management
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :---: |
| `POST` | `/feedback` | Submit feedback, analyze sentiment & persist record | None |
| `GET` | `/feedback` | List paginated feedback with filtering & search | None |
| `GET` | `/feedback/{id}` | Retrieve single feedback record | None |
| `DELETE` | `/feedback/{id}` | Delete feedback record | None |
| `GET` | `/feedback/stats` | Aggregate summary statistics | None |
| `GET` | `/feedback/export` | Download CSV export with formula injection protection | None |

### Batch Import & Business Intelligence
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :---: |
| `POST` | `/feedback/import` | Upload CSV feedback file (bounded chunk processing) | None |
| `GET` | `/feedback/import/{id}`| Poll status and progress of import job | None |
| `GET` | `/feedback/analytics` | Retrieve sentiment distributions, daily trends & churn alerts | None |

*(All endpoints are also available with `/api/` prefix for client compatibility)*

---

## 🔒 Security Architecture

1. **CSV Formula Injection:** User-supplied strings starting with `=`, `+`, `-`, `@`, `\t`, or `\r` are sanitized by prepending a single quote (`'`) to protect spreadsheet users.
2. **Rate Limiting:** IP-based sliding window rate limiter protects server endpoints against abuse.
3. **Structured Observability:** Unique correlation IDs (`X-Request-ID`) and duration tracking (`X-Process-Time`) on all incoming requests.
4. **CORS Security:** Configurable via `ALLOWED_ORIGINS` to control browser cross-origin access.
5. **Separated Probes:** Independent liveness and readiness health checks prevent traffic blackholing during cold starts.

---

## ☁️ Render Production Deployment

The project includes an Infrastructure-as-Code blueprint in [`render.yaml`](./render.yaml).

1. Connect your repository to [Render](https://render.com).
2. Render provisions both the **Web Service** and managed **PostgreSQL Database** (`sentiment-pulse-db`).
3. Build command:
   ```bash
   pip install -r requirements.txt && alembic upgrade head
   ```
4. Start command:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1 --proxy-headers --forwarded-allow-ips '*'
   ```
5. Health Check Path: `/health/ready` (ensures traffic is only routed after DB connection and model warmup).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

# Sentiment Pulse

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791.svg?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Render](https://img.shields.io/badge/Deploy-Render-46E3B7.svg?style=flat&logo=render&logoColor=white)](https://render.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Sentiment Pulse** is a production-grade, full-stack Natural Language Processing (NLP) web application that delivers real-time 3-class sentiment classification (**Positive**, **Neutral**, and **Negative**) powered by calibrated machine learning. Engineered with high performance in mind, the system couples sub-5ms inference speeds with enterprise-grade JWT authentication, cloud database persistence, and an interactive modern interface.

---

## 🚀 Key Features

* **⚡ Ultra-Fast ML Inference:** Lightweight Scikit-Learn model pipeline (TF-IDF vectorizer + Calibrated Logistic Regression) achieving sub-5ms latency and low memory footprint (<40MB RAM). Returns predicted class, top confidence score, and full probability distributions.
* **🔐 Secure JWT Authentication:** Complete User Registration, Login, and Logout workflow using JSON Web Tokens (JWT) and Passlib/Bcrypt password hashing with route-level security guards.
* **💾 Cloud Database with Fallback:** Production-ready PostgreSQL storage via SQLAlchemy 2.0 with connection pooling. Automatically falls back to local SQLite (`sentiment.db`) when `DATABASE_URL` is absent, enabling zero-config local development.
* **🎨 Modern Responsive UI:** Polished interface styled with Tailwind CSS, glassmorphism aesthetics, dynamic prediction meters, interactive confidence dials, and recent analysis history.
* **🌓 Persistent Light / Dark Mode:** Custom Vanilla JavaScript theme engine on the main dashboard supporting explicit user toggle, `localStorage` persistence, and OS-level (`prefers-color-scheme`) system preferences with zero Flash of Unstyled Content (FOUC).
* **📦 Batch Inference API:** Dedicated batch processing endpoint capable of analyzing up to 50 text payloads concurrently in a single HTTP request.
* **📖 Automatic Swagger Documentation:** Interactive API exploration and testing available immediately out of the box via OpenAPI and Swagger UI.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend Framework** | [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/) (ASGI server), [Pydantic v2](https://docs.pydantic.dev/) |
| **Machine Learning** | [Scikit-Learn](https://scikit-learn.org/), [Joblib](https://joblib.readthedocs.io/) |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/), [SQLAlchemy 2.0](https://www.sqlalchemy.org/), [Psycopg](https://www.psycopg.org/), [SQLite](https://www.sqlite.org/) |
| **Authentication & Security** | [Python-Jose (JWT)](https://python-jose.readthedocs.io/), [Passlib (Bcrypt)](https://passlib.readthedocs.io/) |
| **Frontend & Styling** | HTML5, Vanilla JavaScript, [Tailwind CSS](https://tailwindcss.com/), Google Fonts (Inter & Plus Jakarta Sans) |
| **Cloud & Deployment** | [Render](https://render.com/) (Web Service + Managed PostgreSQL) |

---

## 📁 Repository Structure

```text
├── main.py                 # FastAPI application, routing, and lifespan handlers
├── auth.py                 # Authentication router, JWT token issuance, and password hashing
├── database.py             # SQLAlchemy configuration, engine pooling, and User model
├── model.py                # SentimentAnalyzer inference engine with Singleton pattern
├── train_model.py          # Dataset preprocessing, model calibration, and serialization
├── sentiment_model.joblib  # Serialized production ML pipeline artifact
├── requirements.txt        # Production dependencies
├── render.yaml             # Infrastructure-as-code blueprint for Render
├── static/
│   └── theme.js            # Light/Dark mode state management and DOM synchronization
├── templates/
│   ├── index.html          # Main sentiment dashboard with Light/Dark theme toggle
│   ├── login.html          # Secure user sign-in page (Dark aesthetic)
│   └── register.html       # User account creation page (Dark aesthetic)
├── test_api.py             # Test suite for FastAPI endpoints & authentication flows
└── test_model.py           # Unit tests for SentimentAnalyzer inference correctness
```

---

## 💻 Local Setup & Installation

Follow these steps to run Sentiment Pulse locally on your machine:

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/sentiment-pulse.git
cd sentiment-pulse
```

### 2. Create and Activate Virtual Environment
```bash
# Create virtual environment
python -m venv venv

# Activate on Windows (PowerShell / CMD):
venv\Scripts\activate

# Activate on macOS / Linux:
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Run the Development Server
```bash
uvicorn main:app --reload
```

The application will start at **`http://127.0.0.1:8000`**.

> **Note on Database Storage:**  
> The application checks for a `DATABASE_URL` environment variable. If none is found, it automatically falls back to an embedded SQLite database (`sentiment.db`) in your root directory and creates the required tables on startup. No manual PostgreSQL configuration is necessary for local development.

---

## 🧪 Running Automated Tests

Run the test suite using Python's built-in `unittest` framework:

```bash
# Test the Machine Learning inference pipeline
python -m unittest test_model.py

# Test the REST API endpoints, JWT authentication, and validation
python -m unittest test_api.py
```

---

## 📚 API Documentation

FastAPI automatically generates interactive, OpenAPI-compliant documentation for all available endpoints. Once the server is running, navigate to:

* **Interactive Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* **Alternative ReDoc UI:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

### Core Endpoints

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/` | Serves main Sentiment Pulse dashboard | Yes (Redirects) |
| `GET` | `/login` | Serves user sign-in interface | No |
| `GET` | `/register` | Serves user registration interface | No |
| `POST` | `/register` | Creates a new user profile | No |
| `POST` | `/login` | Authenticates user & returns JWT bearer token | No |
| `GET` | `/me` | Returns current authenticated user metadata | Yes (JWT) |
| `POST` | `/predict` | Analyzes sentiment for a single text payload | Yes (JWT) |
| `POST` | `/predict/batch` | Analyzes up to 50 text payloads in batch | Yes (JWT) |
| `GET` | `/health` | Healthcheck and model status probe | No |

---

## ☁️ Production Deployment (Render)

The project includes a ready-to-use [`render.yaml`](./render.yaml) specification for streamlined deployment on [Render](https://render.com):

1. Fork or push this repository to your GitHub account.
2. Sign in to **Render** and link your GitHub repository.
3. Select **New +** &rarr; **Blueprint** (or create a **Web Service** manually).
4. Configure environment settings:
   * **Runtime:** `Python 3`
   * **Build Command:** `pip install -r requirements.txt`
   * **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. *(Optional)* Link a managed Render PostgreSQL database — the app automatically maps Render's `postgres://` URL schema to SQLAlchemy's `postgresql+psycopg2://` driver.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

# Sentiment Pulse

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![Scikit-Learn](https://img.shields.io/badge/Scikit--Learn-1.7+-F7931E.svg?style=flat&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791.svg?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Render](https://img.shields.io/badge/Deploy-Render-46E3B7.svg?style=flat&logo=render&logoColor=white)](https://render.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Sentiment Pulse** is a production-grade, full-stack Natural Language Processing (NLP) web application delivering real-time 3-class sentiment classification (**Positive**, **Neutral**, and **Negative**). Trained on a balanced subset of the Yelp Review Full dataset with Scikit-Learn and Platt sigmoid probability calibration, Sentiment Pulse pairs sub-5ms inference speeds with enterprise-grade JWT authentication, cloud database persistence, and an interactive modern interface.

---

## 🚀 Key Features

* **⚡ Calibrated ML Inference (v2.0.0):** Production Scikit-Learn pipeline (`TfidfVectorizer` + `LogisticRegression` wrapped in `CalibratedClassifierCV(method="sigmoid", cv=3)`). Trained on 60,000 Yelp reviews, tuned strictly on validation data, and achieving **75.14% Test Accuracy** and **0.7491 Test Macro-F1** on unseen test data with true, well-calibrated class probabilities.
* **🔐 Secure JWT Authentication:** Complete User Registration, Login, and Logout workflow using JSON Web Tokens (JWT) with Passlib/Bcrypt password hashing and route-level security guards.
* **💾 Cloud Database with Fallback:** Production-ready PostgreSQL storage via SQLAlchemy 2.0 with connection pooling. Automatically falls back to local SQLite (`sentiment.db`) when `DATABASE_URL` is absent.
* **🎨 Modern Responsive UI:** Polished interface styled with Tailwind CSS, glassmorphism aesthetics, dynamic prediction meters, and confidence dials.
* **🌓 Persistent Light / Dark Mode:** Custom Vanilla JavaScript theme engine on the main dashboard supporting explicit user toggle, `localStorage` persistence, and OS-level (`prefers-color-scheme`) system preferences.
* **📦 Batch Inference API:** Dedicated batch processing endpoint capable of analyzing up to 50 text payloads concurrently in a single HTTP request.
* **📊 Model Metrics & Health Monitoring:** `/health` endpoint exposes real-time service uptime alongside trained model version (`2.0.0`), training timestamp, dataset name, and test macro-F1 from `model_metrics.json`.
* **📖 Automatic Swagger Documentation:** Interactive OpenAPI documentation and API sandbox available immediately at `/docs`.

---

## 📈 Model Performance & Metrics (v2.0.0)

| Metric | Value |
| :--- | :--- |
| **Dataset** | Yelp Review Full (Subsampled & Balanced) |
| **Splits** | Train: 60,000 \| Validation: 7,500 \| Test: 15,000 |
| **Selected Hyperparameters** | $C = 1.0$, `ngram_range = (1, 2)`, `sublinear_tf = True` (chosen on Val Macro-F1: 0.7506) |
| **Probability Calibration** | `CalibratedClassifierCV(method="sigmoid", cv=3)` (Platt scaling) |
| **Test Accuracy** | **75.14%** (15,000 unseen test reviews) |
| **Test Macro-F1** | **0.7491** |
| **Per-Class F1 (Test)** | Negative: **0.7969** \| Neutral: **0.6466** \| Positive: **0.8038** |
| **Per-Class Precision (Test)** | Negative: **0.7796** \| Neutral: **0.6784** \| Positive: **0.7868** |
| **Per-Class Recall (Test)** | Negative: **0.8150** \| Neutral: **0.6176** \| Positive: **0.8216** |

The confusion matrix on the unseen test set is saved to [`reports/confusion_matrix.png`](./reports/confusion_matrix.png).

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend Framework** | [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/), [Pydantic v2](https://docs.pydantic.dev/) |
| **Machine Learning** | [Scikit-Learn](https://scikit-learn.org/), [Joblib](https://joblib.readthedocs.io/), [Matplotlib](https://matplotlib.org/) |
| **Data Processing** | [Hugging Face Datasets](https://huggingface.co/docs/datasets), [Pandas](https://pandas.pydata.org/) |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/), [SQLAlchemy 2.0](https://www.sqlalchemy.org/), [Psycopg](https://www.psycopg.org/), [SQLite](https://www.sqlite.org/) |
| **Authentication & Security** | [Python-Jose (JWT)](https://python-jose.readthedocs.io/), [Passlib (Bcrypt)](https://passlib.readthedocs.io/) |
| **Frontend & Styling** | HTML5, Vanilla JavaScript, [Tailwind CSS](https://tailwindcss.com/), Google Fonts |
| **Cloud & Deployment** | [Render](https://render.com/) (Web Service + Managed PostgreSQL) |

---

## 📁 Repository Structure

```text
├── main.py                     # FastAPI application, routing, and /health metadata endpoint
├── auth.py                     # Authentication router, JWT token issuance, and password hashing
├── database.py                 # SQLAlchemy configuration, engine pooling, and User model
├── model.py                    # SentimentAnalyzer inference engine (Singleton pattern)
├── prepare_data.py             # Downloads Yelp dataset and builds train/val/test balanced splits
├── train_model.py              # Hyperparameter tuning, 3-fold calibration, and evaluation pipeline
├── check_handwritten.py        # Diagnostic script reporting on sanity and stress test samples
├── sentiment_model.joblib      # Serialized calibrated model artifact
├── model_metrics.json          # Complete training metadata, hyperparameters, and test metrics
├── requirements.txt            # Production API dependencies
├── requirements-train.txt      # Data preparation and training dependencies
├── render.yaml                 # Infrastructure-as-code blueprint for Render
├── data/                       # Prepared balanced splits (train.csv, val.csv, test.csv)
├── reports/
│   └── confusion_matrix.png    # High-resolution test confusion matrix plot
├── tests/
│   ├── __init__.py
│   └── handwritten_samples.py  # 84 sanity samples and linguistic stress test inputs
├── static/
│   └── theme.js                # Light/Dark mode state management and DOM synchronization
├── templates/
│   ├── index.html              # Main sentiment dashboard
│   ├── login.html              # User sign-in page
│   └── register.html           # User registration page
├── test_api.py                 # Automated integration tests for FastAPI endpoints
└── test_model.py               # Unit tests for SentimentAnalyzer inference correctness
```

---

## 💻 Local Setup & Installation

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
pip install -r requirements-train.txt
```

### 4. Data Preparation & Model Training (Optional if model exists)
To reproduce the dataset splits and retrain the model:
```bash
# Prepare Yelp dataset into balanced splits in data/
python prepare_data.py

# Tune hyperparameters, calibrate model, evaluate on test set, and save artifacts
python train_model.py
```

### 5. Run the Application
```bash
uvicorn main:app --reload
```

The application will start at **`http://127.0.0.1:8000`**.

---

## 🧪 Testing & Diagnostics

### Run Automated Unit and Integration Tests
```bash
# Test the Machine Learning inference pipeline and probability calibration
python -m unittest test_model.py

# Test the secured FastAPI REST endpoints, JWT flows, and health checks
python -m unittest test_api.py
```

### Run Sanity & Stress Tests
```bash
# Diagnostic report on original 84 hand-written samples and linguistic edge cases
python check_handwritten.py
```

---

## 📚 API Endpoints

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/` | Serves main Sentiment Pulse dashboard | Yes (Cookie / Redirect) |
| `GET` | `/login` | Serves user sign-in interface | No |
| `GET` | `/register` | Serves user registration interface | No |
| `POST` | `/register` | Creates a new user profile | No |
| `POST` | `/login` | Authenticates user & sets JWT cookie / token | No |
| `POST` | `/logout` | Clears authentication cookie | No |
| `GET` | `/me` | Returns current authenticated user metadata | Yes (JWT) |
| `POST` | `/predict` | Analyzes sentiment for a single text payload | Yes (JWT / Cookie) |
| `POST` | `/predict/batch` | Analyzes up to 50 text payloads in batch | Yes (JWT / Cookie) |
| `GET` | `/health` | Returns service status and model metadata | No |

---

## ☁️ Production Deployment (Render)

1. Connect your repository to **Render**.
2. Create a new **Web Service** using the repo.
3. Configure settings:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Optionally provision a **PostgreSQL** instance — the application detects `DATABASE_URL` automatically and switches from SQLite to PostgreSQL.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

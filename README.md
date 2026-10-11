# SentimentPulse AI — 3-Class Sentiment Analysis Web App

An end-to-end sentiment classification web application that predicts **Positive**, **Neutral**, and **Negative** sentiments with real-time confidence scores and probability breakdowns. Built with Python, FastAPI, Tailwind CSS, and optimized for Render deployment.

---

## ⚡ Tech Stack

- **Model Engine**: Scikit-Learn (TF-IDF N-grams + Calibrated Logistic Regression) — sub-5ms latency, ultra-lightweight (<40MB RAM footprint).
- **Backend API**: FastAPI (with Uvicorn ASGI server and Pydantic validation).
- **Frontend UI**: Responsive HTML5, Vanilla JavaScript, and Tailwind CSS (via CDN) with dark glassmorphic styling.
- **Deployment**: Render Web Service.

---

## 📁 Project Structure

```text
├── main.py                 # FastAPI application, REST endpoints, and lifespan handler
├── model.py                # SentimentAnalyzer inference engine with singleton pattern
├── train_model.py          # Training and serialization script
├── sentiment_model.joblib  # Serialized model artifact
├── requirements.txt        # Production dependencies
├── render.yaml             # Render infrastructure blueprint
├── templates/
│   └── index.html          # Modern Tailwind CSS frontend UI
├── test_model.py           # Unit tests for the ML classifier
└── test_api.py             # Integration tests for FastAPI endpoints
```

---

## 🚀 Local Development Setup

### 1. Clone & Set Up Virtual Environment
```bash
# Clone your repository
git clone https://github.com/<your-username>/sentiment-analysis-app.git
cd sentiment-analysis-app

# Create and activate virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run Automated Tests
```bash
# Test inference engine
python -m unittest test_model.py

# Test API endpoints
python -m unittest test_api.py
```

### 4. Start the Application
```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
Open your browser at `http://127.0.0.1:8000` to interact with the web interface, or visit `http://127.0.0.1:8000/docs` for the interactive Swagger documentation.

---

## 🌐 Deploying to Render

### Step 1: Push Code to GitHub
```bash
git init
git add .
git commit -m "Initial commit: Sentiment Analysis Web App"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

### Step 2: Create Web Service on Render
1. Log in to [Render](https://render.com).
2. Click **New +** &rarr; **Web Service**.
3. Connect your GitHub repository.
4. Fill in the deployment settings:
   - **Name**: `sentiment-pulse-app` (or any unique name)
   - **Environment**: `Python 3`
   - **Region**: Closest to your target audience (e.g., Oregon, Frankfurt)
   - **Branch**: `main`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
5. Click **Create Web Service**.

Your live URL will be provisioned in minutes: `https://<your-service-name>.onrender.com`!

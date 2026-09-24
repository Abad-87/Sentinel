# Sentinel

<div align="center">

  <img src="https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge&logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-API-009688?style=for-the-badge&logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Vite-Frontend-646CFF?style=for-the-badge&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/ML-ScikitLearn-F7931E?style=for-the-badge&logo=scikit-learn" alt="Scikit-learn" />

  <h3>AI-Powered Fraud Detection & Visual Intelligence Platform</h3>

  <p>
    Sentinel delivers real-time fraud detection with risk scoring, transaction analytics,
    and a clean full-stack interface for financial monitoring teams.
  </p>

</div>

---

## Overview

Sentinel is a full-stack fraud detection application built to identify suspicious online financial activity using a machine learning model, explainable risk classification, and rich analytical visuals. The platform blends automated detection with actionable intelligence for safer transaction monitoring.

It consists of:

- A Python + FastAPI backend for prediction and batch processing
- A React + Vite frontend for interactive monitoring and dashboards
- A trained machine learning pipeline for fraud probability estimation
- Generated chart outputs for operational analysis and reporting

---

## Key Features

- Real-time single-transaction prediction
- Batch upload support for CSV and JSON files
- High / Medium / Low risk classification
- Recommendation engine for flagged transactions
- Anomaly detection signals for suspicious behavior
- Frontend dashboards driven by generated analytics visuals
- Model + preprocessing pipeline persisted for production use

---

## Tech Stack

- Backend: Python, FastAPI
- Machine Learning: scikit-learn, pandas, NumPy
- Frontend: React, Vite
- Data Handling: CSV/JSON ingestion and preprocessing
- Visualization: Matplotlib-based chart generation
- Deployment: Docker-ready backend and Vercel-ready frontend

---

## Repository Structure

```text
Sentinel/
├── backend/
│   ├── main.py
│   ├── Fraud_Analysis.py
│   ├── Fraud_Detection.ipynb
│   ├── Model.pkl
│   ├── Preprocessor.pkl
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   ├── serve.js
│   └── README.md
├── Data/
├── Outputs/
├── main.py
├── .gitignore
├── README.md
└── .github/
```

---

## How It Works

1. A transaction is submitted either manually or through a batch file.
2. The backend validates and preprocesses the incoming data.
3. A trained model predicts the probability of fraud.
4. The result is categorized into risk levels:
   - High Risk: >= 70%
   - Medium Risk: 40% - 69.99%
   - Low Risk: < 40%
5. The API returns recommendations and anomaly flags for investigation.
6. Visual analytics are generated and surfaced through the app.

---

## API Endpoints

The backend exposes the following main routes:

- `GET /` or `GET /health`
  - Service health check

- `POST /predict`
  - Predict fraud probability for a single transaction

- `POST /analyze/upload`
  - Process a CSV or JSON file with multiple transactions

- `GET /analytics/visuals`
  - Fetch analytics metadata and generated visual paths

- `POST /analytics/regenerate-from-data`
  - Regenerate chart output from uploaded transaction data

---

## Example Prediction Payload

```json
{
  "step": 10,
  "Type": "TRANSFER",
  "Amount": 50000,
  "OldbalanceOrg": 100000,
  "NewbalanceOrig": 20000,
  "NewbalanceDest": 0
}
```

Example response:

```json
{
  "Prediction": "High Risk",
  "Fraud_probability": 89.43,
  "Recommendation_Actions to be taken": [
    "Review destination account activity.",
    "Transaction occurred during late-night hours. Apply enhanced transaction verification.",
    "Perform additional verification for this high-risk transaction type."
  ]
}
```

---

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:

```text
http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will run at:

```text
http://localhost:5173
```

---

## Deployment Notes

- The backend is designed to run with Uvicorn and is compatible with Docker-based deployment.
- The frontend is built for Vite and is suitable for Vercel or similar hosting platforms.
- Visual outputs are exposed through the backend static route, making them available to the frontend dashboards.

---

## Why Sentinel?

Sentinel is built for teams that need a practical, fast, and visual fraud-monitoring solution. It provides the combination of:

- machine learning-based detection
- operational recommendations for analysts
- insight-rich transaction dashboards
- lightweight deployment for real-world monitoring workflows

---

## Project Status

The repository includes a working fraud detection model, backend API, frontend interface, and analytics layer, making it a functional full-stack intelligence project for transaction risk monitoring.

---

## License

This project does not currently include a license file. If you plan to distribute or publish it publicly, consider adding an open-source license such as MIT or Apache 2.0.

---

## Contributors

Built as a full-stack fraud detection and analytics project focused on online transaction risk intelligence.

---

<p align="center">
  <b>Sentinel</b> — detecting risk before it becomes a loss.
</p>

import os
import sys
import io
import json
import pickle
import time
from datetime import datetime
from typing import Literal, Annotated, List, Optional
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, computed_field

# Compatibility shim for scikit-learn unpickling across versions
try:
    import sklearn.compose._column_transformer as ct
    if not hasattr(ct, '_RemainderColsList'):
        class _RemainderColsList(list):
            pass
        ct._RemainderColsList = _RemainderColsList
except Exception:
    pass

# Base directory resolution
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if os.path.basename(BASE_DIR).lower() == 'backend':
    ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, '..'))
else:
    ROOT_DIR = BASE_DIR

# Check if running in Vercel or AWS Lambda serverless environment
IS_VERCEL = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
if IS_VERCEL:
    OUTPUTS_DIR = os.path.join("/tmp", "Outputs")
    FRONTEND_OUTPUTS_DIR = os.path.join("/tmp", "frontend_outputs")
else:
    OUTPUTS_DIR = os.path.join(ROOT_DIR, 'Outputs')
    FRONTEND_OUTPUTS_DIR = os.path.join(ROOT_DIR, 'frontend', 'public', 'outputs')

# Ensure ROOT_DIR and BASE_DIR are in sys.path for clean imports
for p in [ROOT_DIR, BASE_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

# Dedicated Analytics & Chart Module
from Fraud_Analysis import (
    analyze_online_fraud,
    analyze_synthetic_fraud,
    generate_online_fraud_charts,
    generate_credit_card_charts,
    get_transaction_summary,
    get_merchant_category_analytics,
    get_credit_card_analytics
)

# Relational SQL Database Layer
try:
    import database
except ImportError:
    from backend import database

database.init_db()

# Resolve model and preprocessor file paths
def find_file(filename: str) -> str:
    candidates = [
        os.path.join(BASE_DIR, filename),
        os.path.join(ROOT_DIR, 'backend', filename),
        os.path.join(ROOT_DIR, filename),
        os.path.join(os.getcwd(), filename),
        os.path.join(os.getcwd(), 'backend', filename),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]

MODEL_PATH = find_file('Model.pkl')
PREPROCESSOR_PATH = find_file('Preprocessor.pkl')

with open(MODEL_PATH, 'rb') as f:
    model = pickle.load(f)

with open(PREPROCESSOR_PATH, 'rb') as file:
    preprocessor = pickle.load(file)

scaler = preprocessor.named_transformers_['scaler']
ohe = preprocessor.named_transformers_['OHE']
num_cols = ['step', 'amount', 'oldbalanceOrg', 'newbalanceOrig', 'newbalanceDest', 'orig_balance_error', 'hour']

app = FastAPI(
    title='Online Fraud Detection & Analytics API',
    version='1.2.0',
    redirect_slashes=False,
    docs_url='/docs',
    redoc_url='/redoc',
    openapi_url='/openapi.json'
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure outputs directory exists and mount static route (safe for serverless read-only filesystems)
try:
    os.makedirs(OUTPUTS_DIR, exist_ok=True)
except OSError:
    pass

if os.path.exists(OUTPUTS_DIR):
    app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")


class UserInput(BaseModel):
    step: Annotated[int, Field(..., ge=1, le=743, description='Unit of time (1 Step = 1 hour)')]
    Type: Annotated[Literal['CASH_IN', 'PAYMENT', 'TRANSFER', 'CASH_OUT', 'DEBIT'], Field(..., description='Type of Online Transaction')]
    Amount: Annotated[float, Field(..., ge=0, description='Amount of the Transaction')]
    OldbalanceOrg: Annotated[float, Field(..., ge=0, description='Balance before the Transaction')]
    NewbalanceOrig: Annotated[float, Field(..., ge=0, description='Balance After the Transaction')]
    NewbalanceDest: Annotated[float, Field(..., ge=0, description='New Balance Recipient After the Transaction')]

    @computed_field
    @property
    def orig_balance_error(self) -> float:
        return self.OldbalanceOrg - self.Amount - self.NewbalanceOrig

    @computed_field
    @property
    def hour(self) -> int:
        # Standardized 24-hour cycle: (step - 1) % 24
        return (self.step - 1) % 24

    @computed_field
    @property
    def Is_night(self) -> int:
        return 1 if 0 <= self.hour <= 5 else 0

    @computed_field
    @property
    def amount(self) -> float:
        return float(np.log1p(self.Amount))

    @computed_field
    @property
    def oldbalanceOrg(self) -> float:
        return float(np.log1p(self.OldbalanceOrg))

    @computed_field
    @property
    def newbalanceOrig(self) -> float:
        return float(np.log1p(self.NewbalanceOrig))

    @computed_field
    @property
    def newbalanceDest(self) -> float:
        return float(np.log1p(self.NewbalanceDest))


def get_recommendations(step: int, txn_type: str, amount: float, old_balance: float, new_dest: float, output: str) -> List[str]:
    recommendations = []
    hour_of_day = (step - 1) % 24

    if output in {"High Risk", "Medium Risk"}:
        if txn_type in {"TRANSFER", "CASH_OUT"} and amount > 0 and new_dest == 0:
            recommendations.append('Review destination account activity.')

        if hour_of_day in {0, 1, 2, 3, 4, 5}:
            recommendations.append('Transaction occurred during late-night hours. Apply enhanced transaction verification.')

        if amount > 200000:
            recommendations.append('Extremely high transaction amount. Verify the transaction amount with the customer.')

        if txn_type in {"TRANSFER", "CASH_OUT"}:
            recommendations.append('Perform additional verification for this high-risk transaction type.')

        if not recommendations:
            recommendations.append('Flag the transaction for manual review.')
    else:
        recommendations.append('Transaction appears low risk, continue normal transaction monitoring.')

    return recommendations


@app.get('/')
@app.get('/health')
@app.get('/api')
@app.get('/api/health')
def health_check():
    return {
        "status": "healthy",
        "service": "Online Fraud Detection & Visual Analytics API",
        "version": "1.2.0",
        "database": database.get_db_status(),
        "features": ["single_prediction", "batch_upload_csv_json", "visual_analytics", "dynamic_visual_regeneration", "sql_database"]
    }


# ============================================================================
# SQL DATABASE API ROUTES (READ, INSERT, UPDATE, QUERY, SEED)
# ============================================================================

@app.get('/api/database/status')
def get_database_status():
    """Return SQL database connection status, table record counts, and file metrics."""
    try:
        return database.get_db_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database status error: {str(e)}")


@app.post('/api/database/reset')
def reset_database():
    """Re-seed SQL database back to clean initial demo dataset state."""
    try:
        database.init_db(force_recreate=True)
        return {
            "status": "success",
            "message": "SQL database successfully reset to default seed records.",
            "database": database.get_db_status()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset database: {str(e)}")


@app.get('/api/transactions')
def list_transactions(
    limit: Optional[int] = None,
    offset: int = 0,
    search: Optional[str] = None,
    risk: Optional[str] = None,
    status: Optional[str] = None,
    type: Optional[str] = None
):
    """Retrieve database-persisted transactions with optional relational filtering."""
    try:
        txns = database.get_all_transactions(
            limit=limit,
            offset=offset,
            search=search,
            risk=risk,
            status=status,
            txn_type=type
        )
        return txns
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transactions: {str(e)}")


@app.get('/api/transactions/{txn_id}')
def get_transaction(txn_id: str):
    """Retrieve full audit dossier for a single transaction from SQL database."""
    txn = database.get_transaction_by_id(txn_id)
    if not txn:
        raise HTTPException(status_code=404, detail=f"Transaction {txn_id} not found in database.")
    return txn


@app.post('/api/transactions')
def create_transaction(txn: dict = Body(...)):
    """
    Insert a transaction into the SQL database. If fraud prediction metrics
    are not already provided, runs the ML model and recommendation engine automatically.
    """
    try:
        if "fraudProbability" not in txn or "risk" not in txn:
            step = int(txn.get("step", 1))
            txn_type = str(txn.get("type", "PAYMENT")).upper()
            amount = float(txn.get("amount", 0.0))
            old_balance = float(txn.get("oldbalanceOrg", amount))
            new_orig = float(txn.get("newbalanceOrig", 0.0))
            new_dest = float(txn.get("newbalanceDest", 0.0))
            orig_balance_error = old_balance - amount - new_orig
            hour = (step - 1) % 24
            is_night = 1 if 0 <= hour <= 5 else 0

            df_input = pd.DataFrame([{
                'step': step,
                'type': txn_type,
                'amount': float(np.log1p(amount)),
                'oldbalanceOrg': float(np.log1p(old_balance)),
                'newbalanceOrig': float(np.log1p(new_orig)),
                'newbalanceDest': float(np.log1p(new_dest)),
                'orig_balance_error': orig_balance_error,
                'hour': hour,
                'Is_night': is_night
            }])

            scaled = scaler.transform(df_input[num_cols])
            encoded = ohe.transform(df_input[['type']])
            remainder = df_input[['Is_night']].values
            features = np.hstack([scaled, encoded, remainder])
            feature_df = pd.DataFrame(features, columns=model.feature_names_in_)

            prediction = float(model.predict_proba(feature_df)[0][1])
            fraud_prob = round(prediction * 100, 2)
            risk = 'High Risk' if prediction >= 0.70 else 'Medium Risk' if 0.40 <= prediction < 0.70 else 'Low Risk'
            recs = get_recommendations(step, txn_type, amount, old_balance, new_dest, risk)

            flags = []
            if amount > 200000:
                flags.append("High amount anomaly (> $200k)")
            if old_balance > 0 and new_orig == 0:
                flags.append("Complete origin account balance depletion ($0 remaining)")
            if is_night:
                flags.append("Off-peak late night transaction timestamp")
            if txn_type in ['TRANSFER', 'CASH_OUT'] and new_dest == 0:
                flags.append("Unverified destination account with $0 subsequent balance")

            txn["fraudProbability"] = fraud_prob
            txn["risk"] = risk
            txn["recommendations"] = recs
            txn["anomalyFlags"] = flags
            if "status" not in txn:
                txn["status"] = "Blocked" if risk == "High Risk" else "Under Review" if risk == "Medium Risk" else "Approved"

        created = database.insert_transaction(txn)
        return JSONResponse(status_code=201, content=created)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to insert transaction into SQL database: {str(e)}")


@app.patch('/api/transactions/{txn_id}/status')
def update_transaction_status(txn_id: str, payload: dict = Body(...)):
    """Update transaction status (Blocked / Approved / Under Review) and persist in SQL with audit log."""
    new_status = payload.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="Missing required 'status' property in payload.")
    updated = database.update_transaction_status(txn_id, new_status)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Transaction {txn_id} not found in database.")
    return updated


@app.delete('/api/transactions/{txn_id}')
def delete_single_transaction(txn_id: str):
    """Permanently delete a transaction and associated fraud analysis from SQL database."""
    success = database.delete_transaction(txn_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Transaction {txn_id} not found in database.")
    return {"status": "success", "message": f"Transaction {txn_id} deleted from SQL database."}


@app.delete('/api/transactions')
def clear_all_transactions():
    """Clear all transactions and analyses from SQL database."""
    count = database.clear_all_transactions()
    return {"status": "success", "message": f"Successfully deleted {count} transactions from database.", "count": count}


@app.get('/api/customers')
def list_customers():
    """Query customer/user account profiles with balances and risk scores from SQL database."""
    try:
        return database.get_all_customers()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query customers: {str(e)}")


@app.get('/analytics/visuals')
def get_visuals_metadata():
    visuals = [
        {
            "id": "fraud_rate_by_type",
            "title": "Fraud Rate by Transaction Type",
            "file": "/outputs/Fraud_rate_by_type.png",
            "category": "Online Banking",
            "highlight": "TRANSFER and CASH_OUT are the only 2 vectors with confirmed fraud.",
            "description": "Exploratory analysis reveals PAYMENT, CASH_IN, and DEBIT have virtually 0% fraud. The vulnerability concentrates entirely in TRANSFER and CASH_OUT."
        },
        {
            "id": "hourly_fraud_trend",
            "title": "Hourly Fraud Cases (24-Hour Cycle)",
            "file": "/outputs/Hourly_fraud_trend.png",
            "category": "Temporal Dynamics",
            "highlight": "Fraud surges during night/early morning hours ((step - 1) % 24 between 0 to 5 AM).",
            "description": "Legitimate transactions follow daylight business hours, while fraudulent account takeover and wire drain activities peak in late night windows."
        },
        {
            "id": "transaction_types",
            "title": "Transaction Volume by Type (Log Scale)",
            "file": "/outputs/Transaction_types.png",
            "category": "Online Banking",
            "highlight": "PAYMENT and CASH_OUT dominate total volume, while TRANSFER represents highest risk density.",
            "description": "Distribution across transaction categories plotted on logarithmic scale to compare disproportionate transaction volumes."
        },
        {
            "id": "balance_correlation_heatmap",
            "title": "Feature Correlation Heatmap",
            "file": "/outputs/Balance_correlation_heatmap.png",
            "category": "Feature Analysis",
            "highlight": "Strong correlation between oldbalanceOrg, amount, and isFraud flags.",
            "description": "Correlation matrix of financial balances and origin error metrics used to inform the Random Forest feature engineering."
        },
        {
            "id": "amount_distribution",
            "title": "Amount Distribution: Fraud vs Legit (Log Scale)",
            "file": "/outputs/Amount_distribution.png",
            "category": "Distribution",
            "highlight": "Fraudulent transactions shift noticeably toward higher dollar amounts.",
            "description": "KDE density comparison of transaction values showing significant right-skewed distribution for confirmed fraud instances."
        },
        {
            "id": "merchant_category_fraud",
            "title": "Fraud Rate Across Merchant Categories",
            "file": "/outputs/Merchant_category_fraud.png",
            "category": "Credit Card & POS",
            "highlight": "Jewelry, luxury goods, and digital gift cards exhibit highest merchant fraud rates.",
            "description": "Analysis of synthetic credit card transaction telemetry across retail, grocery, entertainment, and luxury commerce categories."
        },
        {
            "id": "card_present_vs_cnp",
            "title": "Card Present vs Card Not Present (CNP) Fraud",
            "file": "/outputs/Card_present_vs_cnp.png",
            "category": "Credit Card & POS",
            "highlight": "Card-Not-Present (online e-commerce) experiences over 3x higher fraud incidence.",
            "description": "Comparison of physical chip/terminal card reads versus online checkout sessions across multiple card tiers."
        },
        {
            "id": "distance_from_home_boxplot",
            "title": "Distance from Home (Legit vs Fraud)",
            "file": "/outputs/Distance_from_home_boxplot.png",
            "category": "Geospatial Telemetry",
            "highlight": "Fraudulent card usage occurs significantly further from registered billing address.",
            "description": "Boxplot telemetry confirming geospatial anomaly detection as an essential fraud predictor."
        },
        {
            "id": "distance_distribution",
            "title": "Geospatial Distance Density Distribution",
            "file": "/outputs/Distance_distribution.png",
            "category": "Geospatial Telemetry",
            "highlight": "Heavy tail for fraudulent transactions occurring over 100km away from home.",
            "description": "Density plot showing abnormal dispersion of fraudulent transactions across physical distances."
        },
        {
            "id": "card_amount_distribution",
            "title": "Credit Card Transaction Value Distribution",
            "file": "/outputs/Card_amount_distribution.png",
            "category": "Distribution",
            "highlight": "Fraudulent card charges display distinct spikes around card credit limit boundaries.",
            "description": "Comparative distribution analysis of card transaction sizes between authorized cardholders and illicit actors."
        }
    ]
    return visuals


@app.post('/analytics/regenerate-from-data')
def regenerate_visuals_from_data(transactions: List[dict] = Body(...)):
    """
    Takes transaction records from the frontend, converts to DataFrame, and delegates
    chart generation to Fraud_Analysis.py.
    """
    if not transactions:
        raise HTTPException(status_code=400, detail="No transaction records provided.")

    df = pd.DataFrame(transactions)
    target_dirs = [OUTPUTS_DIR, FRONTEND_OUTPUTS_DIR]

    charts = generate_online_fraud_charts(df, output_dirs=target_dirs)
    if 'merchant_category' in df.columns:
        cc_charts = generate_credit_card_charts(df, output_dirs=target_dirs)
        charts.extend(cc_charts)

    timestamp = int(time.time())
    return {
        "status": "success",
        "timestamp": timestamp,
        "timeString": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "totalRecordsAnalyzed": len(df),
        "generatedCharts": charts
    }


@app.post('/predict')
def predict(data: UserInput):
    try:
        df = pd.DataFrame([{
            'step': data.step,
            'type': data.Type,
            'amount': data.amount,
            'oldbalanceOrg': data.oldbalanceOrg,
            'newbalanceOrig': data.newbalanceOrig,
            'newbalanceDest': data.newbalanceDest,
            'orig_balance_error': data.orig_balance_error,
            'hour': data.hour,
            'Is_night': data.Is_night
        }])

        scaled = scaler.transform(df[num_cols])
        encoded = ohe.transform(df[['type']])
        remainder = df[['Is_night']].values

        features = np.hstack([scaled, encoded, remainder])
        feature_df = pd.DataFrame(features, columns=model.feature_names_in_)

        prediction = float(model.predict_proba(feature_df)[0][1])
        fraud_probability = round(prediction * 100, 2)

        output = 'High Risk' if prediction >= 0.70 else 'Medium Risk' if 0.40 <= prediction < 0.70 else 'Low Risk'
        recommendations = get_recommendations(data.step, data.Type, data.Amount, data.OldbalanceOrg, data.NewbalanceDest, output)

        result = {
            "Prediction": output,
            "Fraud_probability": fraud_probability,
            "Recommendation_Actions to be taken": recommendations,
        }

        return JSONResponse(status_code=200, content=result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@app.post('/analyze/upload')
async def analyze_batch_upload(file: UploadFile = File(...)):
    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.json')):
        raise HTTPException(status_code=400, detail="Only .csv and .json files are supported.")

    try:
        contents = await file.read()
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            raw_data = json.loads(contents.decode('utf-8'))
            if isinstance(raw_data, dict):
                for key in ["transactions", "data", "records", "rows"]:
                    if key in raw_data and isinstance(raw_data[key], list):
                        raw_data = raw_data[key]
                        break
            if not isinstance(raw_data, list):
                raise ValueError("JSON file must contain an array of transaction objects.")
            df = pd.DataFrame(raw_data)

        if df.empty:
            raise HTTPException(status_code=400, detail="The uploaded file contains no data rows.")

        col_map = {}
        for c in df.columns:
            cleaned = str(c).strip().lower().replace('_', '').replace(' ', '')
            if cleaned in ['step', 'time', 'hour']: col_map[c] = 'step'
            elif cleaned in ['type', 'transactiontype', 'action']: col_map[c] = 'type'
            elif cleaned in ['amount', 'value', 'transactionamount']: col_map[c] = 'amount'
            elif cleaned in ['oldbalanceorg', 'oldbalanceorig', 'initialbalance', 'oldbalance']: col_map[c] = 'oldbalanceOrg'
            elif cleaned in ['newbalanceorig', 'newbalanceorg', 'finalbalance', 'newbalance']: col_map[c] = 'newbalanceOrig'
            elif cleaned in ['newbalancedest', 'recipientnewbalance', 'destnewbalance']: col_map[c] = 'newbalanceDest'
            elif cleaned in ['sender', 'nameorig', 'from', 'source']: col_map[c] = 'sender'
            elif cleaned in ['recipient', 'namedest', 'to', 'destination']: col_map[c] = 'recipient'
            elif cleaned in ['id', 'txnid', 'transactionid']: col_map[c] = 'id'

        df = df.rename(columns=col_map)

        if 'step' not in df.columns: df['step'] = 1
        if 'type' not in df.columns: df['type'] = 'PAYMENT'
        if 'amount' not in df.columns: df['amount'] = 100.0
        if 'oldbalanceOrg' not in df.columns: df['oldbalanceOrg'] = df['amount']
        if 'newbalanceOrig' not in df.columns: df['newbalanceOrig'] = 0.0
        if 'newbalanceDest' not in df.columns: df['newbalanceDest'] = 0.0

        df['step'] = pd.to_numeric(df['step'], errors='coerce').fillna(1).astype(int).clip(lower=1, upper=743)
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce').fillna(0.0).clip(lower=0)
        df['oldbalanceOrg'] = pd.to_numeric(df['oldbalanceOrg'], errors='coerce').fillna(0.0).clip(lower=0)
        df['newbalanceOrig'] = pd.to_numeric(df['newbalanceOrig'], errors='coerce').fillna(0.0).clip(lower=0)
        df['newbalanceDest'] = pd.to_numeric(df['newbalanceDest'], errors='coerce').fillna(0.0).clip(lower=0)

        valid_types = {'TRANSFER', 'CASH_OUT', 'PAYMENT', 'CASH_IN', 'DEBIT'}
        df['type'] = df['type'].astype(str).str.upper()
        df['type'] = df['type'].apply(lambda x: x if x in valid_types else 'PAYMENT')

        orig_balance_error = df['oldbalanceOrg'] - df['amount'] - df['newbalanceOrig']
        # Standardized 24-hour cycle everywhere: (step - 1) % 24
        hour = (df['step'] - 1) % 24
        is_night = ((hour >= 0) & (hour <= 5)).astype(int)

        df_features = pd.DataFrame({
            'step': df['step'],
            'type': df['type'],
            'amount': np.log1p(df['amount']),
            'oldbalanceOrg': np.log1p(df['oldbalanceOrg']),
            'newbalanceOrig': np.log1p(df['newbalanceOrig']),
            'newbalanceDest': np.log1p(df['newbalanceDest']),
            'orig_balance_error': orig_balance_error,
            'hour': hour,
            'Is_night': is_night
        })

        scaled = scaler.transform(df_features[num_cols])
        encoded = ohe.transform(df_features[['type']])
        remainder = df_features[['Is_night']].values

        features_matrix = np.hstack([scaled, encoded, remainder])
        feature_df = pd.DataFrame(features_matrix, columns=model.feature_names_in_)

        probs = model.predict_proba(feature_df)[:, 1]
        probs_pct = np.round(probs * 100, 2)

        risks = []
        statuses = []
        recommendations_list = []
        anomaly_flags_list = []

        for i, p in enumerate(probs):
            if p >= 0.70:
                risk = 'High Risk'
                status = 'Blocked'
            elif p >= 0.40:
                risk = 'Medium Risk'
                status = 'Under Review'
            else:
                risk = 'Low Risk'
                status = 'Approved'

            row_step = int(df['step'].iloc[i])
            row_type = str(df['type'].iloc[i])
            row_amt = float(df['amount'].iloc[i])
            row_old = float(df['oldbalanceOrg'].iloc[i])
            row_new_orig = float(df['newbalanceOrig'].iloc[i])
            row_new_dest = float(df['newbalanceDest'].iloc[i])

            recs = get_recommendations(row_step, row_type, row_amt, row_old, row_new_dest, risk)

            flags = []
            if row_amt > 200000:
                flags.append("High amount anomaly (> $200k)")
            if row_old > 0 and row_new_orig == 0:
                flags.append("Complete origin account balance depletion ($0 remaining)")
            if (row_step - 1) % 24 <= 5:
                flags.append("Off-peak late night transaction timestamp")
            if row_type in ['TRANSFER', 'CASH_OUT'] and row_new_dest == 0:
                flags.append("Unverified destination account with $0 subsequent balance")

            risks.append(risk)
            statuses.append(status)
            recommendations_list.append(recs)
            anomaly_flags_list.append(flags)

        df['risk'] = risks
        df['status'] = statuses
        df['fraudProbability'] = probs_pct
        df['recommendations'] = recommendations_list
        df['anomalyFlags'] = anomaly_flags_list

        results = []
        for i in range(len(df)):
            txn_id = str(df['id'].iloc[i]) if 'id' in df.columns and pd.notna(df['id'].iloc[i]) else f"TXN-UP-{i+1:04d}"
            sender = str(df['sender'].iloc[i]) if 'sender' in df.columns and pd.notna(df['sender'].iloc[i]) else f"acc_{1000 + (i % 8999)}_client"
            recipient = str(df['recipient'].iloc[i]) if 'recipient' in df.columns and pd.notna(df['recipient'].iloc[i]) else (
                "merch_online_gateway" if df['type'].iloc[i] == 'PAYMENT' else f"acc_{2000 + (i % 7999)}_dest"
            )

            results.append({
                "id": txn_id,
                "timestamp": f"Batch Row #{i+1}",
                "step": int(df['step'].iloc[i]),
                "type": df['type'].iloc[i],
                "amount": float(df['amount'].iloc[i]),
                "oldbalanceOrg": float(df['oldbalanceOrg'].iloc[i]),
                "newbalanceOrig": float(df['newbalanceOrig'].iloc[i]),
                "newbalanceDest": float(df['newbalanceDest'].iloc[i]),
                "sender": sender,
                "recipient": recipient,
                "risk": df['risk'].iloc[i],
                "fraudProbability": float(df['fraudProbability'].iloc[i]),
                "status": df['status'].iloc[i],
                "anomalyFlags": df['anomalyFlags'].iloc[i],
                "recommendations": df['recommendations'].iloc[i]
            })

        # Persist uploaded batch records into the SQL database
        for item in results:
            try:
                database.insert_transaction(item)
            except Exception as sql_err:
                print("Warning: failed to persist batch item to SQL:", sql_err)

        # Generate updated analytics charts via Fraud_Analysis module
        target_dirs = [OUTPUTS_DIR, FRONTEND_OUTPUTS_DIR]
        try:
            charts_updated = generate_online_fraud_charts(df, output_dirs=target_dirs)
            if 'merchant_category' in df.columns:
                charts_updated.extend(generate_credit_card_charts(df, output_dirs=target_dirs))
        except Exception as plot_err:
            print("Visual plotting warning:", plot_err)
            charts_updated = []

        # Compute summary KPIs using Fraud_Analysis
        kpi_summary = get_transaction_summary(df)

        summary = {
            "fileName": file.filename,
            "totalScanned": kpi_summary["totalScanned"],
            "highRiskCount": kpi_summary["highRiskCount"],
            "mediumRiskCount": kpi_summary["mediumRiskCount"],
            "lowRiskCount": kpi_summary["lowRiskCount"],
            "fraudRate": kpi_summary["fraudRate"],
            "totalVolume": kpi_summary["totalVolume"],
            "flaggedVolume": kpi_summary["flaggedVolume"],
            "chartsUpdated": charts_updated,
            "visualTimestamp": int(time.time())
        }

        return JSONResponse(status_code=200, content={
            "summary": summary,
            "results": results
        })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process batch file: {str(e)}")


if __name__ == '__main__':
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

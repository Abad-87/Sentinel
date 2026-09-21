from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, computed_field
from typing import Literal, Annotated
import pandas as pd
import numpy as np
import pickle

# Load pre-trained model and preprocessor
with open('model.pkl', 'rb') as file:
    model = pickle.load(file)

with open('preprocessor.pkl', 'rb') as file:
    preprocessor = pickle.load(file)

# Initialize FastAPI app
app = FastAPI(title="Fraud Detection API", redirect_slashes=False)

# Enable CORS middleware BEFORE route definitions
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from localhost and deployed frontend origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UserInput(BaseModel):
    step: Annotated[int, Field(..., ge=1, le=743, description="Unit of time(1 step=1 hour)")]
    Type: Annotated[Literal['CASH_IN', 'PAYMENT', 'TRANSFER', 'CASH_OUT', 'DEBIT'], Field(..., description="Type of online transaction")]
    Amount: Annotated[float, Field(..., ge=0, description="Amount of the transaction")]
    oldbalanceOrg: Annotated[float, Field(..., ge=0, description="Balance before the transaction")]
    NewbalanceOrig: Annotated[float, Field(..., ge=0, description="Balance after the transaction")]
    OldbalanceDest: Annotated[float, Field(..., ge=0, description="Balance before the transaction")]
    NewbalanceDest: Annotated[float, Field(..., ge=0, description="Balance New Receiver Recipient After the Transaction")]

    @computed_field
    @property
    def orig_balance_error(self) -> float:
        return self.oldbalanceOrg - self.Amount - self.NewbalanceOrig

    @computed_field
    @property
    def hour(self) -> int:
        return self.step % 24

    @computed_field
    @property
    def is_night(self) -> int:
        return 1 if 0 <= self.hour <= 5 else 0

    @computed_field
    @property
    def amount(self) -> float:
        return np.log1p(self.Amount)

    @computed_field
    @property
    def oldbalanceorg(self) -> float:
        return np.log1p(self.oldbalanceOrg)

    @computed_field
    @property
    def newbalanceorig(self) -> float:
        return np.log1p(self.NewbalanceOrig)

    @computed_field
    @property
    def oldbalancedest(self) -> float:
        return np.log1p(self.OldbalanceDest)

    @computed_field
    @property
    def newbalancedest(self) -> float:
        return np.log1p(self.NewbalanceDest)


def get_recommendation(data: UserInput, output: str) -> list[str]:
    recommendations = []

    if output in ["High Risk", "Medium Risk"]:
        if data.Type in ["TRANSFER", "CASH_OUT"] and data.Amount > 0 and data.NewbalanceDest == 0:
            recommendations.append('Review destination account activity.')

        if data.step % 24 in [0, 1, 2, 3, 4, 5]:
            recommendations.append('Transaction occurred during late-night hours. Therefore, apply enhanced transaction verification.')

        if data.Amount > 200000:
            recommendations.append('Extremely high transaction amount. Verify the transaction amount with the customer.')

        if data.Type in ["TRANSFER", "CASH_OUT"]:
            recommendations.append('Perform additional verification for this transaction type.')

        if not recommendations:
            recommendations.append('Flag the transaction for manual review.')
    else:
        recommendations.append('Transaction appears low risk, continue normal transaction monitoring.')

    return recommendations



@app.post('/predict')
def predict(data: UserInput):
    try:
        df = pd.DataFrame([{
            'step': data.step,
            'type': data.Type,
            'amount': data.amount,
            'oldbalanceOrg': data.oldbalanceorg,
            'newbalanceOrig': data.newbalanceorig,
            'oldbalanceDest': data.oldbalancedest,
            'newbalanceDest': data.newbalancedest,
            'orig_balance_error': data.orig_balance_error,
            'hour': data.hour,
            'is_night': data.is_night
        }])

        processor = preprocessor.transform(df)

        prediction = float(model.predict_proba(processor)[0][1])
        fraud_probability = round(prediction * 100, 2)

        output = "High Risk" if prediction >= 0.70 else "Medium Risk" if 0.40 <= prediction < 0.70 else "Low Risk"

        recommendations = get_recommendation(data, output)

        result = {
            "Prediction": output,
            "Fraud_probability": fraud_probability,
            "Recommendation_Actions to be taken": recommendations
        }

        return JSONResponse(status_code=200, content=result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

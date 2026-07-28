from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import pandas as pd

app = FastAPI()

# Enable CORS for React frontend (e.g., http://localhost:5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model on startup
model = joblib.load("best_random_forest_model.pkl")

class ShipmentPayload(BaseModel):
    customer_care_calls: int
    customer_rating: int
    cost_of_product: float
    prior_purchases: int
    product_importance: int  # e.g., 1=low, 2=medium, 3=high
    discount_offered: float
    weight_in_gms: float
    warehouse_block: str     # 'A', 'B', 'C', 'D', 'F'
    mode_of_shipment: str    # 'Flight', 'Ship', 'Road'
    gender: str              # 'M' or 'F'

@app.post("/predict")
def predict_delay_risk(data: ShipmentPayload):
    # Construct exact 14-feature structure matching feature_names_in_
    input_dict = {
        'Customer_care_calls': [data.customer_care_calls],
        'Customer_rating': [data.customer_rating],
        'Cost_of_the_Product': [data.cost_of_product],
        'Prior_purchases': [data.prior_purchases],
        'Product_importance': [data.product_importance],
        'Discount_offered': [data.discount_offered],
        'Weight_in_gms': [data.weight_in_gms],
        'Warehouse_block_B': [1 if data.warehouse_block == 'B' else 0],
        'Warehouse_block_C': [1 if data.warehouse_block == 'C' else 0],
        'Warehouse_block_D': [1 if data.warehouse_block == 'D' else 0],
        'Warehouse_block_F': [1 if data.warehouse_block == 'F' else 0],
        'Mode_of_Shipment_Road': [1 if data.mode_of_shipment == 'Road' else 0],
        'Mode_of_Shipment_Ship': [1 if data.mode_of_shipment == 'Ship' else 0],
        'Gender_M': [1 if data.gender == 'M' else 0]
    }

    df = pd.DataFrame(input_dict)
    
    # Extract delay class probability (assuming Class 1 = Delayed)
    probabilities = model.predict_proba(df)[0]
    delay_probability = float(probabilities[1])
    on_time_probability = float(probabilities[0])

    return {
        "delay_probability": round(delay_probability * 100, 1),
        "on_time_probability": round(on_time_probability * 100, 1),
        "risk_level": "HIGH" if delay_probability > 0.55 else "LOW"
    }
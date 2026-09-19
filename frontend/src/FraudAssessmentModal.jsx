import React, { useState } from 'react';

const FraudAssessmentModal = ({ isOpen, onClose, onPredictionResult }) => {
  const [formData, setFormData] = useState({
    step: 1,
    Type: 'TRANSFER',
    Amount: '',
    OldbalanceOrg: '',
    NewbalanceOrig: '',
    NewbalanceDest: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [localResult, setLocalResult] = useState(null); // Added state to display result

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleClear = () => {
    setFormData({
      step: 1,
      Type: 'TRANSFER',
      Amount: '',
      OldbalanceOrg: '',
      NewbalanceOrig: '',
      NewbalanceDest: ''
    });
    setError(null);
    setLocalResult(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setLocalResult(null);

    // Verify these keys exactly match your FastAPI Pydantic BaseModel
    const payload = {
      step: Number(formData.step) || 1,
      Type: formData.type,
      Amount: parseFloat(formData.amount) || 0.0,
      OldbalanceOrg: parseFloat(formData.oldbalanceOrg) || 0.0,
      NewbalanceOrig: parseFloat(formData.newbalanceOrig) || 0.0,
      NewbalanceDest: parseFloat(formData.newbalanceDest) || 0.0
    };

    try {
      const response = await fetch("https://online-fraud-detecter-29wlatd2e-ai-chat-ui.vercel.app/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server status: ${response.status}`);
      }

      const result = await response.json();
      setLocalResult(result); // Save to state for immediate display

      if (onPredictionResult) {
        onPredictionResult(result);
      }
    } catch (err) {
      console.error("Error submitting evaluation:", err);
      setError("Failed to process prediction. Please check input values and backend status.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        {/* Added Close Button */}
        <button onClick={onClose} style={{ float: 'right', cursor: 'pointer' }}>X</button>
        
        <h2>Manually Evaluate New Transaction</h2>
        <p>Enter features for real-time model scoring.</p>

        {error && <div className="error-message" style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

        {/* Added Result Display */}
        {localResult && (
          <div style={{ padding: '15px', backgroundColor: localResult.Prediction === 'Fraud' ? '#ffebee' : '#e8f5e9', marginBottom: '15px', borderRadius: '5px' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Result: {localResult.Prediction}</h3>
            <p><strong>Probability:</strong> {(localResult.Fraud_probability).toFixed(2)}%</p>
            <p><strong>Action:</strong> {localResult['Recommendation_Actions to be taken']}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* ... (Keep all your existing form groups exactly the same) ... */}
          
          <div className="form-row">
            <div className="form-group">
              <label>Step (Time Unit in Hours)</label>
              <input type="number" name="step" value={formData.step} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Transaction Type</label>
              <select name="type" value={formData.type} onChange={handleChange}>
                <option value="TRANSFER">TRANSFER</option>
                <option value="CASH_OUT">CASH_OUT</option>
                <option value="PAYMENT">PAYMENT</option>
                <option value="DEPOSIT">DEPOSIT</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Amount ($)</label>
              <input type="number" step="any" name="amount" value={formData.amount} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Origin Initial Balance ($)</label>
              <input type="number" step="any" name="oldbalanceOrg" value={formData.oldbalanceOrg} onChange={handleChange} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Origin New Balance ($)</label>
              <input type="number" step="any" name="newbalanceOrig" value={formData.newbalanceOrig} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Destination Initial Balance ($)</label>
              <input type="number" step="any" name="oldbalanceDest" value={formData.oldbalanceDest} onChange={handleChange} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Destination New Balance ($)</label>
              <input type="number" step="any" name="newbalanceDest" value={formData.newbalanceDest} onChange={handleChange} required />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={handleClear} className="btn-clear">Clear Form</button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Analyzing..." : "Analyze Transaction Risk"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FraudAssessmentModal;
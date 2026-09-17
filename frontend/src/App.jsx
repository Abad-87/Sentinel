import React, { useState } from 'react';
import './App.css';

function App() {
  const [formData, setFormData] = useState({
    step: '',
    type: 'TRANSFER',
    amount: '',
    oldbalanceOrg: '',
    newbalanceOrig: '',
    oldbalanceDest: '',
    newbalanceDest: ''
  });

  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleReset = () => {
    setFormData({
      step: '',
      type: 'TRANSFER',
      amount: '',
      oldbalanceOrg: '',
      newbalanceOrig: '',
      oldbalanceDest: '',
      newbalanceDest: ''
    });
    setPrediction(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      step: Number(formData.step),
      type: formData.type,
      amount: Number(formData.amount),
      oldbalanceOrg: Number(formData.oldbalanceOrg),
      newbalanceOrig: Number(formData.newbalanceOrig),
      oldbalanceDest: Number(formData.oldbalanceDest),
      newbalanceDest: Number(formData.newbalanceDest)
    };

    try {
      const response = await fetch('http://localhost:5000/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      setPrediction(data);
    } catch (err) {
      console.error('Error:', err);
      alert('Backend connection failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo">
          <span>Sentinel AI</span>
        </div>
        <nav className="nav-menu">
          <a href="#" className="nav-item active">Dashboard</a>
          <a href="#" className="nav-item">Transaction Logs</a>
          <a href="#" className="nav-item">Anomaly Alerts</a>
          <a href="#" className="nav-item">User Accounts</a>
          <a href="#" className="nav-item">Settings</a>
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <h2>Dashboard</h2>
          <div className="user-profile">
            <span>Analyst: Sarah Chen</span>
          </div>
        </header>

        <section className="content-area">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Manually Evaluate New Transaction</h3>
              <p>Enter features for real-time model scoring.</p>
            </div>

            <form onSubmit={handleSubmit} className="form-grid">
              <div className="form-group">
                <label>Step (Hours)</label>
                <input type="number" name="step" value={formData.step} onChange={handleChange} placeholder="e.g. 1" required />
              </div>

              <div className="form-group">
                <label>Transaction Type</label>
                <select name="type" value={formData.type} onChange={handleChange} required>
                  <option value="PAYMENT">PAYMENT</option>
                  <option value="TRANSFER">TRANSFER</option>
                  <option value="CASH_OUT">CASH_OUT</option>
                  <option value="DEBIT">DEBIT</option>
                  <option value="CASH_IN">CASH_IN</option>
                </select>
              </div>

              <div className="form-group">
                <label>Amount ($)</label>
                <input type="number" name="amount" step="0.01" value={formData.amount} onChange={handleChange} placeholder="1250.00" required />
              </div>

              <div className="form-group">
                <label>Origin Initial Balance ($)</label>
                <input type="number" name="oldbalanceOrg" step="0.01" value={formData.oldbalanceOrg} onChange={handleChange} placeholder="10000.00" required />
              </div>

              <div className="form-group">
                <label>Origin New Balance ($)</label>
                <input type="number" name="newbalanceOrig" step="0.01" value={formData.newbalanceOrig} onChange={handleChange} placeholder="8750.00" required />
              </div>

              <div className="form-group">
                <label>Destination Initial Balance ($)</label>
                <input type="number" name="oldbalanceDest" step="0.01" value={formData.oldbalanceDest} onChange={handleChange} placeholder="0.00" required />
              </div>

              <div className="form-group">
                <label>Destination New Balance ($)</label>
                <input type="number" name="newbalanceDest" step="0.01" value={formData.newbalanceDest} onChange={handleChange} placeholder="1250.00" required />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={handleReset}>Clear Form</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Analyzing...' : 'Analyze Transaction Risk'}
                </button>
              </div>
            </form>

            {prediction && (
              <div className="prediction-result">
                <h4>Result: {prediction.is_fraud ? 'FLAGGED FRAUD' : 'APPROVED'}</h4>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
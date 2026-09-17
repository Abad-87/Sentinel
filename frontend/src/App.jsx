import React, { useState } from 'react';
import FraudAssessmentModal from './FraudAssessmentModal';
import './App.css';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [predictionResult, setPredictionResult] = useState(null);

  const handlePredictionResult = (result) => {
    setPredictionResult(result);
  };

  return (
    <div className="app-container">
      <header className="navbar">
        <h1>Sentinel AI</h1>
        <span>Dashboard</span>
      </header>

      <main className="main-content">
        <button 
          type="button" 
          onClick={() => setIsModalOpen(true)}
          className="open-modal-btn"
        >
          Open Evaluation Form
        </button>

        {predictionResult && (
          <div className="result-card">
            <h3>Assessment Output</h3>
            <pre>{JSON.stringify(predictionResult, null, 2)}</pre>
          </div>
        )}

        <FraudAssessmentModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onPredictionResult={handlePredictionResult}
        />
      </main>
    </div>
  );
}

export default App;
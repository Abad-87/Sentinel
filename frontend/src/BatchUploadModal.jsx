import React, { useState, useRef } from 'react';

const BatchUploadModal = ({
  currentTransactions = [],
  activeDataset,
  onBatchAnalyzed,
  onImportToFeed,
  onNavigateToTab,
  onResetToDemo,
  onShowToast
}) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [batchResult, setBatchResult] = useState(null);
  const [filterRisk, setFilterRisk] = useState('ALL');
  const [syncMode, setSyncMode] = useState('replace'); // 'replace' | 'append'
  const [isSynced, setIsSynced] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      const name = selected.name.toLowerCase();
      if (!name.endsWith('.csv') && !name.endsWith('.json')) {
        setError("Invalid file format. Please upload a .csv or .json file.");
        setFile(null);
        return;
      }
      setFile(selected);
      setError(null);
      setBatchResult(null);
      setIsSynced(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      const name = dropped.name.toLowerCase();
      if (!name.endsWith('.csv') && !name.endsWith('.json')) {
        setError("Invalid file format. Please upload a .csv or .json file.");
        return;
      }
      setFile(dropped);
      setError(null);
      setBatchResult(null);
      setIsSynced(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Client-side fallback parser for real uploaded files if backend is offline
  const parseAndScoreClientSide = async (fileObj) => {
    const text = await fileObj.text();
    let rawRows = [];

    if (fileObj.name.toLowerCase().endsWith('.json')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) rawRows = parsed;
        else if (parsed.transactions || parsed.data || parsed.records || parsed.results) {
          rawRows = parsed.transactions || parsed.data || parsed.records || parsed.results;
        }
      } catch (err) {
        throw new Error("Failed to parse JSON file: " + err.message);
      }
    } else {
      // CSV parser
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) throw new Error("CSV file does not contain enough data rows.");

      const rawHeaders = lines[0].split(',').map((h) =>
        h.trim().replace(/^["']|["']$/g, '').toLowerCase().replace(/[_ ]/g, '')
      );

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
        const rowObj = {};
        rawHeaders.forEach((h, idx) => {
          rowObj[h] = parts[idx] !== undefined ? parts[idx] : '';
        });
        rawRows.push(rowObj);
      }
    }

    if (rawRows.length === 0) throw new Error("No valid transaction rows found in file.");

    // Score transactions with domain heuristics matching the ML model
    const scoredResults = rawRows.map((row, idx) => {
      const step = parseInt(row.step || row.time || row.hour || '1', 10) || 1;
      const type = (row.type || row.transactiontype || 'PAYMENT').toUpperCase();
      const amount = parseFloat(row.amount || row.value || '100') || 0;
      const oldbalanceOrg = parseFloat(row.oldbalanceorg || row.oldbalanceorig || row.oldbalance || '0') || 0;
      const newbalanceOrig = parseFloat(row.newbalanceorig || row.newbalanceorg || row.newbalance || '0') || 0;
      const newbalanceDest = parseFloat(row.newbalancedest || row.destnewbalance || '0') || 0;
      const sender = row.sender || row.nameorig || row.source || `acc_${1000 + (idx % 9000)}_corp`;
      const recipient = row.recipient || row.namedest || row.destination || (type === 'PAYMENT' ? 'merch_gateway' : `acc_${2000 + (idx % 8000)}_dest`);
      const txnId = row.id || row.txnid || `TXN-UP-${(idx + 1).toString().padStart(4, '0')}`;

      const hour = step % 24;
      const isNight = hour >= 0 && hour <= 5;
      const isDrainage = oldbalanceOrg > 0 && newbalanceOrig === 0;

      let fraudProbability = 1.2;
      const anomalyFlags = [];
      const recommendations = [];

      if (type === 'TRANSFER' || type === 'CASH_OUT') {
        if (isDrainage) {
          fraudProbability += 65.0;
          anomalyFlags.push("Complete origin account balance depletion ($0 remaining)");
        }
        if (amount > 200000) {
          fraudProbability += 22.0;
          anomalyFlags.push("High amount anomaly (> $200k)");
        }
        if (isNight) {
          fraudProbability += 15.0;
          anomalyFlags.push("Off-peak late night transaction timestamp");
        }
        if (newbalanceDest === 0) {
          fraudProbability += 12.0;
          anomalyFlags.push("Unverified destination account with $0 subsequent balance");
        }
      } else {
        if (amount > 100000) fraudProbability += 10.0;
        if (isNight) fraudProbability += 5.0;
      }

      fraudProbability = Math.min(99.8, Math.max(0.2, Math.round(fraudProbability * 10) / 10));

      let risk = 'Low Risk';
      let status = 'Approved';
      if (fraudProbability >= 70.0) {
        risk = 'High Risk';
        status = 'Blocked';
        recommendations.push('Freeze originating account pending identity verification.');
        recommendations.push('Require secondary multi-factor authentication.');
      } else if (fraudProbability >= 40.0) {
        risk = 'Medium Risk';
        status = 'Under Review';
        recommendations.push('Flag transaction for manual compliance review.');
      } else {
        recommendations.push('Transaction appears low risk, continue normal monitoring.');
      }

      return {
        id: txnId,
        timestamp: `Batch Row #${idx + 1}`,
        step,
        type,
        amount,
        oldbalanceOrg,
        newbalanceOrig,
        newbalanceDest,
        sender,
        recipient,
        risk,
        fraudProbability,
        status,
        anomalyFlags,
        recommendations
      };
    });

    const highRiskCount = scoredResults.filter((r) => r.risk === 'High Risk').length;
    const mediumRiskCount = scoredResults.filter((r) => r.risk === 'Medium Risk').length;
    const lowRiskCount = scoredResults.filter((r) => r.risk === 'Low Risk').length;
    const totalVolume = scoredResults.reduce((sum, r) => sum + r.amount, 0);
    const flaggedVolume = scoredResults.filter((r) => r.risk === 'High Risk').reduce((sum, r) => sum + r.amount, 0);
    const fraudRate = scoredResults.length > 0 ? ((highRiskCount / scoredResults.length) * 100).toFixed(2) : "0.00";

    return {
      summary: {
        fileName: fileObj.name,
        totalScanned: scoredResults.length,
        highRiskCount,
        mediumRiskCount,
        lowRiskCount,
        fraudRate,
        totalVolume,
        flaggedVolume,
        visualTimestamp: Date.now()
      },
      results: scoredResults
    };
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    setLoading(true);
    setError(null);
    setIsSynced(false);

    const formData = new FormData();
    formData.append("file", file);

    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    const primaryUrl = apiBase ? `${apiBase}/analyze/upload` : '/analyze/upload';

    let processedData = null;

    try {
      let response;
      try {
        response = await fetch(primaryUrl, {
          method: "POST",
          body: formData,
        });
      } catch (networkErr) {
        if (primaryUrl !== 'http://127.0.0.1:8000/analyze/upload') {
          response = await fetch("http://127.0.0.1:8000/analyze/upload", {
            method: "POST",
            body: formData,
          });
        } else {
          throw networkErr;
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || `Server returned error ${response.status}`);
      }

      processedData = await response.json();
    } catch (err) {
      console.warn("Backend unavailable or API error, parsing file client-side:", err);
      try {
        processedData = await parseAndScoreClientSide(file);
      } catch (clientErr) {
        setError(`Failed to analyze file: ${clientErr.message || err.message}`);
        setLoading(false);
        return;
      }
    }

    if (processedData && processedData.results) {
      setBatchResult(processedData);
      setIsSynced(true);

      // AUTOMATICALLY FLOW TO EVERY TAB IMMEDIATELY!
      if (onBatchAnalyzed) {
        onBatchAnalyzed(processedData.results, {
          fileName: file.name,
          summary: processedData.summary,
          mode: syncMode
        });
      }
    }

    setLoading(false);
  };

  // Re-sync current batch to all tabs (useful if user changes mode from Replace to Append)
  const handleResync = (newMode = syncMode) => {
    if (!batchResult || !batchResult.results) return;
    if (onBatchAnalyzed) {
      onBatchAnalyzed(batchResult.results, {
        fileName: file ? file.name : (batchResult.summary?.fileName || 'Uploaded Batch'),
        summary: batchResult.summary,
        mode: newMode
      });
      setIsSynced(true);
      if (onShowToast) {
        onShowToast(`Re-synced ${batchResult.results.length} transactions in ${newMode} mode across all tabs.`);
      }
    }
  };

  const handleExportJson = () => {
    if (!batchResult) return;
    const blob = new Blob([JSON.stringify(batchResult, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fraud_analysis_${file ? file.name.split('.')[0] : 'batch'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredResults = batchResult?.results?.filter((item) => {
    if (filterRisk === 'HIGH_RISK') return item.risk === 'High Risk';
    if (filterRisk === 'MEDIUM_RISK') return item.risk === 'Medium Risk';
    if (filterRisk === 'LOW_RISK') return item.risk === 'Low Risk';
    return true;
  }) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Hero Banner */}
      <div className="carbon-panel">
        <div className="panel-header">
          <div className="panel-title-wrap">
            <span className="modal-tag">AUTOMATED INGEST & CROSS-TAB PIPELINE</span>
            <span className="panel-title">Bulk Transaction File Scanner</span>
            <span className="panel-subtitle">
              Upload transaction CSV or JSON files. Scored inference results immediately flow and update live data across <strong>Dashboard</strong>, <strong>Transactions Feed</strong>, <strong>Entity Network</strong>, <strong>Detection Rules</strong>, and <strong>Visual Analytics</strong>.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <a
              href="/sample_transactions.csv"
              download
              className="btn-secondary-action"
              style={{ textDecoration: 'none' }}
              title="Download standard 208-row test dataset"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>description</span>
              <span>Sample CSV</span>
            </a>
            <a
              href="/sample_transactions.json"
              download
              className="btn-secondary-action"
              style={{ textDecoration: 'none' }}
              title="Download sample JSON transactions"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>data_object</span>
              <span>Sample JSON</span>
            </a>
          </div>
        </div>

        {/* Upload Dropzone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          style={{
            background: 'var(--carbon-bg-base)',
            border: `2px dashed ${file ? 'var(--carbon-blue)' : 'var(--carbon-border-medium)'}`,
            borderRadius: '4px',
            padding: '32px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,.json"
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '36px', color: 'var(--carbon-blue)' }}>
              upload_file
            </span>
            {file ? (
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--carbon-text-primary)' }}>
                  {file.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--carbon-text-muted)' }}>
                  ({(file.size / 1024).toFixed(1)} KB) • Click or drag another file to replace
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: '600', color: 'var(--carbon-text-primary)' }}>
                  Drag & drop your CSV or JSON transaction batch here
                </div>
                <div style={{ fontSize: '11px', color: 'var(--carbon-text-muted)' }}>
                  or click to select from your local storage (.csv, .json supported)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sync Mode Selector Controls */}
        <div className="sync-mode-selector">
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--carbon-text-muted)', textTransform: 'uppercase' }}>
            Data Flow Mode:
          </span>
          <label className="sync-mode-option">
            <input
              type="radio"
              name="syncMode"
              value="replace"
              checked={syncMode === 'replace'}
              onChange={() => {
                setSyncMode('replace');
                if (batchResult) handleResync('replace');
              }}
            />
            <span><strong>Replace Active Dataset</strong> (Sets as primary telemetry across all tabs)</span>
          </label>
          <label className="sync-mode-option">
            <input
              type="radio"
              name="syncMode"
              value="append"
              checked={syncMode === 'append'}
              onChange={() => {
                setSyncMode('append');
                if (batchResult) handleResync('append');
              }}
            />
            <span><strong>Append to Stream</strong> (Merges with existing records)</span>
          </label>
        </div>

        {error && (
          <div style={{ background: 'var(--carbon-red-container)', border: '1px solid var(--carbon-red)', color: 'var(--carbon-red)', padding: '10px 14px', borderRadius: '4px', fontSize: '12px' }}>
            <strong>Upload Error:</strong> {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          {file && (
            <button
              type="button"
              className="btn-bulk-action"
              onClick={() => {
                setFile(null);
                setBatchResult(null);
                setError(null);
                setIsSynced(false);
              }}
            >
              Clear File
            </button>
          )}

          {activeDataset && activeDataset.source !== 'initial' && (
            <button
              type="button"
              className="btn-bulk-action"
              onClick={onResetToDemo}
              title="Restore initial seed transactions"
            >
              Reset to Demo Seed
            </button>
          )}

          <button
            type="button"
            className="btn-test-action"
            disabled={!file || loading}
            onClick={handleAnalyze}
          >
            {loading ? (
              <span>Running Inference & Syncing All Tabs...</span>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>bolt</span>
                <span>Analyze & Flow Data to All Tabs →</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Synchronized Confirmation & Results Section */}
      {batchResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Active Data Flow Banner */}
          <div className="live-sync-banner">
            <div className="live-sync-banner-top">
              <div className="live-sync-badge-group">
                <span className="live-sync-indicator">
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>sync</span>
                  Live Synced
                </span>
                <div>
                  <div className="live-sync-title">
                    {batchResult.summary.totalScanned} transactions from "{batchResult.summary.fileName}" actively flowing across all tabs
                  </div>
                  <div className="live-sync-subtitle">
                    Mode: {syncMode === 'replace' ? 'Primary Active Dataset' : 'Merged Stream'} • Pipeline execution completed. All views, graphs, and detection rules updated.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary-action"
                  onClick={() => handleResync(syncMode)}
                  title="Re-broadcast scored batch to all tabs"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sync</span>
                  <span>Re-Sync Tabs</span>
                </button>
                <button
                  type="button"
                  className="btn-bulk-action"
                  onClick={handleExportJson}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                  <span>Export JSON</span>
                </button>
              </div>
            </div>

            {/* 1-Click Tab Jump Buttons */}
            <div className="live-sync-tab-links">
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--carbon-text-muted)' }}>
                JUMP TO TAB WITH UPDATED DATA:
              </span>
              <button
                type="button"
                className="btn-sync-tab-jump"
                onClick={() => onNavigateToTab && onNavigateToTab('DASHBOARD')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>dashboard</span>
                <span>Dashboard KPIs</span>
              </button>
              <button
                type="button"
                className="btn-sync-tab-jump"
                onClick={() => onNavigateToTab && onNavigateToTab('TRANSACTIONS')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>receipt_long</span>
                <span>Live Feed ({batchResult.results.length})</span>
              </button>
              <button
                type="button"
                className="btn-sync-tab-jump"
                onClick={() => onNavigateToTab && onNavigateToTab('ENTITIES')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>hub</span>
                <span>Entity Network</span>
              </button>
              <button
                type="button"
                className="btn-sync-tab-jump"
                onClick={() => onNavigateToTab && onNavigateToTab('RULES')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>tune</span>
                <span>Detection Rules</span>
              </button>
              <button
                type="button"
                className="btn-sync-tab-jump"
                onClick={() => onNavigateToTab && onNavigateToTab('ANALYTICS')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>monitoring</span>
                <span>Visual Analytics</span>
              </button>
            </div>
          </div>

          {/* Batch KPI Row */}
          <div className="kpi-row-grid">
            <div className="carbon-kpi-card">
              <span className="kpi-card-title">Scanned Transactions</span>
              <span className="kpi-card-value">{batchResult.summary.totalScanned}</span>
              <span className="kpi-sub-label">Flowing through active pipeline</span>
            </div>

            <div className="carbon-kpi-card">
              <span className="kpi-card-title" style={{ color: 'var(--carbon-red)' }}>High Risk Interceptions</span>
              <span className="kpi-card-value val-red">
                {batchResult.summary.highRiskCount} <span style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--carbon-text-muted)' }}>({batchResult.summary.fraudRate}%)</span>
              </span>
              <span className="kpi-sub-label">Automated quarantine applied</span>
            </div>

            <div className="carbon-kpi-card">
              <span className="kpi-card-title">Flagged Capital at Risk</span>
              <span className="kpi-card-value val-cyan">
                ${batchResult.summary.flaggedVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="kpi-sub-label">Total batch volume: ${batchResult.summary.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
            </div>

            <div className="carbon-kpi-card">
              <span className="kpi-card-title">Pending Human Review</span>
              <span className="kpi-card-value" style={{ color: 'var(--carbon-amber)' }}>
                {batchResult.summary.mediumRiskCount}
              </span>
              <span className="kpi-sub-label">Secondary triage recommended</span>
            </div>
          </div>

          {/* Scored Results Table */}
          <div className="carbon-table-card">
            <div style={{ padding: '12px 16px', background: 'var(--carbon-surface-container)', borderBottom: '1px solid var(--carbon-border-subtle)', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`filter-pill-btn ${filterRisk === 'ALL' ? 'active' : ''}`}
                onClick={() => setFilterRisk('ALL')}
              >
                All Scored ({batchResult.results.length})
              </button>
              <button
                type="button"
                className={`filter-pill-btn ${filterRisk === 'HIGH_RISK' ? 'active' : ''}`}
                onClick={() => setFilterRisk('HIGH_RISK')}
              >
                🚨 High Risk ({batchResult.summary.highRiskCount})
              </button>
              <button
                type="button"
                className={`filter-pill-btn ${filterRisk === 'MEDIUM_RISK' ? 'active' : ''}`}
                onClick={() => setFilterRisk('MEDIUM_RISK')}
              >
                ⚠️ Medium Risk ({batchResult.summary.mediumRiskCount})
              </button>
              <button
                type="button"
                className={`filter-pill-btn ${filterRisk === 'LOW_RISK' ? 'active' : ''}`}
                onClick={() => setFilterRisk('LOW_RISK')}
              >
                ✓ Low Risk ({batchResult.summary.lowRiskCount})
              </button>
            </div>

            <div className="table-responsive">
              <table className="carbon-data-table">
                <thead>
                  <tr>
                    <th>Risk</th>
                    <th>TXN ID</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Counterparties</th>
                    <th>Anomaly Indicators</th>
                    <th>Probability</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((txn) => (
                    <tr key={txn.id}>
                      <td>
                        <span className={`risk-badge ${txn.risk === 'High Risk' ? 'risk-high' : txn.risk === 'Medium Risk' ? 'risk-medium' : 'risk-low'}`}>
                          {txn.risk}
                        </span>
                      </td>
                      <td className="txn-link">{txn.id}</td>
                      <td>
                        <span className="type-pill">{txn.type}</span>
                      </td>
                      <td className="amount-col">
                        ${txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <div className="counterparty-flow">
                          <span className="acc-sender">{txn.sender}</span>
                          <span className="flow-arrow">→</span>
                          <span className="acc-dest">{txn.recipient}</span>
                        </div>
                      </td>
                      <td>
                        {txn.anomalyFlags?.length > 0 ? (
                          <span style={{ fontSize: '10px', color: 'var(--carbon-red)', fontFamily: 'var(--font-mono)' }}>
                            ⚠️ {txn.anomalyFlags[0]}
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', color: 'var(--carbon-green)', fontFamily: 'var(--font-mono)' }}>
                            ✓ Clean Telemetry
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="prob-cell">
                          <div className="prob-meter-bg">
                            <div
                              className="prob-meter-bar"
                              style={{
                                width: `${Math.min(100, Math.max(8, txn.fraudProbability))}%`,
                                backgroundColor: txn.risk === 'High Risk' ? 'var(--carbon-red)' : txn.risk === 'Medium Risk' ? 'var(--carbon-amber)' : 'var(--carbon-green)'
                              }}
                            ></div>
                          </div>
                          <span className="prob-val-text">{txn.fraudProbability}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${txn.status === 'Blocked' ? 'status-blocked' : txn.status === 'Under Review' ? 'status-review' : 'status-approved'}`}>
                          {txn.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchUploadModal;

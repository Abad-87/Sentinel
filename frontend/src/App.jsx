import React, { useState, useEffect, useMemo } from 'react';
import ExecutiveIntelligenceView from './ExecutiveIntelligenceView';
import EntityDossierView from './EntityDossierView';
import DetectionRulesView from './DetectionRulesView';
import AnalyticsVisuals from './AnalyticsVisuals';
import BatchUploadModal from './BatchUploadModal';
import FraudAssessmentModal from './FraudAssessmentModal';
import TransactionInspectorModal from './TransactionInspectorModal';
import { initialTransactions } from './mockTransactions';
import './App.css';

function App() {
  // Navigation tabs: 'DASHBOARD' | 'TRANSACTIONS' | 'ENTITIES' | 'RULES' | 'ANALYTICS' | 'BATCH'
  const [currentTab, setCurrentTab] = useState('DASHBOARD');
  const [transactions, setTransactions] = useState(initialTransactions);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);
  const [selectedTxnIds, setSelectedTxnIds] = useState(new Set());

  // Backend Health check
  const checkBackendHealth = async () => {
    setBackendStatus('checking');
    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    const healthUrl = apiBase ? `${apiBase}/health` : '/health';

    try {
      let res;
      try {
        res = await fetch(healthUrl);
      } catch {
        res = await fetch('http://127.0.0.1:8000/health');
      }

      if (res.ok) {
        setBackendStatus('connected');
      } else {
        setBackendStatus('offline');
      }
    } catch {
      setBackendStatus('offline');
    }
  };

  useEffect(() => {
    checkBackendHealth();
  }, []);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // When new transaction is scored via Simulator modal
  const handlePredictionResult = (result, newTxn) => {
    if (newTxn) {
      setTransactions((prev) => [newTxn, ...prev]);
      showNotification(`Added transaction ${newTxn.id} scored as ${newTxn.risk} (${newTxn.fraudProbability}%)`);
    }
  };

  // When transactions are imported via Batch upload
  const handleImportBatch = (batchItems) => {
    if (batchItems && batchItems.length > 0) {
      setTransactions((prev) => [...batchItems, ...prev]);
      setCurrentTab('TRANSACTIONS');
      showNotification(`Imported ${batchItems.length} transactions into Live Feed.`);
    }
  };

  // Global status update (Freeze/Approve)
  const handleUpdateStatus = (txnId, newStatus) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === txnId ? { ...t, status: newStatus } : t))
    );
    showNotification(`Updated ${txnId} status to: ${newStatus}`);
  };

  const toggleSelectTxn = (id) => {
    setSelectedTxnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleQuarantineSelected = () => {
    if (selectedTxnIds.size === 0) {
      showNotification('Please select at least one transaction to freeze.');
      return;
    }
    setTransactions((prev) =>
      prev.map((t) => selectedTxnIds.has(t.id) ? { ...t, status: 'Blocked' } : t)
    );
    showNotification(`Froze ${selectedTxnIds.size} transactions.`);
    setSelectedTxnIds(new Set());
  };

  const handleApproveSelected = () => {
    if (selectedTxnIds.size === 0) {
      showNotification('Please select at least one transaction to approve.');
      return;
    }
    setTransactions((prev) =>
      prev.map((t) => selectedTxnIds.has(t.id) ? { ...t, status: 'Approved' } : t)
    );
    showNotification(`Approved ${selectedTxnIds.size} transactions.`);
    setSelectedTxnIds(new Set());
  };

  // Filtered transactions for the Transactions tab
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (activeFilter === 'CRITICAL' && t.fraudProbability < 85) return false;
      if (activeFilter === 'HIGH_RISK' && t.risk !== 'High Risk') return false;
      if (activeFilter === 'MEDIUM_RISK' && t.risk !== 'Medium Risk') return false;
      if (activeFilter === 'LOW_RISK' && t.risk !== 'Low Risk') return false;
      if (activeFilter === 'BLOCKED' && t.status !== 'Blocked') return false;
      if (activeFilter === 'REVIEW' && t.status !== 'Under Review') return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          t.id.toLowerCase().includes(q) ||
          t.sender.toLowerCase().includes(q) ||
          t.recipient.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [transactions, activeFilter, searchQuery]);

  // Global KPIs computed from transactions
  const metrics = useMemo(() => {
    const totalCount = transactions.length;
    const totalVolume = transactions.reduce((acc, t) => acc + (t.amount || 0), 0);
    const blockedTxns = transactions.filter((t) => t.status === 'Blocked');
    const blockedVolume = blockedTxns.reduce((acc, t) => acc + (t.amount || 0), 0);
    const highRiskCount = transactions.filter((t) => t.risk === 'High Risk').length;
    const reviewCount = transactions.filter((t) => t.status === 'Under Review').length;
    const highRiskPct = totalCount > 0 ? ((highRiskCount / totalCount) * 100).toFixed(1) : "0.0";

    return {
      totalCount,
      totalVolume,
      blockedVolume,
      blockedCount: blockedTxns.length,
      highRiskCount,
      reviewCount,
      highRiskPct
    };
  }, [transactions]);

  return (
    <div className="carbon-app-layout">
      {/* ==========================================================================
          1. CLEAN PINNED NAVIGATION SIDEBAR
          ========================================================================== */}
      <aside className="carbon-sidebar">
        <div className="sidebar-header">
          {/* Brand */}
          <div className="sidebar-brand">
            <div className="brand-emblem">
              <svg viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
              </svg>
            </div>
            <div className="brand-meta">
              <div className="brand-title-wrap">
                <span className="brand-title">SENTINEL</span>
                <span className="brand-badge">IBM CARBON</span>
              </div>
              <span className="brand-subtitle">Online Fraud Detector</span>
            </div>
          </div>

          {/* Simple Navigation Links */}
          <div className="sidebar-nav-group-label">Monitoring & Investigation</div>
          <nav className="sidebar-nav">
            <button
              type="button"
              className={`sidebar-nav-item ${currentTab === 'DASHBOARD' ? 'active' : ''}`}
              onClick={() => setCurrentTab('DASHBOARD')}
            >
              <div className="nav-item-left">
                <span className="material-symbols-outlined">dashboard</span>
                <span>Dashboard</span>
              </div>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${currentTab === 'TRANSACTIONS' ? 'active' : ''}`}
              onClick={() => setCurrentTab('TRANSACTIONS')}
            >
              <div className="nav-item-left">
                <span className="material-symbols-outlined">receipt_long</span>
                <span>Transactions</span>
              </div>
              <span className="nav-badge nav-badge-red">{metrics.highRiskCount}</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${currentTab === 'ENTITIES' ? 'active' : ''}`}
              onClick={() => setCurrentTab('ENTITIES')}
            >
              <div className="nav-item-left">
                <span className="material-symbols-outlined">hub</span>
                <span>Entity Network</span>
              </div>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${currentTab === 'RULES' ? 'active' : ''}`}
              onClick={() => setCurrentTab('RULES')}
            >
              <div className="nav-item-left">
                <span className="material-symbols-outlined">tune</span>
                <span>Detection Rules</span>
              </div>
              <span className="nav-badge nav-badge-green">4 Active</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${currentTab === 'ANALYTICS' ? 'active' : ''}`}
              onClick={() => setCurrentTab('ANALYTICS')}
            >
              <div className="nav-item-left">
                <span className="material-symbols-outlined">monitoring</span>
                <span>Visual Analytics</span>
              </div>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${currentTab === 'BATCH' ? 'active' : ''}`}
              onClick={() => setCurrentTab('BATCH')}
            >
              <div className="nav-item-left">
                <span className="material-symbols-outlined">upload_file</span>
                <span>Batch Upload</span>
              </div>
              <span style={{ fontSize: '9px', color: 'var(--carbon-text-muted)' }}>CSV/JSON</span>
            </button>
          </nav>
        </div>

        {/* Engine Telemetry Footer */}
        <div className="sidebar-footer">
          <div className="engine-telemetry-card">
            <div className="engine-telemetry-header">
              <span>ML Engine Status</span>
              <span className="engine-telemetry-latency">18ms</span>
            </div>
            <div className="engine-telemetry-model">Random Forest + GraphSAGE</div>
            <div className="engine-telemetry-node">{transactions.length} Active Records Flowing</div>
          </div>
        </div>
      </aside>

      {/* ==========================================================================
          2. TOP HEADER COMMAND BAR
          ========================================================================== */}
      <header className="carbon-header">
        <div className="header-left">
          <div className="search-command-bar">
            <span className="material-symbols-outlined">search</span>
            <input
              type="text"
              placeholder="Search by Transaction ID, sender, recipient, type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--carbon-text-muted)', cursor: 'pointer' }}
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="header-right">
          {/* Live Metric Ticker */}
          <div className="header-metric-ticker">
            <div className="metric-ticker-item">
              <span className="metric-ticker-label">Total Monitored</span>
              <span className="metric-ticker-value">
                ${(metrics.totalVolume / 1000).toFixed(1)}k
              </span>
            </div>
            <div className="metric-ticker-divider"></div>
            <div className="metric-ticker-item">
              <span className="metric-ticker-label">Fraud Blocked</span>
              <span className="metric-ticker-value highlight-red">
                ${(metrics.blockedVolume / 1000).toFixed(1)}k
              </span>
            </div>
          </div>

          {/* Engine Connectivity Status */}
          <div className="header-engine-status">
            <span className={`engine-dot ${backendStatus}`}></span>
            <span>
              {backendStatus === 'connected' ? 'Engine Online' : backendStatus === 'offline' ? 'Engine Offline' : 'Checking Engine...'}
            </span>
            <button
              type="button"
              className="btn-engine-retry"
              onClick={checkBackendHealth}
              title="Refresh Engine Connection"
            >
              ↻
            </button>
          </div>

          {/* Test Transaction Action */}
          <button
            type="button"
            className="btn-test-action"
            onClick={() => setIsModalOpen(true)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>bolt</span>
            <span>Test Transaction</span>
          </button>
        </div>
      </header>

      {/* Floating Notification Toast */}
      {notification && (
        <div className="carbon-toast">
          <span className="material-symbols-outlined" style={{ color: 'var(--carbon-cyan)', fontSize: '18px' }}>check_circle</span>
          <span>{notification}</span>
          <button
            type="button"
            className="carbon-toast-close"
            onClick={() => setNotification(null)}
          >
            &times;
          </button>
        </div>
      )}

      {/* ==========================================================================
          3. MAIN VIEW ROUTING (ALL CONNECTED TO TRANSACTIONS STATE)
          ========================================================================== */}
      <main className="carbon-main-shell">
        {/* TAB 1: DASHBOARD / EXECUTIVE INTELLIGENCE */}
        {currentTab === 'DASHBOARD' && (
          <ExecutiveIntelligenceView
            transactions={transactions}
            onUpdateStatus={handleUpdateStatus}
            onSelectTxn={setSelectedTxn}
            onNavigateToTab={setCurrentTab}
            onShowToast={showNotification}
          />
        )}

        {/* TAB 2: TRANSACTIONS (LIVE TRIAGE QUEUE) */}
        {currentTab === 'TRANSACTIONS' && (
          <div className="triage-container">
            {/* Control Bar: Filters & Bulk Actions */}
            <div className="triage-control-console">
              <div className="filter-pills-row">
                <div className="filter-pills-left">
                  <button
                    type="button"
                    className={`filter-pill-btn ${activeFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('ALL')}
                  >
                    <span>All ({transactions.length})</span>
                  </button>

                  <button
                    type="button"
                    className={`filter-pill-btn ${activeFilter === 'CRITICAL' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('CRITICAL')}
                  >
                    <span style={{ color: 'var(--carbon-red)' }}>●</span>
                    <span>Critical (&gt;85%)</span>
                    <span className="filter-pill-count critical">
                      {transactions.filter(t => t.fraudProbability >= 85).length}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`filter-pill-btn ${activeFilter === 'HIGH_RISK' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('HIGH_RISK')}
                  >
                    <span>High Risk ({transactions.filter(t => t.risk === 'High Risk').length})</span>
                  </button>

                  <button
                    type="button"
                    className={`filter-pill-btn ${activeFilter === 'MEDIUM_RISK' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('MEDIUM_RISK')}
                  >
                    <span>Medium Risk ({transactions.filter(t => t.risk === 'Medium Risk').length})</span>
                  </button>

                  <button
                    type="button"
                    className={`filter-pill-btn ${activeFilter === 'LOW_RISK' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('LOW_RISK')}
                  >
                    <span>Low Risk ({transactions.filter(t => t.risk === 'Low Risk').length})</span>
                  </button>

                  <button
                    type="button"
                    className={`filter-pill-btn ${activeFilter === 'BLOCKED' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('BLOCKED')}
                  >
                    <span>Blocked ({transactions.filter(t => t.status === 'Blocked').length})</span>
                  </button>

                  <button
                    type="button"
                    className={`filter-pill-btn ${activeFilter === 'REVIEW' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('REVIEW')}
                  >
                    <span>Under Review ({transactions.filter(t => t.status === 'Under Review').length})</span>
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-threat-freeze"
                    onClick={handleQuarantineSelected}
                    disabled={selectedTxnIds.size === 0}
                    style={{ opacity: selectedTxnIds.size === 0 ? 0.5 : 1 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>block</span>
                    <span>Freeze Selected ({selectedTxnIds.size})</span>
                  </button>
                  <button
                    type="button"
                    className="btn-bulk-approve"
                    onClick={handleApproveSelected}
                    disabled={selectedTxnIds.size === 0}
                    style={{ opacity: selectedTxnIds.size === 0 ? 0.5 : 1 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>verified</span>
                    <span>Approve Selected</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="carbon-table-card">
              <div className="table-responsive">
                <table className="carbon-data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '36px' }}>
                        <input
                          type="checkbox"
                          checked={selectedTxnIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTxnIds(new Set(filteredTransactions.map(t => t.id)));
                            } else {
                              setSelectedTxnIds(new Set());
                            }
                          }}
                        />
                      </th>
                      <th>Risk Level</th>
                      <th>Transaction ID</th>
                      <th>Timestamp</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Sender → Recipient</th>
                      <th>Fraud Probability</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--carbon-text-muted)' }}>
                          No transactions matching current filter or search criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((txn) => {
                        const isHigh = txn.risk === 'High Risk';
                        const isMed = txn.risk === 'Medium Risk';
                        const rowClass = isHigh ? 'row-high-risk' : isMed ? 'row-medium-risk' : 'row-low-risk';

                        return (
                          <tr key={txn.id} className={rowClass}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedTxnIds.has(txn.id)}
                                onChange={() => toggleSelectTxn(txn.id)}
                              />
                            </td>
                            <td>
                              <span className={`risk-badge ${isHigh ? 'risk-high' : isMed ? 'risk-medium' : 'risk-low'}`}>
                                {txn.risk}
                              </span>
                            </td>
                            <td>
                              <span
                                className="txn-link"
                                onClick={() => setSelectedTxn(txn)}
                                title="Click to inspect full audit dossier"
                              >
                                {txn.id}
                              </span>
                            </td>
                            <td className="timestamp-col">{txn.timestamp}</td>
                            <td>
                              <span className="type-pill">{txn.type}</span>
                            </td>
                            <td className="amount-col">
                              ${txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td>
                              <div className="counterparty-flow">
                                <span className="acc-sender" title={txn.sender}>{txn.sender}</span>
                                <span className="flow-arrow">→</span>
                                <span className="acc-dest" title={txn.recipient}>{txn.recipient}</span>
                              </div>
                            </td>
                            <td>
                              <div className="prob-cell">
                                <div className="prob-meter-bg">
                                  <div
                                    className="prob-meter-bar"
                                    style={{
                                      width: `${Math.min(100, Math.max(8, txn.fraudProbability))}%`,
                                      backgroundColor: isHigh ? 'var(--carbon-red)' : isMed ? 'var(--carbon-amber)' : 'var(--carbon-green)'
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
                            <td>
                              <div className="row-actions-wrap">
                                <button
                                  type="button"
                                  className="btn-inspect-action"
                                  onClick={() => setSelectedTxn(txn)}
                                  title="Inspect Telemetry"
                                >
                                  Inspect
                                </button>
                                {txn.status !== 'Blocked' && (
                                  <button
                                    type="button"
                                    className="btn-quick-freeze"
                                    onClick={() => handleUpdateStatus(txn.id, 'Blocked')}
                                    title="Freeze"
                                  >
                                    Freeze
                                  </button>
                                )}
                                {txn.status !== 'Approved' && (
                                  <button
                                    type="button"
                                    className="btn-quick-release"
                                    onClick={() => handleUpdateStatus(txn.id, 'Approved')}
                                    title="Approve"
                                  >
                                    Approve
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ENTITY NETWORK (DOSSIER) */}
        {currentTab === 'ENTITIES' && (
          <EntityDossierView
            transactions={transactions}
            onUpdateStatus={handleUpdateStatus}
            onSelectTxn={setSelectedTxn}
            onShowToast={showNotification}
          />
        )}

        {/* TAB 4: DETECTION RULES */}
        {currentTab === 'RULES' && (
          <DetectionRulesView
            transactions={transactions}
            onNavigateToTab={setCurrentTab}
            onShowToast={showNotification}
          />
        )}

        {/* TAB 5: VISUAL ANALYTICS */}
        {currentTab === 'ANALYTICS' && (
          <AnalyticsVisuals transactions={transactions} />
        )}

        {/* TAB 6: BATCH SCANNER */}
        {currentTab === 'BATCH' && (
          <BatchUploadModal onImportToFeed={handleImportBatch} />
        )}
      </main>

      {/* Simulator Modal */}
      <FraudAssessmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onPredictionResult={handlePredictionResult}
      />

      {/* Transaction Audit Inspector Modal */}
      <TransactionInspectorModal
        transaction={selectedTxn}
        onClose={() => setSelectedTxn(null)}
        onUpdateStatus={handleUpdateStatus}
      />
    </div>
  );
}

export default App;
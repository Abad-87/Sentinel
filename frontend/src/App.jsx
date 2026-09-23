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

  // Load transactions from localStorage or fallback to default initial transactions
  const [transactions, setTransactions] = useState(() => {
    try {
      const saved = localStorage.getItem('sentinel_transactions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load transactions from localStorage', e);
    }
    return initialTransactions;
  });

  // Track active dataset metadata across the application
  const [activeDataset, setActiveDataset] = useState(() => {
    try {
      const saved = localStorage.getItem('sentinel_active_dataset');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      name: 'Default Demo Dataset',
      source: 'initial',
      updatedAt: 'System Default',
      totalCount: initialTransactions.length
    };
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);
  const [selectedTxnIds, setSelectedTxnIds] = useState(new Set());

  // Automatically persist transactions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('sentinel_transactions', JSON.stringify(transactions));
    } catch (e) {
      console.warn('Failed to persist transactions to localStorage', e);
    }
  }, [transactions]);

  // Automatically persist dataset metadata to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('sentinel_active_dataset', JSON.stringify(activeDataset));
    } catch (e) {
      console.warn('Failed to persist dataset info to localStorage', e);
    }
  }, [activeDataset]);

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
      setActiveDataset((prev) => ({
        ...prev,
        totalCount: prev.totalCount + 1,
        updatedAt: new Date().toLocaleTimeString()
      }));
      showNotification(`Added transaction ${newTxn.id} scored as ${newTxn.risk} (${newTxn.fraudProbability}%) across all tabs.`);
    }
  };

  // Called automatically whenever CSV/JSON batch analysis completes
  const handleBatchAnalyzed = (batchItems, meta = {}) => {
    if (!batchItems || batchItems.length === 0) return;

    const mode = meta.mode || 'replace'; // 'replace' or 'append'
    const fileName = meta.fileName || 'Uploaded Batch';

    if (mode === 'replace') {
      setTransactions(batchItems);
      setActiveDataset({
        name: fileName,
        source: 'upload',
        updatedAt: new Date().toLocaleTimeString(),
        totalCount: batchItems.length
      });
      setSelectedTxnIds(new Set());
      showNotification(`✨ Active dataset updated: ${batchItems.length} transactions from "${fileName}" are now live in ALL tabs!`);
    } else {
      setTransactions((prev) => {
        const existingIds = new Set(prev.map(t => t.id));
        const newUnique = batchItems.filter(t => !existingIds.has(t.id));
        const merged = [...newUnique, ...prev];
        setActiveDataset({
          name: `${fileName} (+${prev.length} prior)`,
          source: 'upload_merged',
          updatedAt: new Date().toLocaleTimeString(),
          totalCount: merged.length
        });
        return merged;
      });
      showNotification(`✨ Appended ${batchItems.length} transactions from "${fileName}". Flowing into ALL tabs!`);
    }
  };

  // Re-evaluation of all transactions (e.g. from Detection Rules sensitivity deployment)
  const handleUpdateAllTransactions = (updatedItems, reason = 'Rule Re-evaluation') => {
    if (!updatedItems || updatedItems.length === 0) return;
    setTransactions(updatedItems);
    setActiveDataset((prev) => ({
      ...prev,
      updatedAt: new Date().toLocaleTimeString()
    }));
    showNotification(`⚡ ${reason} applied: Updated risk analysis across all ${updatedItems.length} transactions in every tab.`);
  };

  // Revert back to standard initial demo transactions
  const handleResetToDemo = () => {
    setTransactions(initialTransactions);
    setActiveDataset({
      name: 'Default Demo Dataset',
      source: 'initial',
      updatedAt: new Date().toLocaleTimeString(),
      totalCount: initialTransactions.length
    });
    setSelectedTxnIds(new Set());
    showNotification(`Reset to default demo dataset (${initialTransactions.length} transactions) across all tabs.`);
  };

  // Manual import trigger for backwards compatibility
  const handleImportBatch = (batchItems) => {
    handleBatchAnalyzed(batchItems, { fileName: 'Imported Batch', mode: 'append' });
    setCurrentTab('TRANSACTIONS');
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

  // Tab display metadata for breadcrumbs & subtitles
  const tabMetadata = {
    DASHBOARD: {
      breadcrumb: 'Dashboard',
      title: 'Dashboard',
      subtitle: 'Real-time AI fraud interception and financial risk command center.'
    },
    TRANSACTIONS: {
      breadcrumb: 'Transactions',
      title: 'Transactions',
      subtitle: 'Monitor real-time live transaction feed, review compliance and manage quarantine.'
    },
    ENTITIES: {
      breadcrumb: 'Entity Network',
      title: 'Entity Network',
      subtitle: 'Entity graph analysis, counterparty ledgers, and forensic origin/destination tracking.'
    },
    RULES: {
      breadcrumb: 'Detection Rules',
      title: 'Detection Rules',
      subtitle: 'Active heuristic rules, ML decision weights, and automated threshold interceptors.'
    },
    ANALYTICS: {
      breadcrumb: 'Visual Analytics',
      title: 'Visual Analytics',
      subtitle: 'Multi-dimensional telemetry, 24-hour liquidity cycle, and risk distribution analysis.'
    },
    BATCH: {
      breadcrumb: 'Batch Upload',
      title: 'Batch Upload',
      subtitle: 'High-throughput batch ingest scanner and event auditing pipeline.'
    }
  };

  const currentMeta = tabMetadata[currentTab] || tabMetadata.DASHBOARD;

  return (
    <div className="carbon-app-layout">
      {/* ==========================================================================
          1. SENTINEL NAVIGATION SIDEBAR
          ========================================================================== */}
      <aside className="carbon-sidebar">
        <div className="sidebar-header">
          {/* Brand */}
          <div className="sidebar-brand">
            <div className="brand-emblem">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#344767">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
              </svg>
            </div>
            <div className="brand-meta">
              <span className="brand-title">Sentinel</span>
              <span className="brand-subtitle">Online Fraud Detector</span>
            </div>
          </div>

          <div className="sidebar-divider"></div>

          {/* Navigation Items (Dashboard, Transactions, Entity Network, Detection Rules, Visual Analytics, Batch Upload) */}
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
              {metrics.highRiskCount > 0 && (
                <span className="nav-badge nav-badge-red">{metrics.highRiskCount}</span>
              )}
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
              <span className="nav-badge nav-badge-green">4</span>
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
            </button>
          </nav>
        </div>

        {/* Sidebar Footer Action */}
        <div className="sidebar-footer-actions">
          <button
            type="button"
            className="md-btn-upgrade-pro"
            onClick={() => setIsModalOpen(true)}
          >
            Test Transactions
          </button>
        </div>
      </aside>

      {/* ==========================================================================
          2. TOP HEADER / BREADCRUMBS COMMAND BAR
          ========================================================================== */}
      <header className="carbon-header">
        <div className="header-left">
          <div className="md-breadcrumbs-wrap">
            <div className="md-breadcrumb-trail">
              <span className="md-breadcrumb-root">Pages</span>
              <span className="md-breadcrumb-sep">/</span>
              <span className="md-breadcrumb-current">{currentMeta.breadcrumb}</span>
            </div>
            <h1 className="md-page-title">{currentMeta.title}</h1>
            <p className="md-page-subtitle">{currentMeta.subtitle}</p>
          </div>
        </div>

        <div className="header-right">
          {/* Pill Search Box */}
          <div className="md-search-bar">
            <input
              type="text"
              placeholder="Type here..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="md-search-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          {/* Active Dataset Status Pill */}
          <div className="active-dataset-header-pill" title={`Active Dataset: ${activeDataset.name} (Updated: ${activeDataset.updatedAt}) • Click Reset to restore demo seed`}>
            <span className="dataset-dot"></span>
            <span className="dataset-label">Dataset:</span>
            <span className="dataset-name">{activeDataset.name}</span>
            <span className="dataset-count">({transactions.length})</span>
            {activeDataset.source !== 'initial' && (
              <button
                type="button"
                className="btn-header-reset-demo"
                onClick={handleResetToDemo}
                title="Reset to default initial demo dataset"
              >
                Reset
              </button>
            )}
          </div>

          {/* Test Transaction Action Button */}
          <button
            type="button"
            className="md-btn-online-builder"
            onClick={() => setIsModalOpen(true)}
            title="Open Interactive Simulator"
          >
            Test Transaction
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
            activeDataset={activeDataset}
            onResetToDemo={handleResetToDemo}
            onUpdateStatus={handleUpdateStatus}
            onSelectTxn={setSelectedTxn}
            onNavigateToTab={setCurrentTab}
            onShowToast={showNotification}
          />
        )}

        {/* TAB 2: TRANSACTIONS (LIVE TRIAGE QUEUE) */}
        {currentTab === 'TRANSACTIONS' && (
          <div className="triage-container">
            {/* Active Telemetry Stream Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--carbon-surface-container)', padding: '8px 16px', borderRadius: '4px', border: '1px solid var(--carbon-border-subtle)', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <span className="dataset-dot"></span>
                <span style={{ fontWeight: 'bold', color: 'var(--carbon-text-primary)' }}>Live Feed Source:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--carbon-cyan)' }}>{activeDataset.name}</span>
                <span style={{ color: 'var(--carbon-text-muted)' }}>({transactions.length} records • Synced across all tabs)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-sync-tab-jump"
                  onClick={() => setCurrentTab('BATCH')}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>upload_file</span>
                  <span>Batch Ingest</span>
                </button>
                {activeDataset.source !== 'initial' && (
                  <button
                    type="button"
                    className="btn-header-reset-demo"
                    onClick={handleResetToDemo}
                  >
                    Reset Demo
                  </button>
                )}
              </div>
            </div>

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
            activeDataset={activeDataset}
            onUpdateStatus={handleUpdateStatus}
            onSelectTxn={setSelectedTxn}
            onShowToast={showNotification}
          />
        )}

        {/* TAB 4: DETECTION RULES */}
        {currentTab === 'RULES' && (
          <DetectionRulesView
            transactions={transactions}
            activeDataset={activeDataset}
            onUpdateAllTransactions={handleUpdateAllTransactions}
            onNavigateToTab={setCurrentTab}
            onShowToast={showNotification}
          />
        )}

        {/* TAB 5: VISUAL ANALYTICS */}
        {currentTab === 'ANALYTICS' && (
          <AnalyticsVisuals
            transactions={transactions}
            activeDataset={activeDataset}
            onShowToast={showNotification}
          />
        )}

        {/* TAB 6: BATCH SCANNER */}
        {currentTab === 'BATCH' && (
          <BatchUploadModal
            currentTransactions={transactions}
            activeDataset={activeDataset}
            onBatchAnalyzed={handleBatchAnalyzed}
            onImportToFeed={handleImportBatch}
            onNavigateToTab={setCurrentTab}
            onResetToDemo={handleResetToDemo}
            onShowToast={showNotification}
          />
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
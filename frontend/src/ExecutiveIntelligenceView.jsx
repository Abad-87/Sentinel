import React, { useMemo } from 'react';

const ExecutiveIntelligenceView = ({
  transactions = [],
  activeDataset,
  onResetToDemo,
  onUpdateStatus,
  onSelectTxn,
  onNavigateToTab,
  onShowToast
}) => {
  // Compute real-time KPIs from transactions
  const stats = useMemo(() => {
    const totalCount = transactions.length;
    const totalVolume = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const blockedTxns = transactions.filter((t) => t.status === 'Blocked');
    const blockedVolume = blockedTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
    const highRiskTxns = transactions.filter((t) => t.risk === 'High Risk');
    const reviewTxns = transactions.filter((t) => t.status === 'Under Review');
    const cleanTxns = transactions.filter((t) => t.risk === 'Low Risk');
    const highRiskPct = totalCount > 0 ? ((highRiskTxns.length / totalCount) * 100).toFixed(1) : "0.0";

    // Dynamic Breakdown by Transaction Type
    const types = ['TRANSFER', 'CASH_OUT', 'PAYMENT', 'DEBIT', 'CASH_IN'];
    const vectorBreakdown = types.map((typeName) => {
      const matching = transactions.filter((t) => t.type === typeName);
      const volume = matching.reduce((sum, t) => sum + (t.amount || 0), 0);
      const fraudCount = matching.filter((t) => t.risk === 'High Risk').length;
      const pct = totalVolume > 0 ? Math.min(100, Math.round((volume / totalVolume) * 100)) : 0;
      return {
        type: typeName,
        count: matching.length,
        volume,
        fraudCount,
        pct
      };
    }).filter(v => v.count > 0);

    // Filter threats that require immediate action: High Risk or Under Review
    const actionableThreats = transactions.filter(
      (t) => t.risk === 'High Risk' || t.status === 'Under Review'
    );

    return {
      totalCount,
      totalVolume,
      blockedVolume,
      blockedCount: blockedTxns.length,
      highRiskCount: highRiskTxns.length,
      reviewCount: reviewTxns.length,
      cleanCount: cleanTxns.length,
      highRiskPct,
      vectorBreakdown,
      actionableThreats
    };
  }, [transactions]);

  return (
    <div className="exec-container">
      {/* Telemetry Status Strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--carbon-surface-container)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--carbon-border-subtle)', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="dataset-dot"></span>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--carbon-text-primary)' }}>
            Active Dataset: {activeDataset?.name || 'Live Dataset'}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--carbon-text-muted)' }}>
            ({stats.totalCount} transactions • Synced across all tabs)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn-sync-tab-jump"
            onClick={() => onNavigateToTab && onNavigateToTab('BATCH')}
            style={{ padding: '4px 10px', fontSize: '11px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>upload_file</span>
            <span>Upload & Analyze CSV</span>
          </button>
          {activeDataset && activeDataset.source !== 'initial' && onResetToDemo && (
            <button
              type="button"
              className="btn-header-reset-demo"
              onClick={onResetToDemo}
            >
              Reset to Demo Seed
            </button>
          )}
        </div>
      </div>

      {/* ==========================================================================
          ROW 1: 4 KPI CARDS (Total Monitored Volume, Fraud Capital Blocked, High Risk Incidents, Detection Precision)
          ========================================================================== */}
      <div className="md-kpi-grid">
        {/* KPI 1: Total Monitored Volume */}
        <div className="md-stat-card">
          <div className="md-stat-card-top">
            <div className="md-stat-info">
              <span className="md-stat-label">Total Monitored Volume</span>
              <span className="md-stat-value">
                ${stats.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="md-stat-icon-box">
              <span className="material-symbols-outlined">account_balance</span>
            </div>
          </div>
          <div className="md-stat-card-divider"></div>
          <div className="md-stat-footer">
            <span className="md-trend-positive">+{stats.totalCount} active</span>
            <span className="md-trend-text">flowing through pipeline</span>
          </div>
        </div>

        {/* KPI 2: Fraud Capital Blocked */}
        <div className="md-stat-card">
          <div className="md-stat-card-top">
            <div className="md-stat-info">
              <span className="md-stat-label">Fraud Capital Blocked</span>
              <span className="md-stat-value" style={{ color: 'var(--md-red)' }}>
                ${stats.blockedVolume.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="md-stat-icon-box">
              <span className="material-symbols-outlined">lock</span>
            </div>
          </div>
          <div className="md-stat-card-divider"></div>
          <div className="md-stat-footer">
            <span className="md-trend-negative">{stats.blockedCount} frozen</span>
            <span className="md-trend-text">prevented from execution</span>
          </div>
        </div>

        {/* KPI 3: High Risk Incidents */}
        <div className="md-stat-card">
          <div className="md-stat-card-top">
            <div className="md-stat-info">
              <span className="md-stat-label">High Risk Incidents</span>
              <span className="md-stat-value">
                {stats.highRiskCount} <span style={{ fontSize: '15px', fontWeight: '500', color: 'var(--md-text-secondary)' }}>({stats.highRiskPct}%)</span>
              </span>
            </div>
            <div className="md-stat-icon-box">
              <span className="material-symbols-outlined">warning</span>
            </div>
          </div>
          <div className="md-stat-card-divider"></div>
          <div className="md-stat-footer">
            <span className="md-trend-negative">{stats.reviewCount} pending</span>
            <span className="md-trend-text">human review required</span>
          </div>
        </div>

        {/* KPI 4: Detection Precision */}
        <div className="md-stat-card">
          <div className="md-stat-card-top">
            <div className="md-stat-info">
              <span className="md-stat-label">Detection Precision</span>
              <span className="md-stat-value" style={{ color: 'var(--md-green)' }}>99.1%</span>
            </div>
            <div className="md-stat-icon-box">
              <span className="material-symbols-outlined">shield</span>
            </div>
          </div>
          <div className="md-stat-card-divider"></div>
          <div className="md-stat-footer">
            <span className="md-trend-positive">18ms avg latency</span>
            <span className="md-trend-text">Random Forest + GraphSAGE</span>
          </div>
        </div>
      </div>

      {/* ==========================================================================
          ROW 2: OPERATIONAL PANELS (Volume Breakdown & Immediate Action Queue)
          ========================================================================== */}
      <div className="exec-mid-grid">
        {/* Left: Volume Distribution by Instrument */}
        <div className="carbon-panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <span className="panel-title">Transaction Volume by Instrument</span>
              <span className="panel-subtitle">Live aggregation calculated directly from the active dataset</span>
            </div>
            <span className="panel-header-badge badge-secondary">{stats.vectorBreakdown.length} INSTRUMENTS</span>
          </div>

          <div className="vector-list">
            {stats.vectorBreakdown.map((item) => (
              <div key={item.type} className="vector-item">
                <div className="vector-item-top">
                  <div className="vector-item-left">
                    <span className="type-pill">{item.type}</span>
                    <div>
                      <span className="vector-name">
                        {item.count} transactions {item.fraudCount > 0 && <span style={{ color: 'var(--md-red)', fontSize: '11px', fontWeight: 'bold' }}>({item.fraudCount} high risk)</span>}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="vector-amount">${item.volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <span className="vector-pct">{item.pct}% of total</span>
                  </div>
                </div>
                <div className="vector-progress-track">
                  <div
                    className={`vector-progress-fill ${item.fraudCount > 0 ? 'fill-red' : 'fill-green'}`}
                    style={{ width: `${Math.max(6, item.pct)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Quick Action Threats (Transactions needing attention) */}
        <div className="carbon-panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <div className="panel-title">
                <span className="material-symbols-outlined" style={{ color: 'var(--md-red)' }}>warning</span>
                <span>Immediate Action Queue</span>
              </div>
              <span className="panel-subtitle">High Risk or Under Review transactions awaiting compliance decision</span>
            </div>
            <span className="panel-header-badge badge-error">{stats.actionableThreats.length} PENDING</span>
          </div>

          <div className="threat-list">
            {stats.actionableThreats.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--md-green)', fontSize: '12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '28px', display: 'block', marginBottom: '4px' }}>task_alt</span>
                All pending transactions have been processed. Clean stream.
              </div>
            ) : (
              stats.actionableThreats.slice(0, 4).map((txn) => (
                <div key={txn.id} className="threat-item">
                  <div className="threat-left">
                    <div className={`threat-dot ${txn.risk === 'High Risk' ? 'dot-red' : 'dot-amber'}`}></div>
                    <div className="threat-details">
                      <div className="threat-header-line">
                        <span
                          className="txn-link"
                          style={{ fontSize: '12px' }}
                          onClick={() => onSelectTxn && onSelectTxn(txn)}
                        >
                          {txn.id}
                        </span>
                        <span className={`threat-tag ${txn.risk === 'High Risk' ? 'threat-tag-red' : 'threat-tag-cyan'}`}>
                          {txn.risk} ({txn.fraudProbability}%)
                        </span>
                        <span className="status-badge" style={{ fontSize: '9px' }}>{txn.status}</span>
                      </div>
                      <div className="threat-desc">
                        {txn.sender} → {txn.recipient} • {txn.type}
                      </div>
                    </div>
                  </div>

                  <div className="threat-right">
                    <div className="threat-amount-wrap">
                      <span className="threat-amount">${txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="threat-actions">
                      {txn.status !== 'Blocked' && (
                        <button
                          type="button"
                          className="btn-threat-freeze"
                          onClick={() => onUpdateStatus && onUpdateStatus(txn.id, 'Blocked')}
                          title="Freeze this transaction immediately"
                        >
                          Freeze
                        </button>
                      )}
                      {txn.status !== 'Approved' && (
                        <button
                          type="button"
                          className="btn-threat-audit"
                          onClick={() => onUpdateStatus && onUpdateStatus(txn.id, 'Approved')}
                          title="Approve this transaction"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {stats.actionableThreats.length > 4 && (
            <button
              type="button"
              className="btn-secondary-action"
              style={{ justifyContent: 'center' }}
              onClick={() => onNavigateToTab && onNavigateToTab('TRANSACTIONS')}
            >
              View all {stats.actionableThreats.length} flagged transactions in Transactions →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExecutiveIntelligenceView;

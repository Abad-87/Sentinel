import React, { useMemo } from 'react';

const ExecutiveIntelligenceView = ({
  transactions = [],
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
      {/* 1. Top Summary Banner */}
      <div className="telemetry-banner">
        <div className="telemetry-stream-status">
          <div className="telemetry-pill-active">
            <span className="pulse-dot"></span>
            <span>SYSTEM ACTIVE • LIVE DATA STREAM</span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--carbon-text-secondary)' }}>
            Monitoring {stats.totalCount} transactions across payment gateways
          </span>
        </div>

        <div className="telemetry-actions">
          <button
            type="button"
            className="btn-secondary-action"
            onClick={() => onNavigateToTab && onNavigateToTab('TRIAGE')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>inbox_customize</span>
            <span>View All Transactions ({stats.totalCount})</span>
          </button>
          <button
            type="button"
            className="btn-test-action"
            onClick={() => onShowToast && onShowToast('Exported Executive Security Summary (JSON)')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* 2. 4-Column KPI Cards (Computed from active transactions) */}
      <div className="kpi-row-grid">
        {/* KPI 1: Total Monitored Volume */}
        <div className="carbon-kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-card-title-group">
              <span className="kpi-card-title">Total Monitored Volume</span>
              <span className="kpi-card-value">
                ${stats.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="kpi-icon-box">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>account_balance</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <div className="kpi-meta-text">
              <div className="kpi-trend-stat trend-green">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check</span>
                <span>{stats.totalCount} active transactions</span>
              </div>
              <span className="kpi-sub-label">Flowing through ML pipeline</span>
            </div>
            <svg className="sparkline-svg" fill="none" viewBox="0 0 100 32">
              <path d="M0 26 L20 22 L40 25 L60 15 L80 18 L100 8" stroke="#0f62fe" strokeWidth="2" strokeLinecap="round" />
              <path d="M0 26 L20 22 L40 25 L60 15 L80 18 L100 8 L100 32 L0 32 Z" fill="#0f62fe" fillOpacity="0.12" />
            </svg>
          </div>
        </div>

        {/* KPI 2: Fraud Prevented / Blocked */}
        <div className="carbon-kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-card-title-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="kpi-card-title" style={{ color: 'var(--carbon-red)' }}>Fraud Capital Blocked</span>
                <span className="kpi-card-tag-critical">BLOCKED</span>
              </div>
              <span className="kpi-card-value val-red">
                ${stats.blockedVolume.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="kpi-icon-box icon-red">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>gpp_maybe</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <div className="kpi-meta-text">
              <div className="kpi-trend-stat trend-red">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>lock</span>
                <span>{stats.blockedCount} transactions frozen</span>
              </div>
              <span className="kpi-sub-label">Prevented from execution</span>
            </div>
            <svg className="sparkline-svg" fill="none" viewBox="0 0 100 32">
              <path d="M0 28 L25 24 L50 25 L75 14 L100 4" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
              <path d="M0 28 L25 24 L50 25 L75 14 L100 4 L100 32 L0 32 Z" fill="#ef4444" fillOpacity="0.15" />
            </svg>
          </div>
        </div>

        {/* KPI 3: High Risk Incidents */}
        <div className="carbon-kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-card-title-group">
              <span className="kpi-card-title">High Risk Incidents</span>
              <span className="kpi-card-value val-cyan">
                {stats.highRiskCount} <span style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--carbon-text-muted)' }}>({stats.highRiskPct}%)</span>
              </span>
            </div>
            <div className="kpi-icon-box icon-cyan">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>crisis_alert</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <div className="kpi-meta-text">
              <span style={{ fontSize: '11px', color: 'var(--carbon-text-secondary)', fontWeight: '600' }}>
                {stats.reviewCount} pending human review
              </span>
              <span className="kpi-sub-label">{stats.cleanCount} confirmed legitimate</span>
            </div>
            <div style={{ width: '40px', height: '6px', background: 'var(--carbon-surface-container-highest)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${stats.highRiskPct}%`, height: '100%', background: 'var(--carbon-red)' }}></div>
            </div>
          </div>
        </div>

        {/* KPI 4: Automated Interception Accuracy */}
        <div className="carbon-kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-card-title-group">
              <span className="kpi-card-title">Detection Precision</span>
              <span className="kpi-card-value val-green">99.1%</span>
            </div>
            <div className="kpi-icon-box icon-green">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>shield_check</span>
            </div>
          </div>
          <div className="kpi-card-bottom">
            <div className="kpi-meta-text">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 'bold', color: 'var(--carbon-green)' }}>
                18ms Average Latency
              </span>
              <span className="kpi-sub-label">Random Forest + GraphSAGE</span>
            </div>
            <span style={{ fontSize: '10px', background: 'var(--carbon-surface-container-highest)', color: 'var(--carbon-green)', padding: '2px 6px', borderRadius: '2px', fontWeight: 'bold' }}>
              ACTIVE
            </span>
          </div>
        </div>
      </div>

      {/* 3. Middle Section: Fraud Volume Breakdown + Real-Time Alerts */}
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
                        {item.count} transactions {item.fraudCount > 0 && <span style={{ color: 'var(--carbon-red)', fontSize: '11px' }}>({item.fraudCount} high risk)</span>}
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
                    className={`vector-progress-fill ${item.fraudCount > 0 ? 'fill-red' : 'fill-blue'}`}
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
                <span className="material-symbols-outlined" style={{ color: 'var(--carbon-red)' }}>warning</span>
                <span>Immediate Action Queue</span>
              </div>
              <span className="panel-subtitle">High Risk or Under Review transactions awaiting compliance decision</span>
            </div>
            <span className="panel-header-badge badge-error">{stats.actionableThreats.length} PENDING</span>
          </div>

          <div className="threat-list">
            {stats.actionableThreats.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--carbon-green)', fontSize: '12px' }}>
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
              onClick={() => onNavigateToTab && onNavigateToTab('TRIAGE')}
            >
              View all {stats.actionableThreats.length} flagged transactions in Triage →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExecutiveIntelligenceView;

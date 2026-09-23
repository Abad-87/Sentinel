import React, { useState, useMemo } from 'react';

const defaultRules = [
  {
    id: "RULE-DRAIN",
    code: "#R-01",
    name: "Origin Account Complete Balance Drainage",
    desc: "Flags transactions where the sender's origin account balance is depleted to $0 immediately after the transfer.",
    check: (t) => t.oldbalanceOrg > 0 && t.newbalanceOrig === 0,
    weight: 95,
    enabled: true
  },
  {
    id: "RULE-HIGH-VAL",
    code: "#R-02",
    name: "High Value Transfer Threshold",
    desc: "Flags transactions whose value exceeds $150,000 across payment instruments.",
    check: (t) => (t.amount || 0) >= 150000,
    weight: 88,
    enabled: true
  },
  {
    id: "RULE-NIGHT",
    code: "#R-03",
    name: "Off-Peak Night Hours Activity (00:00 – 05:00)",
    desc: "Flags anomalous transactions occurring during late-night account drainage windows.",
    check: (t) => (t.step % 24) < 5,
    weight: 75,
    enabled: true
  },
  {
    id: "RULE-ZERO-DEST",
    code: "#R-04",
    name: "Zero Destination Balance Anomaly",
    desc: "Flags large transfers directed toward accounts that currently exhibit zero balance.",
    check: (t) => t.newbalanceDest === 0 && (t.amount || 0) > 10000,
    weight: 82,
    enabled: true
  }
];

const DetectionRulesView = ({
  transactions = [],
  activeDataset,
  onUpdateAllTransactions,
  onNavigateToTab,
  onShowToast
}) => {
  const [rules, setRules] = useState(defaultRules);

  // Compute live matches for each rule from the shared transactions state
  const ruleMatches = useMemo(() => {
    const matchMap = {};
    rules.forEach((rule) => {
      const matches = transactions.filter((t) => rule.check(t));
      matchMap[rule.id] = matches;
    });
    return matchMap;
  }, [transactions, rules]);

  const handleToggle = (id) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const newState = !r.enabled;
          if (onShowToast) {
            onShowToast(`Rule ${r.code} (${r.name}) ${newState ? 'Enabled' : 'Disabled'}`);
          }
          return { ...r, enabled: newState };
        }
        return r;
      })
    );
  };

  const handleWeightChange = (id, newWeight) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, weight: parseInt(newWeight, 10) } : r))
    );
  };

  const handleDeployAndReanalyze = () => {
    const updated = transactions.map((t) => {
      const activeMatches = rules.filter((r) => r.enabled && r.check(t));
      const triggeredFlags = activeMatches.map((r) => r.name);
      const extraProb = activeMatches.reduce((sum, r) => sum + (r.weight * 0.08), 0);
      const baseProb = t.fraudProbability || 1.0;
      const newProb = Math.min(99.9, Math.max(0.5, Math.round((baseProb + extraProb) * 10) / 10));
      const newRisk = newProb >= 70.0 ? 'High Risk' : newProb >= 40.0 ? 'Medium Risk' : 'Low Risk';
      const newStatus = newRisk === 'High Risk' && t.status === 'Approved' ? 'Blocked' : t.status;

      return {
        ...t,
        anomalyFlags: Array.from(new Set([...(t.anomalyFlags || []), ...triggeredFlags])),
        fraudProbability: newProb,
        risk: newRisk,
        status: newStatus
      };
    });

    if (onUpdateAllTransactions) {
      onUpdateAllTransactions(updated, 'Heuristic Rules Re-evaluation');
    } else if (onShowToast) {
      onShowToast(`Re-analyzed ${transactions.length} transactions with deployed rule weights.`);
    }
  };

  return (
    <div className="rules-container">
      {/* 1. Top Summary Banner */}
      <div className="telemetry-banner">
        <div className="telemetry-stream-status">
          <div className="telemetry-pill-active">
            <span className="pulse-dot"></span>
            <span>HEURISTIC RULE ENGINE ACTIVE</span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--carbon-text-secondary)' }}>
            4 core heuristic rules actively cross-indexing {transactions.length} live transactions
            {activeDataset && ` from "${activeDataset.name}"`}
          </span>
        </div>
        <button
          type="button"
          className="btn-test-action"
          onClick={handleDeployAndReanalyze}
          title="Re-run heuristic checks on all active transactions and broadcast updated risk telemetry across every tab"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sync</span>
          <span>Deploy Weights & Re-Analyze All Tabs</span>
        </button>
      </div>

      {/* 2. Main 2-Column Grid: Rule Cards & Live Matches */}
      <div className="rules-layout-grid">
        {/* Left: 4 Clear Rule Cards */}
        <div className="rules-list">
          {rules.map((rule) => {
            const matches = ruleMatches[rule.id] || [];
            return (
              <div
                key={rule.id}
                className="carbon-rule-card"
                style={{ opacity: rule.enabled ? 1 : 0.6 }}
              >
                <div className="rule-card-header">
                  <div className="rule-meta-left">
                    <span className="risk-badge risk-high">{rule.code}</span>
                    <span style={{ fontSize: '11px', color: 'var(--carbon-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                      {matches.length} Transactions Matched
                    </span>
                  </div>
                  <div className="rule-meta-right">
                    <label className="carbon-toggle">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => handleToggle(rule.id)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div>
                  <div className="rule-title">{rule.name}</div>
                  <div className="rule-description">{rule.desc}</div>
                </div>

                {/* Slider */}
                <div className="rule-slider-wrapper">
                  <span className="rule-slider-label">Sensitivity Weight</span>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={rule.weight}
                    onChange={(e) => handleWeightChange(rule.id, e.target.value)}
                    className="rule-range-input"
                    disabled={!rule.enabled}
                  />
                  <span className="rule-weight-display">{rule.weight} / 100</span>
                </div>

                {/* Matching Transactions Preview */}
                {matches.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--carbon-text-muted)', borderTop: '1px solid var(--carbon-border-subtle)', paddingTop: '6px' }}>
                    <span>
                      Matching IDs: {matches.slice(0, 3).map(m => m.id).join(', ')}
                      {matches.length > 3 && ` (+${matches.length - 3} more)`}
                    </span>
                    <button
                      type="button"
                      style={{ background: 'transparent', border: 'none', color: 'var(--carbon-blue)', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                      onClick={() => onNavigateToTab && onNavigateToTab('TRANSACTIONS')}
                    >
                      View in Live Feed →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: Model Topology & Global Importance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* ML Telemetry Card */}
          <div className="carbon-panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <span className="panel-title">Machine Learning Architecture</span>
                <span className="panel-subtitle">Trained on Real & Synthetic Telemetry</span>
              </div>
              <span className="panel-header-badge badge-secondary">Random Forest</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--carbon-border-subtle)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--carbon-text-muted)' }}>Primary Classifier:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>Random Forest (100 Trees)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--carbon-border-subtle)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--carbon-text-muted)' }}>Inference Latency:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--carbon-green)' }}>18.2 ms</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid var(--carbon-border-subtle)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--carbon-text-muted)' }}>Precision Rate:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--carbon-cyan)' }}>99.14%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--carbon-text-muted)' }}>Active Scored Transactions:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--carbon-text-primary)' }}>{transactions.length}</span>
              </div>
            </div>
          </div>

          {/* Quick Feature Ranking */}
          <div className="carbon-panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <span className="panel-title">Feature Importance Weights</span>
                <span className="panel-subtitle">Top signals driving fraud score</span>
              </div>
              <span className="material-symbols-outlined" style={{ color: 'var(--carbon-cyan)' }}>psychology</span>
            </div>

            <div className="shap-features-list">
              <div className="shap-item">
                <div className="shap-item-top">
                  <span className="shap-feature-name">Origin Balance Drainage</span>
                  <span className="shap-weight-val">38.4%</span>
                </div>
                <div className="vector-progress-track">
                  <div className="vector-progress-fill fill-red" style={{ width: '38.4%' }}></div>
                </div>
              </div>

              <div className="shap-item">
                <div className="shap-item-top">
                  <span className="shap-feature-name">Transaction Amount Size</span>
                  <span className="shap-weight-val">26.2%</span>
                </div>
                <div className="vector-progress-track">
                  <div className="vector-progress-fill fill-cyan" style={{ width: '26.2%' }}></div>
                </div>
              </div>

              <div className="shap-item">
                <div className="shap-item-top">
                  <span className="shap-feature-name">Off-Peak Night Time (Hour)</span>
                  <span className="shap-weight-val">18.5%</span>
                </div>
                <div className="vector-progress-track">
                  <div className="vector-progress-fill fill-blue" style={{ width: '18.5%' }}></div>
                </div>
              </div>

              <div className="shap-item">
                <div className="shap-item-top">
                  <span className="shap-feature-name">Recipient Balance Zero Anomaly</span>
                  <span className="shap-weight-val">16.9%</span>
                </div>
                <div className="vector-progress-track">
                  <div className="vector-progress-fill fill-green" style={{ width: '16.9%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetectionRulesView;

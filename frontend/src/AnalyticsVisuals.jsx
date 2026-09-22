import React, { useMemo } from 'react';

const AnalyticsVisuals = ({ transactions = [] }) => {
  // Compute dynamic live statistics directly from the current transactions state
  const liveStats = useMemo(() => {
    const types = ['TRANSFER', 'CASH_OUT', 'PAYMENT', 'CASH_IN', 'DEBIT'];

    const typeMetrics = types.map((t) => {
      const matching = transactions.filter((tx) => tx.type === t);
      const fraudMatching = matching.filter((tx) => tx.risk === 'High Risk');
      const totalCount = matching.length;
      const fraudCount = fraudMatching.length;
      const totalVolume = matching.reduce((acc, tx) => acc + (tx.amount || 0), 0);
      const fraudVolume = fraudMatching.reduce((acc, tx) => acc + (tx.amount || 0), 0);
      const fraudRate = totalCount > 0 ? ((fraudCount / totalCount) * 100).toFixed(1) : "0.0";

      return {
        type: t,
        totalCount,
        fraudCount,
        totalVolume,
        fraudVolume,
        fraudRate: parseFloat(fraudRate)
      };
    });

    // 24-hour cycle distribution based on step % 24
    const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => {
      const matchingHour = transactions.filter((tx) => (tx.step % 24) === hour);
      const fraudHour = matchingHour.filter((tx) => tx.risk === 'High Risk');
      return {
        hour,
        label: `${hour.toString().padStart(2, '0')}:00`,
        total: matchingHour.length,
        fraud: fraudHour.length,
        isNight: hour >= 0 && hour <= 5
      };
    });

    const totalVolume = transactions.reduce((acc, tx) => acc + (tx.amount || 0), 0) || 1;
    const highRiskTxns = transactions.filter((tx) => tx.risk === 'High Risk');
    const medRiskTxns = transactions.filter((tx) => tx.risk === 'Medium Risk');
    const lowRiskTxns = transactions.filter((tx) => tx.risk === 'Low Risk');

    const highVolume = highRiskTxns.reduce((acc, tx) => acc + (tx.amount || 0), 0);
    const medVolume = medRiskTxns.reduce((acc, tx) => acc + (tx.amount || 0), 0);
    const lowVolume = lowRiskTxns.reduce((acc, tx) => acc + (tx.amount || 0), 0);

    // 1. Model Confidence Bins (Histogram: 0-20%, 20-40%, 40-60%, 60-80%, 80-100%)
    const confidenceBins = [
      { range: '0% - 20%', min: 0, max: 20, label: 'Safe / Normal', color: '#10b981' },
      { range: '20% - 40%', min: 20, max: 40, label: 'Low Suspicion', color: '#34d399' },
      { range: '40% - 60%', min: 40, max: 60, label: 'Moderate Risk', color: '#f59e0b' },
      { range: '60% - 80%', min: 60, max: 80, label: 'Elevated Risk', color: '#fb923c' },
      { range: '80% - 100%', min: 80, max: 100, label: 'Critical Fraud', color: '#ef4444' }
    ].map((bin) => {
      const matching = transactions.filter((t) => (t.fraudProbability || 0) >= bin.min && (t.fraudProbability || 0) <= bin.max);
      const volume = matching.reduce((sum, t) => sum + (t.amount || 0), 0);
      return {
        ...bin,
        count: matching.length,
        volume,
        pct: transactions.length > 0 ? Math.round((matching.length / transactions.length) * 100) : 0
      };
    });

    // 2. Time-of-Day Risk Quadrants (4 Windows)
    const quadrants = [
      { id: 'night', label: 'Night Drainage (00:00 - 06:00)', filter: (t) => (t.step % 24) >= 0 && (t.step % 24) < 6, badge: 'OFF-PEAK', badgeClass: 'threat-tag-red' },
      { id: 'morning', label: 'Morning Banking (06:00 - 12:00)', filter: (t) => (t.step % 24) >= 6 && (t.step % 24) < 12, badge: 'COMMERCIAL', badgeClass: 'threat-tag-cyan' },
      { id: 'afternoon', label: 'Afternoon Retail (12:00 - 18:00)', filter: (t) => (t.step % 24) >= 12 && (t.step % 24) < 18, badge: 'STANDARD', badgeClass: 'threat-tag-cyan' },
      { id: 'evening', label: 'Evening P2P (18:00 - 24:00)', filter: (t) => (t.step % 24) >= 18 && (t.step % 24) < 24, badge: 'CONSUMER', badgeClass: 'threat-tag-cyan' }
    ].map((q) => {
      const matching = transactions.filter(q.filter);
      const fraudCount = matching.filter(t => t.risk === 'High Risk').length;
      const volume = matching.reduce((sum, t) => sum + (t.amount || 0), 0);
      const fraudRate = matching.length > 0 ? ((fraudCount / matching.length) * 100).toFixed(1) : '0.0';
      return {
        ...q,
        count: matching.length,
        fraudCount,
        volume,
        fraudRate: parseFloat(fraudRate)
      };
    });

    // 3. Balance Depletion: 100% Complete Drainage vs Partial Balance Retained
    const drainedTxns = transactions.filter(t => t.oldbalanceOrg > 0 && t.newbalanceOrig === 0);
    const retainedTxns = transactions.filter(t => t.newbalanceOrig > 0);
    const drainedVolume = drainedTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
    const retainedVolume = retainedTxns.reduce((sum, t) => sum + (t.amount || 0), 0);

    // 4. Detected Anomaly Signals
    const anomalyMap = {
      drainage: drainedTxns.length,
      highAmount: transactions.filter(t => (t.amount || 0) > 150000).length,
      nightTime: transactions.filter(t => (t.step % 24) <= 5).length,
      unverifiedDest: transactions.filter(t => t.newbalanceDest === 0 && (t.type === 'TRANSFER' || t.type === 'CASH_OUT')).length
    };

    const overallFraudRate = transactions.length > 0
      ? ((highRiskTxns.length / transactions.length) * 100).toFixed(1)
      : "0.0";

    const maxAmount = Math.max(...transactions.map(t => t.amount || 0), 350000);

    return {
      typeMetrics,
      hourlyDistribution,
      totalCount: transactions.length,
      totalVolume,
      highVolume,
      medVolume,
      lowVolume,
      highCount: highRiskTxns.length,
      medCount: medRiskTxns.length,
      lowCount: lowRiskTxns.length,
      overallFraudRate,
      confidenceBins,
      quadrants,
      drainedTxnsCount: drainedTxns.length,
      drainedVolume,
      retainedTxnsCount: retainedTxns.length,
      retainedVolume,
      anomalyMap,
      maxAmount
    };
  }, [transactions]);

  const maxTypeCount = Math.max(...liveStats.typeMetrics.map((m) => m.totalCount), 1);
  const maxHourlyCount = Math.max(...liveStats.hourlyDistribution.map((h) => Math.max(h.total, h.fraud)), 1);
  const maxBinCount = Math.max(...liveStats.confidenceBins.map(b => b.count), 1);

  return (
    <div className="analytics-shell">
      {/* 1. Live Telemetry Hero Header */}
      <div className="analytics-hero">
        <div className="analytics-hero-text">
          <div className="hero-tag">REAL-TIME DATA STREAM VISUALIZATION</div>
          <h2>Live Behavioral Analytics & Distribution</h2>
          <p>
            Dynamically rendered from {liveStats.totalCount} active transactions. Whenever a new transaction is simulated, imported, or updated, all visualizations recalculate in real-time.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="telemetry-pill-active">
            <span className="pulse-dot"></span>
            <span>AUTO-SYNCED TO LIVE STREAM</span>
          </div>
        </div>
      </div>

      {/* 2. Top Metric Ticker Cards */}
      <div className="kpi-row-grid">
        <div className="carbon-kpi-card">
          <span className="kpi-card-title">Live Transactions</span>
          <span className="kpi-card-value">{liveStats.totalCount}</span>
          <span className="kpi-sub-label">Flowing through active stream</span>
        </div>

        <div className="carbon-kpi-card">
          <span className="kpi-card-title" style={{ color: 'var(--carbon-red)' }}>Stream Fraud Rate</span>
          <span className="kpi-card-value val-red">
            {liveStats.overallFraudRate}%
          </span>
          <span className="kpi-sub-label">{liveStats.highCount} high-risk flags</span>
        </div>

        <div className="carbon-kpi-card">
          <span className="kpi-card-title">Flagged Capital Exposure</span>
          <span className="kpi-card-value val-cyan">
            ${liveStats.highVolume.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <span className="kpi-sub-label">High-risk capital quarantined</span>
        </div>

        <div className="carbon-kpi-card">
          <span className="kpi-card-title">Approved Clean Capital</span>
          <span className="kpi-card-value val-green">
            ${liveStats.lowVolume.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <span className="kpi-sub-label">{liveStats.lowCount} verified transactions</span>
        </div>
      </div>

      {/* 3. Row 1: Fraud Rate by Type & 24-Hour Velocity */}
      <div className="dynamic-charts-grid">
        {/* Chart 1: Fraud Rate by Transaction Type */}
        <div className="dynamic-chart-card">
          <div className="chart-header">
            <div>
              <span className="visual-category">Instrument Breakdown</span>
              <h3>Fraud Rate by Transaction Type</h3>
            </div>
          </div>

          <div className="svg-chart-container" style={{ width: '100%', height: '220px' }}>
            <svg viewBox="0 0 540 220" style={{ width: '100%', height: '100%' }}>
              {[0, 25, 50, 75, 100].map((pct, idx) => {
                const y = 180 - (pct / 100) * 150;
                return (
                  <g key={idx}>
                    <line x1="45" y1={y} x2="520" y2={y} stroke="#1f2937" strokeDasharray="3 3" />
                    <text x="38" y={y + 4} fill="#8d90a0" fontSize="10" textAnchor="end" fontFamily="var(--font-mono)">
                      {pct}%
                    </text>
                  </g>
                );
              })}

              {liveStats.typeMetrics.map((item, idx) => {
                const barGroupX = 65 + idx * 95;
                const rateHeight = (item.fraudRate / 100) * 150;
                const rateY = 180 - rateHeight;

                const totalBarHeight = (item.totalCount / maxTypeCount) * 150;
                const totalY = 180 - totalBarHeight;

                return (
                  <g key={item.type}>
                    <rect
                      x={barGroupX}
                      y={totalY}
                      width="22"
                      height={Math.max(4, totalBarHeight)}
                      fill="#0f62fe"
                      rx="3"
                      opacity="0.35"
                    />
                    <rect
                      x={barGroupX + 26}
                      y={rateY}
                      width="22"
                      height={Math.max(4, rateHeight)}
                      fill={item.fraudRate >= 50 ? "#ef4444" : item.fraudRate > 0 ? "#f59e0b" : "#10b981"}
                      rx="3"
                    />
                    <text
                      x={barGroupX + 37}
                      y={Math.min(170, rateY - 6)}
                      fill={item.fraudRate > 0 ? "#ffb4ab" : "#6ee7b7"}
                      fontSize="10"
                      fontWeight="bold"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                    >
                      {item.fraudRate}%
                    </text>
                    <text
                      x={barGroupX + 24}
                      y="198"
                      fill="#c3c6d7"
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                    >
                      {item.type}
                    </text>
                    <text
                      x={barGroupX + 24}
                      y="212"
                      fill="#8d90a0"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                    >
                      ({item.totalCount} tx)
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: "#0f62fe", opacity: 0.6 }}></span>
              <span>Total Transactions Count</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: "#ef4444" }}></span>
              <span>Fraud Rate (%)</span>
            </div>
          </div>
        </div>

        {/* Chart 2: 24-Hour Hourly Fraud Velocity */}
        <div className="dynamic-chart-card">
          <div className="chart-header">
            <div>
              <span className="visual-category">Temporal Dynamics</span>
              <h3>24-Hour Hourly Fraud Velocity (step % 24)</h3>
            </div>
          </div>

          <div className="svg-chart-container" style={{ width: '100%', height: '220px' }}>
            <svg viewBox="0 0 540 220" style={{ width: '100%', height: '100%' }}>
              <rect x="45" y="25" width="115" height="155" fill="rgba(239, 68, 68, 0.08)" rx="4" />
              <text x="102" y="40" fill="#ffb4ab" fontSize="9" fontWeight="bold" fontFamily="var(--font-mono)" textAnchor="middle">
                🌙 NIGHT DRAINAGE ZONE
              </text>

              {[0, 1, 2, 3, 4].map((stepVal, idx) => {
                const y = 180 - (idx / 4) * 150;
                const labelVal = Math.round((idx / 4) * maxHourlyCount);
                return (
                  <g key={idx}>
                    <line x1="45" y1={y} x2="520" y2={y} stroke="#1f2937" strokeDasharray="3 3" />
                    <text x="38" y={y + 4} fill="#8d90a0" fontSize="10" textAnchor="end" fontFamily="var(--font-mono)">
                      {labelVal}
                    </text>
                  </g>
                );
              })}

              <path
                d={`M 45 180 ${liveStats.hourlyDistribution.map((h, i) => {
                  const x = 50 + i * 20;
                  const y = 180 - (h.fraud / maxHourlyCount) * 150;
                  return `L ${x} ${y}`;
                }).join(' ')} L 510 180 Z`}
                fill="rgba(239, 68, 68, 0.15)"
              />

              <path
                d={`M ${liveStats.hourlyDistribution.map((h, i) => {
                  const x = 50 + i * 20;
                  const y = 180 - (h.fraud / maxHourlyCount) * 150;
                  return `${i === 0 ? '' : 'L'} ${x} ${y}`;
                }).join(' ')}`}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.5"
              />

              {liveStats.hourlyDistribution.map((h, i) => {
                const x = 50 + i * 20;
                const y = 180 - (h.fraud / maxHourlyCount) * 150;
                return (
                  <g key={i}>
                    <circle
                      cx={x}
                      cy={y}
                      r={h.fraud > 0 ? "4" : "2"}
                      fill={h.fraud > 0 ? "#ef4444" : "#8d90a0"}
                      stroke="#0b0f17"
                      strokeWidth="1.5"
                    />
                    {i % 4 === 0 && (
                      <text x={x} y="198" fill="#8d90a0" fontSize="9" textAnchor="middle" fontFamily="var(--font-mono)">
                        {h.hour}:00
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: "#ef4444" }}></span>
              <span>Flagged High-Risk Cases by Hour</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: "rgba(239, 68, 68, 0.3)" }}></span>
              <span>Off-Peak Vulnerability Window (00:00 - 05:00)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Row 2: NEW USEFUL VISUALS (Amount vs Risk Scatter Matrix & Model Confidence Bins) */}
      <div className="dynamic-charts-grid">
        {/* NEW VISUAL 1: Transaction Amount ($) vs Fraud Probability (%) Scatter Matrix */}
        <div className="dynamic-chart-card">
          <div className="chart-header">
            <div>
              <span className="visual-category">Correlation Telemetry</span>
              <h3>Amount ($) vs. Fraud Probability (%) Matrix</h3>
            </div>
          </div>

          <div className="svg-chart-container" style={{ width: '100%', height: '220px' }}>
            <svg viewBox="0 0 540 220" style={{ width: '100%', height: '100%' }}>
              {/* Background Zones */}
              <rect x="50" y="25" width="470" height="60" fill="rgba(239, 68, 68, 0.06)" />
              <text x="510" y="42" fill="#ef4444" fontSize="8" fontWeight="bold" fontFamily="var(--font-mono)" textAnchor="end">
                CRITICAL THREAT ZONE (&gt;80%)
              </text>

              {/* Y Axis Gridlines (0%, 25%, 50%, 75%, 100%) */}
              {[0, 25, 50, 75, 100].map((prob, idx) => {
                const y = 180 - (prob / 100) * 150;
                return (
                  <g key={idx}>
                    <line x1="50" y1={y} x2="520" y2={y} stroke="#1f2937" strokeDasharray="3 3" />
                    <text x="44" y={y + 4} fill="#8d90a0" fontSize="9" textAnchor="end" fontFamily="var(--font-mono)">
                      {prob}%
                    </text>
                  </g>
                );
              })}

              {/* Threshold 50% line */}
              <line x1="50" y1="105" x2="520" y2="105" stroke="#f59e0b" strokeDasharray="4 4" opacity="0.4" />

              {/* Scatter Points from active transactions */}
              {transactions.map((tx) => {
                const clampedAmt = Math.min(tx.amount || 0, liveStats.maxAmount);
                const x = 55 + (clampedAmt / liveStats.maxAmount) * 455;
                const prob = tx.fraudProbability || 0;
                const y = 180 - (prob / 100) * 150;
                const isHigh = tx.risk === 'High Risk';
                const isMed = tx.risk === 'Medium Risk';
                const fillColor = isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#10b981';

                return (
                  <g key={tx.id}>
                    <circle
                      cx={x}
                      cy={y}
                      r={isHigh ? "6" : "4.5"}
                      fill={fillColor}
                      stroke="#0b0f17"
                      strokeWidth="1.5"
                      opacity="0.88"
                    />
                    <title>{`${tx.id} | $${tx.amount.toLocaleString()} | Prob: ${tx.fraudProbability}% | ${tx.risk}`}</title>
                  </g>
                );
              })}

              {/* X Axis Amount labels */}
              <text x="55" y="200" fill="#8d90a0" fontSize="9" fontFamily="var(--font-mono)">$0</text>
              <text x="280" y="200" fill="#8d90a0" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">
                ${Math.round(liveStats.maxAmount / 2).toLocaleString()}
              </text>
              <text x="510" y="200" fill="#8d90a0" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">
                ${liveStats.maxAmount.toLocaleString()}
              </text>
            </svg>
          </div>

          <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: "#ef4444" }}></span>
              <span>High Risk (&gt;80%)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: "#f59e0b" }}></span>
              <span>Medium Risk (40-80%)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: "#10b981" }}></span>
              <span>Low Risk (&lt;40%)</span>
            </div>
          </div>
        </div>

        {/* NEW VISUAL 2: Model Confidence Score Calibration Histogram */}
        <div className="dynamic-chart-card">
          <div className="chart-header">
            <div>
              <span className="visual-category">Model Confidence</span>
              <h3>Prediction Score Calibration Distribution</h3>
            </div>
          </div>

          <div className="svg-chart-container" style={{ width: '100%', height: '220px' }}>
            <svg viewBox="0 0 540 220" style={{ width: '100%', height: '100%' }}>
              {liveStats.confidenceBins.map((bin, idx) => {
                const barX = 60 + idx * 95;
                const barHeight = (bin.count / maxBinCount) * 135;
                const barY = 175 - barHeight;

                return (
                  <g key={bin.range}>
                    <line x1="45" y1="175" x2="520" y2="175" stroke="#1f2937" />

                    <rect
                      x={barX}
                      y={barY}
                      width="45"
                      height={Math.max(4, barHeight)}
                      fill={bin.color}
                      rx="3"
                      opacity="0.85"
                    />

                    <text
                      x={barX + 22.5}
                      y={Math.min(165, barY - 6)}
                      fill="#f9fafb"
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                    >
                      {bin.count}
                    </text>

                    <text
                      x={barX + 22.5}
                      y="192"
                      fill="#c3c6d7"
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                    >
                      {bin.range}
                    </text>

                    <text
                      x={barX + 22.5}
                      y="206"
                      fill="#8d90a0"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                    >
                      {bin.pct}%
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--carbon-text-muted)', paddingTop: '4px', borderTop: '1px solid var(--carbon-border-subtle)', fontFamily: 'var(--font-mono)' }}>
            <span>Verified Legitimate</span>
            <span>Bifurcated Inference</span>
            <span>Definitive Fraud Intercept</span>
          </div>
        </div>
      </div>

      {/* 5. Row 3: Time-of-Day Quadrants & Origin Balance Drainage Ratio */}
      <div className="dynamic-charts-grid">
        {/* NEW VISUAL 3: Time-of-Day Risk Quadrants */}
        <div className="dynamic-chart-card">
          <div className="chart-header">
            <div>
              <span className="visual-category">Temporal Risk Quadrants</span>
              <h3>Time-of-Day Threat Exposure</h3>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {liveStats.quadrants.map((q) => (
              <div
                key={q.id}
                style={{
                  background: 'var(--carbon-surface-container)',
                  border: '1px solid var(--carbon-border-subtle)',
                  borderRadius: '4px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--carbon-text-primary)' }}>
                    {q.label.split(' ')[0]} {q.label.split(' ')[1]}
                  </span>
                  <span className={`threat-tag ${q.badgeClass}`}>{q.badge}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 'bold', color: q.fraudCount > 0 ? 'var(--carbon-red)' : 'var(--carbon-text-primary)' }}>
                    ${q.volume.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: q.fraudCount > 0 ? 'var(--carbon-red)' : 'var(--carbon-green)', fontWeight: 'bold' }}>
                    {q.fraudRate}% Fraud
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--carbon-text-muted)' }}>
                  {q.count} transactions • {q.fraudCount} high risk flags
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* NEW VISUAL 4: Origin Account Balance Depletion vs Retention */}
        <div className="dynamic-chart-card">
          <div className="chart-header">
            <div>
              <span className="visual-category">Balance Drainage Analytics</span>
              <h3>Complete Account Drainage vs. Retention</h3>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', backgroundColor: 'var(--carbon-surface-container-highest)' }}>
              <div
                style={{
                  width: `${liveStats.totalVolume > 0 ? (liveStats.drainedVolume / liveStats.totalVolume) * 100 : 0}%`,
                  backgroundColor: 'var(--carbon-red)'
                }}
                title={`Drained Volume: $${liveStats.drainedVolume.toLocaleString()}`}
              ></div>
              <div
                style={{
                  width: `${liveStats.totalVolume > 0 ? (liveStats.retainedVolume / liveStats.totalVolume) * 100 : 100}%`,
                  backgroundColor: 'var(--carbon-blue)'
                }}
                title={`Retained Volume: $${liveStats.retainedVolume.toLocaleString()}`}
              ></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: 'var(--carbon-surface-container)', padding: '12px', borderRadius: '4px', border: '1px solid var(--carbon-border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--carbon-red)', fontWeight: 'bold' }}>
                  <span className="legend-dot" style={{ backgroundColor: '#ef4444' }}></span>
                  <span>100% Drainage ($0 Left)</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 'bold', color: 'var(--carbon-red)', marginTop: '4px' }}>
                  ${liveStats.drainedVolume.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--carbon-text-muted)', marginTop: '2px' }}>
                  {liveStats.drainedTxnsCount} accounts completely wiped
                </div>
              </div>

              <div style={{ background: 'var(--carbon-surface-container)', padding: '12px', borderRadius: '4px', border: '1px solid var(--carbon-border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--carbon-blue)', fontWeight: 'bold' }}>
                  <span className="legend-dot" style={{ backgroundColor: '#0f62fe' }}></span>
                  <span>Partial Balance Retained</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 'bold', color: 'var(--carbon-text-primary)', marginTop: '4px' }}>
                  ${liveStats.retainedVolume.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--carbon-text-muted)', marginTop: '2px' }}>
                  {liveStats.retainedTxnsCount} standard commercial spends
                </div>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--carbon-text-secondary)', background: 'var(--carbon-surface-container-high)', padding: '8px 12px', borderRadius: '4px' }}>
              💡 <strong>Key ML Discovery:</strong> 100% balance drainage is the single strongest indicator of account compromise in the Random Forest feature attribution matrix.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsVisuals;

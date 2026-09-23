import React, { useState, useMemo, useEffect } from 'react';

const EntityDossierView = ({
  transactions = [],
  activeDataset,
  onUpdateStatus,
  onSelectTxn,
  onShowToast
}) => {
  // Extract unique entities (accounts) from transactions
  const entities = useMemo(() => {
    const map = new Map();

    transactions.forEach((t) => {
      // Process sender
      if (!map.has(t.sender)) {
        map.set(t.sender, {
          id: t.sender,
          type: 'Origin Account',
          transactions: [],
          totalSent: 0,
          totalReceived: 0,
          highestRisk: 'Low Risk',
          maxProbability: 0,
          status: 'Active'
        });
      }
      const senderObj = map.get(t.sender);
      senderObj.transactions.push(t);
      senderObj.totalSent += t.amount || 0;
      if ((t.fraudProbability || 0) > senderObj.maxProbability) {
        senderObj.maxProbability = t.fraudProbability || 0;
        senderObj.highestRisk = t.risk;
      }
      if (t.status === 'Blocked') senderObj.status = 'Frozen';

      // Process recipient
      if (!map.has(t.recipient)) {
        map.set(t.recipient, {
          id: t.recipient,
          type: 'Destination Account',
          transactions: [],
          totalSent: 0,
          totalReceived: 0,
          highestRisk: 'Low Risk',
          maxProbability: 0,
          status: 'Active'
        });
      }
      const recObj = map.get(t.recipient);
      recObj.transactions.push(t);
      recObj.totalReceived += t.amount || 0;
      if ((t.fraudProbability || 0) > recObj.maxProbability) {
        recObj.maxProbability = t.fraudProbability || 0;
        recObj.highestRisk = t.risk;
      }
      if (t.status === 'Blocked') recObj.status = 'Frozen';
    });

    return Array.from(map.values()).sort((a, b) => b.maxProbability - a.maxProbability);
  }, [transactions]);

  // Selected Entity state (defaults to highest risk entity)
  const [selectedEntityId, setSelectedEntityId] = useState(entities[0]?.id || '');

  // Automatically sync to highest risk entity if selected entity is not in active dataset
  useEffect(() => {
    if (entities.length > 0) {
      const exists = entities.some((e) => e.id === selectedEntityId);
      if (!exists) {
        setSelectedEntityId(entities[0].id);
      }
    }
  }, [entities, selectedEntityId]);

  const activeEntity = useMemo(() => {
    return entities.find((e) => e.id === selectedEntityId) || entities[0] || null;
  }, [entities, selectedEntityId]);

  // Find counterparties linked to activeEntity
  const linkedCounterparties = useMemo(() => {
    if (!activeEntity) return [];
    const counterparties = new Set();
    activeEntity.transactions.forEach((t) => {
      if (t.sender === activeEntity.id) counterparties.add(t.recipient);
      if (t.recipient === activeEntity.id) counterparties.add(t.sender);
    });
    return Array.from(counterparties);
  }, [activeEntity]);

  const handleFreezeAll = () => {
    if (!activeEntity) return;
    activeEntity.transactions.forEach((t) => {
      onUpdateStatus(t.id, 'Blocked');
    });
    if (onShowToast) {
      onShowToast(`Froze all ${activeEntity.transactions.length} transactions associated with ${activeEntity.id}`);
    }
  };

  const handleApproveAll = () => {
    if (!activeEntity) return;
    activeEntity.transactions.forEach((t) => {
      onUpdateStatus(t.id, 'Approved');
    });
    if (onShowToast) {
      onShowToast(`Approved all transactions associated with ${activeEntity.id}`);
    }
  };

  if (!activeEntity) {
    return (
      <div className="carbon-panel" style={{ textAlign: 'center', padding: '40px' }}>
        No entity data available. Please add transactions to view network intelligence.
      </div>
    );
  }

  const isHighRisk = activeEntity.highestRisk === 'High Risk';
  const isMedRisk = activeEntity.highestRisk === 'Medium Risk';

  return (
    <div className="dossier-container">
      {/* 1. Entity Header & Selector */}
      <div className="dossier-hero">
        <div className="dossier-hero-header">
          <div className="dossier-target-info">
            <div className={`dossier-target-icon ${isHighRisk ? '' : 'icon-cyan'}`} style={{ backgroundColor: isHighRisk ? 'var(--carbon-red-container)' : 'var(--carbon-surface-container-high)', color: isHighRisk ? 'var(--carbon-red)' : 'var(--carbon-cyan)' }}>
              <span className="material-symbols-outlined">hub</span>
            </div>
            <div className="dossier-target-titles">
              <div className="dossier-target-name">
                <span style={{ fontFamily: 'var(--font-mono)' }}>{activeEntity.id}</span>
                <span className={`risk-badge ${isHighRisk ? 'risk-high' : isMedRisk ? 'risk-medium' : 'risk-low'}`}>
                  {activeEntity.highestRisk} ({activeEntity.maxProbability}%)
                </span>
                {activeEntity.status === 'Frozen' && (
                  <span className="status-badge status-blocked">FROZEN</span>
                )}
              </div>
              <div className="dossier-target-meta">
                <span>Account Role: {activeEntity.type}</span>
                <span>•</span>
                <span>Linked Transactions: {activeEntity.transactions.length}</span>
                <span>•</span>
                <span>Total Volume: ${(activeEntity.totalSent + activeEntity.totalReceived).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                {activeDataset && (
                  <>
                    <span>•</span>
                    <span style={{ color: 'var(--carbon-cyan)' }}>Dataset: {activeDataset.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="dossier-actions-bar">
            <button
              type="button"
              className="btn-threat-freeze"
              onClick={handleFreezeAll}
              title="Block all transactions for this account"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>block</span>
              <span>Freeze Account Transactions</span>
            </button>
            <button
              type="button"
              className="btn-bulk-approve"
              onClick={handleApproveAll}
              title="Approve all transactions for this account"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>verified</span>
              <span>Approve All</span>
            </button>
          </div>
        </div>

        {/* Quick Entity Selector Chips & Full Account Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid var(--carbon-border-subtle)', paddingTop: '10px' }}>
          <span style={{ fontSize: '11px', color: 'var(--carbon-text-muted)', fontWeight: 'bold' }}>TOP ENTITIES:</span>
          {entities.slice(0, 6).map((entity) => {
            const isSelected = entity.id === activeEntity.id;
            return (
              <button
                key={entity.id}
                type="button"
                className={`filter-pill-btn ${isSelected ? 'active' : ''}`}
                style={{ fontFamily: 'var(--font-mono)' }}
                onClick={() => setSelectedEntityId(entity.id)}
              >
                <span>{entity.id}</span>
                <span className={`filter-pill-count ${entity.highestRisk === 'High Risk' ? 'critical' : ''}`}>
                  {entity.maxProbability}%
                </span>
              </button>
            );
          })}

          {entities.length > 6 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
              <span style={{ fontSize: '11px', color: 'var(--carbon-text-muted)', fontWeight: 'bold' }}>
                All Accounts ({entities.length}):
              </span>
              <select
                value={activeEntity.id}
                onChange={(e) => setSelectedEntityId(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  background: 'var(--carbon-surface-container)',
                  color: 'var(--carbon-text-primary)',
                  border: '1px solid var(--carbon-border-medium)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id} ({e.highestRisk} • {e.maxProbability}% • {e.transactions.length} txns)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 2. Visual Link Map (Entity -> Counterparties) & Linked Transactions */}
      <div className="dossier-main-grid">
        {/* Left: Black High-Tech Visual Connection Diagram */}
        <div className="carbon-panel counterparty-map-dark" style={{ padding: '0', overflow: 'hidden', backgroundColor: '#090d13', border: '1px solid #1e293b' }}>
          <div style={{ padding: '12px 16px', background: '#111827', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: '#38bdf8', fontSize: '20px' }}>device_hub</span>
              <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f8fafc' }}>
                Counterparty Network Map
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-mono)', background: '#1e293b', padding: '3px 8px', borderRadius: '4px', border: '1px solid #334155' }}>
              {linkedCounterparties.length} Connected Accounts
            </span>
          </div>

          <div className="link-graph-canvas" style={{ height: '340px', backgroundColor: '#090d13', border: 'none' }}>
            {/* Background Grid */}
            <svg className="link-graph-svg" style={{ opacity: 0.22 }}>
              <defs>
                <pattern id="gridPatternDossierClean" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="0.75" fill="#38bdf8" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#gridPatternDossierClean)" />
            </svg>

            {/* Link Lines from Center to Counterparties */}
            <svg className="link-graph-svg">
              {linkedCounterparties.map((_, idx) => {
                const total = linkedCounterparties.length;
                const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
                const radiusPercent = 36;
                const x2 = 50 + radiusPercent * Math.cos(angle);
                const y2 = 50 + radiusPercent * Math.sin(angle);
                return (
                  <line
                    key={idx}
                    x1="50%"
                    y1="50%"
                    x2={`${x2}%`}
                    y2={`${y2}%`}
                    stroke={isHighRisk ? '#ef4444' : '#38bdf8'}
                    strokeWidth="2"
                    strokeDasharray={isHighRisk ? '4 2' : 'none'}
                    style={{ filter: isHighRisk ? 'drop-shadow(0 0 5px rgba(239, 68, 68, 0.8))' : 'drop-shadow(0 0 5px rgba(56, 189, 248, 0.8))' }}
                  />
                );
              })}
            </svg>

            {/* Central Node */}
            <div className="graph-node" style={{ top: '50%', left: '50%' }}>
              <div className={`graph-node-circle ${isHighRisk ? 'node-center' : 'node-escrow'}`}>
                <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>account_circle</span>
              </div>
              <span className="graph-node-label" style={{ borderColor: isHighRisk ? '#ef4444' : '#38bdf8', color: '#ffffff', backgroundColor: '#0f172a' }}>
                {activeEntity.id} (Active)
              </span>
            </div>

            {/* Surrounding Counterparty Nodes */}
            {linkedCounterparties.map((counterpartyId, idx) => {
              const total = linkedCounterparties.length;
              const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
              const radiusPercent = 36;
              const top = 50 + radiusPercent * Math.sin(angle);
              const left = 50 + radiusPercent * Math.cos(angle);
              return (
                <div
                  key={counterpartyId}
                  className="graph-node"
                  style={{ top: `${top}%`, left: `${left}%` }}
                  onClick={() => setSelectedEntityId(counterpartyId)}
                  title={`Click to inspect ${counterpartyId}`}
                >
                  <div className="graph-node-circle node-shell">
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>storefront</span>
                  </div>
                  <span className="graph-node-label">{counterpartyId}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Connected Transactions Table */}
        <div className="carbon-panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <span className="panel-title">Linked Transactions</span>
              <span className="panel-subtitle">Transactions involving {activeEntity.id}</span>
            </div>
            <span className="panel-header-badge badge-secondary">{activeEntity.transactions.length} RECORDS</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
            {activeEntity.transactions.map((txn) => (
              <div
                key={txn.id}
                style={{
                  background: 'var(--carbon-surface-container)',
                  border: '1px solid var(--carbon-border-subtle)',
                  borderRadius: '4px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      className="txn-link"
                      onClick={() => onSelectTxn && onSelectTxn(txn)}
                    >
                      {txn.id}
                    </span>
                    <span className={`risk-badge ${txn.risk === 'High Risk' ? 'risk-high' : txn.risk === 'Medium Risk' ? 'risk-medium' : 'risk-low'}`}>
                      {txn.risk}
                    </span>
                    <span className="type-pill">{txn.type}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--carbon-text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    {txn.sender} → {txn.recipient}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '12px' }}>
                    ${txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <span className="status-badge" style={{ fontSize: '9px' }}>{txn.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EntityDossierView;

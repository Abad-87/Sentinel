import React from 'react';

const TransactionInspectorModal = ({ transaction, onClose, onUpdateStatus, onDeleteTxn }) => {
  if (!transaction) return null;

  const getRiskClass = (risk) => {
    if (risk === 'High Risk') return 'risk-badge risk-high';
    if (risk === 'Medium Risk') return 'risk-badge risk-medium';
    return 'risk-badge risk-low';
  };

  const getStatusClass = (status) => {
    if (status === 'Blocked') return 'status-badge status-blocked';
    if (status === 'Under Review') return 'status-badge status-review';
    return 'status-badge status-approved';
  };

  const balanceDiscrepancy = (
    transaction.oldbalanceOrg - transaction.amount - transaction.newbalanceOrig
  ).toFixed(2);

  return (
    <div className="carbon-modal-backdrop" onClick={onClose}>
      <div className="carbon-modal modal-large" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-tag">L3 FORENSIC AUDIT DOSSIER</span>
            <span className="modal-title" style={{ fontFamily: 'var(--font-mono)' }}>{transaction.id}</span>
            <span className="modal-subtitle">Full behavioral telemetry and feature anomaly decomposition</span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Top Risk & Telemetry Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', background: 'var(--carbon-surface-container)', padding: '14px', borderRadius: '4px', border: '1px solid var(--carbon-border-subtle)' }}>
            <div>
              <span className="kpi-card-title">ML Risk Classification</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span className={getRiskClass(transaction.risk)}>{transaction.risk}</span>
                <span className={getStatusClass(transaction.status)}>{transaction.status}</span>
              </div>
            </div>
            <div>
              <span className="kpi-card-title">Model Confidence</span>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 'bold', color: transaction.risk === 'High Risk' ? 'var(--carbon-red)' : 'var(--carbon-green)', marginTop: '4px' }}>
                {transaction.fraudProbability}%
              </div>
            </div>
            <div>
              <span className="kpi-card-title">Transaction Amount</span>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 'bold', color: 'var(--carbon-text-primary)', marginTop: '4px' }}>
                ${transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Anomaly Signal Flags */}
          <div className="carbon-panel">
            <div className="panel-header">
              <div className="panel-title" style={{ fontSize: '12px' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--carbon-red)', fontSize: '18px' }}>warning</span>
                <span>Triggered Heuristic Anomaly Flags</span>
              </div>
              <span className="panel-header-badge badge-error">
                {transaction.anomalyFlags && transaction.anomalyFlags.length > 0 ? `${transaction.anomalyFlags.length} ANOMALIES` : 'CLEAN'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {transaction.anomalyFlags && transaction.anomalyFlags.length > 0 ? (
                transaction.anomalyFlags.map((flag, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--carbon-surface-container)', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--carbon-border-subtle)', fontSize: '12px', color: 'var(--carbon-text-primary)' }}>
                    <span style={{ color: 'var(--carbon-red)', fontWeight: 'bold' }}>•</span>
                    <span>{flag}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--carbon-green)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
                  <span>No behavioral anomalies detected. Conforms to standard profile.</span>
                </div>
              )}
            </div>
          </div>

          {/* Account Ledger & Discrepancy Decomposition */}
          <div className="carbon-panel">
            <div className="panel-header">
              <span className="panel-title" style={{ fontSize: '12px' }}>Ledger Balance Discrepancy Analysis</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--carbon-text-muted)' }}>
                Step {transaction.step} ({((transaction.step - 1) % 24 + 24) % 24}:00 hrs)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* Origin Account */}
              <div style={{ background: 'var(--carbon-surface-container)', padding: '12px', borderRadius: '4px', border: '1px solid var(--carbon-border-subtle)' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--carbon-text-muted)', fontWeight: 'bold' }}>Origin Account Ledger</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold', color: 'var(--carbon-blue)', margin: '4px 0 8px' }}>
                  {transaction.sender}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--carbon-text-muted)' }}>Old Balance:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>${transaction.oldbalanceOrg.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--carbon-text-muted)' }}>New Balance:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: transaction.newbalanceOrig === 0 ? 'var(--carbon-red)' : 'inherit', fontWeight: transaction.newbalanceOrig === 0 ? 'bold' : 'normal' }}>
                      ${transaction.newbalanceOrig.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--carbon-border-subtle)', paddingTop: '4px', marginTop: '4px' }}>
                    <span style={{ color: 'var(--carbon-text-muted)' }}>Balance Discrepancy:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: parseFloat(balanceDiscrepancy) !== 0 ? 'var(--carbon-amber)' : 'var(--carbon-green)', fontWeight: 'bold' }}>
                      ${balanceDiscrepancy}
                    </span>
                  </div>
                </div>
              </div>

              {/* Destination Account */}
              <div style={{ background: 'var(--carbon-surface-container)', padding: '12px', borderRadius: '4px', border: '1px solid var(--carbon-border-subtle)' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--carbon-text-muted)', fontWeight: 'bold' }}>Destination Account Ledger</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold', color: 'var(--carbon-cyan)', margin: '4px 0 8px' }}>
                  {transaction.recipient}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--carbon-text-muted)' }}>New Dest Balance:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>${transaction.newbalanceDest.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--carbon-text-muted)' }}>Payment Instrument:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{transaction.type}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--carbon-border-subtle)', paddingTop: '4px', marginTop: '4px' }}>
                    <span style={{ color: 'var(--carbon-text-muted)' }}>Destination Anomaly:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: transaction.newbalanceDest === 0 && transaction.amount > 10000 ? 'var(--carbon-red)' : 'var(--carbon-green)' }}>
                      {transaction.newbalanceDest === 0 && transaction.amount > 10000 ? 'Zero Dest Anomaly' : 'Normal'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer with Actions */}
        <div className="modal-footer">
          {onDeleteTxn && (
            <button
              type="button"
              className="btn-modal-delete"
              onClick={() => {
                if (window.confirm(`Are you sure you want to permanently delete transaction record ${transaction.id}?`)) {
                  onDeleteTxn(transaction.id);
                  onClose();
                }
              }}
              title="Permanently delete this transaction record"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
              <span>Delete Record</span>
            </button>
          )}
          <button type="button" className="btn-bulk-action" onClick={onClose}>
            Close
          </button>
          {transaction.status !== 'Blocked' && (
            <button
              type="button"
              className="btn-threat-freeze"
              style={{ padding: '7px 14px' }}
              onClick={() => {
                onUpdateStatus(transaction.id, 'Blocked');
                onClose();
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>block</span>
              <span>Freeze & Quarantine</span>
            </button>
          )}
          {transaction.status !== 'Approved' && (
            <button
              type="button"
              className="btn-bulk-approve"
              style={{ padding: '7px 14px' }}
              onClick={() => {
                onUpdateStatus(transaction.id, 'Approved');
                onClose();
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>verified</span>
              <span>Approve & Release</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionInspectorModal;

const percent = (value) => {
  if (!Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
};

const DealInsightsPanel = ({ insight }) => {
  if (!insight) return null;

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <p className="ai-panel-title">AI Deal Intelligence</p>
        <span className={`ai-chip ${insight.priceEvaluation || 'fair'}`}>{insight.priceEvaluation || 'fair'}</span>
      </div>
      <div className="ai-grid">
        <div className="ai-metric">
          <span>Fast sale</span>
          <strong>Rs {insight?.multiScenarioPricing?.fastSale ?? '--'}</strong>
        </div>
        <div className="ai-metric">
          <span>Balanced</span>
          <strong>Rs {insight?.multiScenarioPricing?.balanced ?? '--'}</strong>
        </div>
        <div className="ai-metric">
          <span>Max profit</span>
          <strong>Rs {insight?.multiScenarioPricing?.maxProfit ?? '--'}</strong>
        </div>
        <div className="ai-metric">
          <span>Close odds</span>
          <strong>{percent(insight?.dealSuccess?.closeProbability)}</strong>
        </div>
        <div className="ai-metric">
          <span>ETA to close</span>
          <strong>{insight?.dealSuccess?.timeToCloseHours ?? insight?.dealSuccess?.etaHours ?? '--'}h</strong>
        </div>
        <div className="ai-metric">
          <span>Momentum</span>
          <strong>{insight?.dealMomentum || '--'}</strong>
        </div>
      </div>
      {Array.isArray(insight?.structuredNegotiationGuidance) && insight.structuredNegotiationGuidance.length > 0 ? (
        <div className="ai-inline-note">
          Negotiation flow: <strong>{insight.structuredNegotiationGuidance.join(' -> ')}</strong>
        </div>
      ) : null}
      {insight?.offerQuality ? (
        <div className="ai-inline-note">
          Offer strength: <strong>{insight.offerQuality.score}/100</strong> ({insight.offerQuality.label})
        </div>
      ) : null}
    </div>
  );
};

export default DealInsightsPanel;

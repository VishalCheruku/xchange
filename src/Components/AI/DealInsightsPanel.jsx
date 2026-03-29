const percent = (value) => {
  if (!Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
};

const formatPrice = (value) => {
  if (!Number.isFinite(value)) return 'Rs -';
  return `Rs ${Math.round(value)}`;
};

const DealInsightsPanel = ({ insight }) => {
  if (!insight) return null;

  // Safely extract pricing values with fallbacks
  const fastSale = insight?.multiScenarioPricing?.fastSale ?? insight?.priceInsights?.strategies?.fastSale;
  const balanced = insight?.multiScenarioPricing?.balanced ?? insight?.priceInsights?.strategies?.balanced;
  const maxProfit = insight?.multiScenarioPricing?.maxProfit ?? insight?.priceInsights?.strategies?.maxProfit;
  const closeProbability = insight?.dealSuccess?.closeProbability;
  const etaHours = insight?.dealSuccess?.timeToCloseHours ?? insight?.dealSuccess?.etaHours;
  const momentum = insight?.dealMomentum;

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <p className="ai-panel-title">AI Deal Intelligence</p>
        <span className={`ai-chip ${insight.priceEvaluation || 'fair'}`}>{insight.priceEvaluation || 'fair'}</span>
      </div>
      <div className="ai-grid">
        <div className="ai-metric">
          <span>Fast sale</span>
          <strong>{formatPrice(fastSale)}</strong>
        </div>
        <div className="ai-metric">
          <span>Balanced</span>
          <strong>{formatPrice(balanced)}</strong>
        </div>
        <div className="ai-metric">
          <span>Max profit</span>
          <strong>{formatPrice(maxProfit)}</strong>
        </div>
        <div className="ai-metric">
          <span>Close odds</span>
          <strong>{percent(closeProbability)}</strong>
        </div>
        <div className="ai-metric">
          <span>ETA to close</span>
          <strong>{Number.isFinite(etaHours) ? `${Math.round(etaHours)}h` : '--'}</strong>
        </div>
        <div className="ai-metric">
          <span>Momentum</span>
          <strong>{momentum || '--'}</strong>
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

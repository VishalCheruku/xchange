const TrustBanner = ({ insight }) => {
  if (!insight) return null;

  const toneClass =
    insight.riskAlert === 'High trust interaction'
      ? 'safe'
      : insight.riskAlert === 'Proceed with caution'
        ? 'warn'
        : 'mid';

  const warningList = Array.isArray(insight.warnings) ? insight.warnings.slice(0, 2) : [];

  return (
    <div className={`ai-trust-banner ${toneClass}`}>
      <div className="ai-trust-top">
        <span className="ai-trust-score">Trust {insight.trustScore ?? '--'}/100</span>
        <span className="ai-trust-confidence">
          Truth confidence {insight.truthConfidence ?? insight.truthConfidenceScore ?? '--'}%
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={`ai-mini-chip ${insight.trustBadge || 'fair'}`}>Trust {insight.trustBadge || 'medium'}</span>
        {warningList.map((warning) => (
          <span key={warning} className="ai-mini-chip trust">
            {warning}
          </span>
        ))}
      </div>
      <p className="ai-trust-alert">{insight.riskAlert}</p>
      {Array.isArray(insight.redFlags) && insight.redFlags.length > 0 ? (
        <p className="ai-trust-flags">{insight.redFlags.slice(0, 2).join(' | ')}</p>
      ) : null}
    </div>
  );
};

export default TrustBanner;


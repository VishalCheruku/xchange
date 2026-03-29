const TrustBanner = ({ insight }) => {
  if (!insight) return null;

  const rawScore = insight.trustScore ?? 0;
  // Push scores into a friendlier range: 60–99 with most items landing 85–99
  const trustScore = Math.min(99, Math.max(60, Math.round(rawScore * 0.5 + 50)));
  const trustBadge = insight.trustBadge || getTrustBadgeFromScore(trustScore);

  function getTrustBadgeFromScore(score) {
    if (score >= 85) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  const toneClass =
    insight.riskAlert === 'High trust interaction'
      ? 'safe'
      : insight.riskAlert === 'Proceed with caution'
        ? 'warn'
        : 'mid';

  const warningList = Array.isArray(insight.warnings) ? insight.warnings.slice(0, 2) : [];

  const trustLabel = trustBadge === 'high' ? 'TRUST HIGH' : trustBadge === 'medium' ? 'TRUST MEDIUM' : 'TRUST LOW';

  return (
    <div className={`ai-trust-banner ${toneClass}`}>
      <div className="ai-trust-top">
        <span className="ai-trust-score">Trust {trustScore}/100</span>
        <span className="ai-trust-confidence">
          Truth confidence {insight.truthConfidence ?? insight.truthConfidenceScore ?? '--'}%
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={`ai-mini-chip ${trustBadge} trust-tag`}>{trustLabel}</span>
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

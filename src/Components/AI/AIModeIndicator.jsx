import { useAIMode } from '../Context/AIMode';

const AIModeIndicator = () => {
  const { aiModeEnabled, socketOnline } = useAIMode();

  if (!aiModeEnabled) return null;

  return (
    <div className="ai-global-indicator" aria-live="polite">
      <span className="ai-dot" />
      <span>AI Mode ON</span>
      <span className={`ai-sync ${socketOnline ? 'online' : 'offline'}`}>
        {socketOnline ? 'Live' : 'Fallback'}
      </span>
    </div>
  );
};

export default AIModeIndicator;


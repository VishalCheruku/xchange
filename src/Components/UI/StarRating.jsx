import { useState } from 'react';

const StarRating = ({ rating = 5, onRatingChange = () => {}, size = 'md', readOnly = false }) => {
  const [hoverRating, setHoverRating] = useState(null);

  const displayRating = hoverRating !== null ? hoverRating : rating;

  const sizeClasses = {
    sm: 'w-6 h-6 text-sm',
    md: 'w-8 h-8 text-lg',
    lg: 'w-12 h-12 text-2xl',
  };

  const containerClass = sizeClasses[size] || sizeClasses.md;

  return (
    <div className="flex gap-1 items-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          disabled={readOnly}
          onClick={() => !readOnly && onRatingChange(star)}
          onMouseEnter={() => !readOnly && setHoverRating(star)}
          onMouseLeave={() => !readOnly && setHoverRating(null)}
          className={`relative ${containerClass} flex items-center justify-center rounded transition-all duration-200 focus:outline-none group ${
            !readOnly ? 'cursor-pointer hover:scale-110' : 'cursor-default'
          }`}
          aria-label={`Rate ${star} stars`}
          title={`${star} star${star !== 1 ? 's' : ''}`}
        >
          {/* Background star (outline) */}
          <span className="absolute inset-0 flex items-center justify-center text-slate-300">★</span>

          {/* Filled star with animation */}
          <span
            className={`absolute inset-0 flex items-center justify-center overflow-hidden transition-all duration-200 ${
              star <= displayRating ? 'text-black' : 'text-slate-300'
            }`}
            style={{
              width: star <= displayRating ? '100%' : '0%',
              animation: star <= displayRating ? `fillStar 0.3s ease-out` : 'none',
            }}
          >
            ★
          </span>

          {/* Hover glow effect */}
          {!readOnly && star <= displayRating && (
            <div className="absolute inset-0 bg-black opacity-10 rounded animate-pulse" />
          )}
        </button>
      ))}

      <style>{`
        @keyframes fillStar {
          from {
            width: 0%;
            opacity: 0;
          }
          to {
            width: 100%;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default StarRating;

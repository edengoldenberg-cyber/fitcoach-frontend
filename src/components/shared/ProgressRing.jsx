import React from 'react';

export default function ProgressRing({ 
  progress, 
  size = 80, 
  strokeWidth = 8, 
  color = "#10B981", 
  label, 
  value, 
  target,
  unit = '',
  showPercentage = false 
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  // Handle overflow (>100%)
  const isOverflow = progress > 100;
  const displayProgress = Math.min(progress, 100);
  const offset = circumference - (displayProgress / 100) * circumference;
  
  // Color for overflow
  const displayColor = isOverflow ? '#ef4444' : color;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#E5E7EB"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={displayColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {showPercentage ? (
            <span className="text-lg font-bold" style={{ color: displayColor }}>
              {Math.round(progress)}%
            </span>
          ) : (
            <>
              <span className="text-base font-bold text-slate-800">{value}{unit}</span>
              {target && (
                <span className="text-xs text-slate-500">/ {target}{unit}</span>
              )}
            </>
          )}
        </div>
      </div>
      {label && (
        <span className="mt-1 text-xs font-medium text-slate-600 text-center">
          {label}
        </span>
      )}
    </div>
  );
}
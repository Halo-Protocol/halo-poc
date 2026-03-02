'use client';

/**
 * SVG arc gauge for displaying credit score (300–850).
 * Renders a half-circle arc with colored zones.
 */
interface ScoreGaugeProps {
  score: number;
  size?: number;
  showLabel?: boolean;
}

const ZONES = [
  { min: 300, max: 580, color: '#ef4444', label: 'Poor' },
  { min: 580, max: 670, color: '#f97316', label: 'Fair' },
  { min: 670, max: 740, color: '#eab308', label: 'Good' },
  { min: 740, max: 800, color: '#22c55e', label: 'Very Good' },
  { min: 800, max: 850, color: '#6366f1', label: 'Exceptional' },
];

function getColor(score: number): string {
  return ZONES.find((z) => score >= z.min && score < z.max)?.color ?? '#6366f1';
}

function getTierLabel(score: number): string {
  return ZONES.find((z) => score >= z.min && score < z.max)?.label ?? 'Exceptional';
}

export function ScoreGauge({ score, size = 180, showLabel = true }: ScoreGaugeProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.8;

  // Arc from 180° to 0° (half circle, bottom open)
  const startAngle = Math.PI;
  const endAngle = 0;
  const totalRange = 850 - 300;
  const scoreRange = score - 300;
  const scoreAngle = startAngle - (scoreRange / totalRange) * Math.PI;

  const arcX = (angle: number) => cx + r * Math.cos(angle);
  const arcY = (angle: number) => cy + r * Math.sin(angle);

  // Background arc
  const bgStart = `${arcX(startAngle)},${arcY(startAngle)}`;
  const bgEnd = `${arcX(endAngle)},${arcY(endAngle)}`;
  const bgPath = `M ${bgStart} A ${r} ${r} 0 0 1 ${bgEnd}`;

  // Score arc
  const scoreEnd = `${arcX(scoreAngle)},${arcY(scoreAngle)}`;
  const scorePath = `M ${arcX(startAngle)},${arcY(startAngle)} A ${r} ${r} 0 0 1 ${scoreEnd}`;

  const color = getColor(score);
  const strokeW = size * 0.065;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
        {/* Background track */}
        <path
          d={bgPath}
          fill="none"
          stroke="#1f2937"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d={scorePath}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          style={{ transition: 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        />
        {/* Score label */}
        <text
          x={cx}
          y={cy * 0.9}
          textAnchor="middle"
          fontSize={size * 0.2}
          fontWeight="700"
          fill={color}
        >
          {score}
        </text>
        {/* Range labels */}
        <text x={arcX(startAngle) + strokeW} y={cy * 0.92 + 2} fontSize={size * 0.065} fill="#6b7280">300</text>
        <text x={arcX(endAngle) - strokeW - 24} y={cy * 0.92 + 2} fontSize={size * 0.065} fill="#6b7280">850</text>
      </svg>
      {showLabel && (
        <div className="text-sm font-medium mt-1" style={{ color }}>
          {getTierLabel(score)}
        </div>
      )}
    </div>
  );
}

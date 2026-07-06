import React from 'react';

interface TrendPoint {
  label: string;
  value: number;
  feedbacksCount?: number;
}

interface TrendChartProps {
  data: TrendPoint[];
  height?: number;
}

export function TrendChart({ data, height = 220 }: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height, color: 'var(--text-muted)' }}>
        No data to display trend
      </div>
    );
  }

  // If there's only 1 data point, duplicate it to draw a line
  const points = data.length === 1 ? [data[0], data[0]] : data;

  const width = 500;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };

  // Calculate limits (ratings are 1-5, so we can anchor the Y-axis appropriately)
  const minVal = Math.max(1, Math.min(...points.map(p => p.value)) - 0.2);
  const maxVal = Math.min(5, Math.max(...points.map(p => p.value)) + 0.2);
  const valRange = maxVal - minVal || 1;

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Map coordinates
  const coords = points.map((p, index) => {
    const x = padding.left + (index / (points.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((p.value - minVal) / valRange) * chartHeight;
    return { x, y, label: p.label, value: p.value };
  });

  // Build the path definition
  let linePath = '';
  let areaPath = '';

  if (coords.length > 0) {
    linePath = `M ${coords[0].x} ${coords[0].y} ` + coords.slice(1).map(c => `L ${c.x} ${c.y}`).join(' ');
    // Area closes at the bottom of the chart
    areaPath = linePath + ` L ${coords[coords.length - 1].x} ${padding.top + chartHeight} L ${coords[0].x} ${padding.top + chartHeight} Z`;
  }

  // Grid lines
  const gridLinesCount = 4;
  const gridLines = Array.from({ length: gridLinesCount }).map((_, i) => {
    const val = minVal + (i / (gridLinesCount - 1)) * valRange;
    const y = padding.top + chartHeight - (i / (gridLinesCount - 1)) * chartHeight;
    return { y, value: val.toFixed(1) };
  });

  // Label ticks (max 5 ticks to avoid clutter)
  const labelInterval = Math.max(1, Math.ceil(points.length / 5));
  const labelTicks = coords.filter((_, idx) => idx % labelInterval === 0);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="chartAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Grid Lines */}
      {gridLines.map((line, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            y1={line.y}
            x2={width - padding.right}
            y2={line.y}
            stroke="var(--border-color)"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text
            x={padding.left - 10}
            y={line.y + 4}
            fill="var(--text-muted)"
            fontSize="10"
            textAnchor="end"
            fontWeight="600"
          >
            {line.value}
          </text>
        </g>
      ))}

      {/* Area under the line */}
      {areaPath && (
        <path
          d={areaPath}
          fill="url(#chartAreaGradient)"
        />
      )}

      {/* Main line path */}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Data point circles */}
      {coords.map((c, i) => (
        <g key={i}>
          <circle
            cx={c.x}
            cy={c.y}
            r="4"
            fill="var(--bg-secondary)"
            stroke="var(--primary)"
            strokeWidth="2.5"
            style={{ cursor: 'pointer' }}
          />
          {/* Subtle tooltip trigger zone */}
          <title>{`${c.label}: ${c.value.toFixed(2)} ★`}</title>
        </g>
      ))}

      {/* X Axis labels */}
      {labelTicks.map((tick, i) => (
        <text
          key={i}
          x={tick.x}
          y={height - padding.bottom + 18}
          fill="var(--text-muted)"
          fontSize="9"
          textAnchor="middle"
          fontWeight="500"
        >
          {tick.label}
        </text>
      ))}
    </svg>
  );
}

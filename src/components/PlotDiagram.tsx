import React from 'react';
import { Compass, Maximize2, ShieldAlert } from 'lucide-react';
import { Project } from '../types/project';
import { formatArea } from '../utils/formatters';

interface PlotDiagramProps {
  project: Pick<Project, 'plotWidth' | 'plotLength' | 'unit' | 'roadFacing' | 'floors'>;
}

export const PlotDiagram: React.FC<PlotDiagramProps> = ({ project }) => {
  const { plotWidth, plotLength, unit, roadFacing, floors } = project;
  const { label: areaLabel } = formatArea(plotWidth, plotLength, unit);
  const unitSuffix = unit === 'feet' ? 'ft' : 'm';

  // Calculate proportional SVG box dimensions
  // Max viewport canvas in SVG is 320 x 200
  const maxW = 280;
  const maxH = 180;
  const ratio = plotWidth / plotLength;

  let rectW: number;
  let rectH: number;

  if (ratio >= maxW / maxH) {
    rectW = maxW;
    rectH = Math.max(50, maxW / ratio);
  } else {
    rectH = maxH;
    rectW = Math.max(50, maxH * ratio);
  }

  const startX = (360 - rectW) / 2;
  const startY = (240 - rectH) / 2 + 5;

  // Road position annotation
  const isNorthRoad = roadFacing.includes('North');
  const isSouthRoad = roadFacing.includes('South');
  const isEastRoad = roadFacing.includes('East');
  const isWestRoad = roadFacing.includes('West');

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-teal-600" />
          <h4 className="text-sm font-semibold text-slate-800">Plot Geometry & Orientation</h4>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 tabular-nums">
          <span>Ratio {(plotWidth / plotLength).toFixed(2)}:1</span>
          <span aria-hidden="true">·</span>
          <span>{floors} {floors === 1 ? 'Floor' : 'Floors'}</span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative mt-4 bg-slate-50 rounded-lg border border-slate-200/80 p-2 overflow-hidden flex flex-col items-center justify-center min-h-[260px] bg-grid-pattern">
        {/* Road indicators */}
        {isNorthRoad && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-slate-800 text-white text-[11px] font-medium tracking-wide uppercase rounded-xs shadow-xs">
            Road Facing: North
          </div>
        )}
        {isSouthRoad && !isNorthRoad && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-slate-800 text-white text-[11px] font-medium tracking-wide uppercase rounded-xs shadow-xs">
            Road Facing: South
          </div>
        )}
        {isWestRoad && !isNorthRoad && !isSouthRoad && (
          <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 px-2 py-0.5 bg-slate-800 text-white text-[11px] font-medium tracking-wide uppercase rounded-xs shadow-xs">
            Road: West
          </div>
        )}
        {isEastRoad && !isNorthRoad && !isSouthRoad && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 px-2 py-0.5 bg-slate-800 text-white text-[11px] font-medium tracking-wide uppercase rounded-xs shadow-xs">
            Road: East
          </div>
        )}

        <svg
          viewBox="0 0 360 260"
          className="w-full max-w-[360px] h-auto select-none"
          role="img"
          aria-label={`Plot diagram showing ${plotWidth} by ${plotLength} ${unit}`}
        >
          {/* Dimension indicator top (Width) */}
          <line
            x1={startX}
            y1={startY - 14}
            x2={startX + rectW}
            y2={startY - 14}
            stroke="#0d9488"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <line x1={startX} y1={startY - 20} x2={startX} y2={startY - 8} stroke="#0d9488" strokeWidth="1.5" />
          <line x1={startX + rectW} y1={startY - 20} x2={startX + rectW} y2={startY - 8} stroke="#0d9488" strokeWidth="1.5" />
          <text
            x={startX + rectW / 2}
            y={startY - 18}
            textAnchor="middle"
            fill="#0f766e"
            fontSize="11"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
          >
            {plotWidth} {unitSuffix}
          </text>

          {/* Dimension indicator left (Length) */}
          <line
            x1={startX - 14}
            y1={startY}
            x2={startX - 14}
            y2={startY + rectH}
            stroke="#0d9488"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <line x1={startX - 20} y1={startY} x2={startX - 8} y2={startY} stroke="#0d9488" strokeWidth="1.5" />
          <line x1={startX - 20} y1={startY + rectH} x2={startX - 8} y2={startY + rectH} stroke="#0d9488" strokeWidth="1.5" />
          <text
            x={startX - 20}
            y={startY + rectH / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${startX - 20} ${startY + rectH / 2})`}
            fill="#0f766e"
            fontSize="11"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
          >
            {plotLength} {unitSuffix}
          </text>

          {/* Outer Boundary (Property Line) */}
          <rect
            x={startX}
            y={startY}
            width={rectW}
            height={rectH}
            fill="#ffffff"
            stroke="#1e293b"
            strokeWidth="2"
            rx="2"
          />

          {/* Indicative Setback / Build Zone (dashed inner perimeter) */}
          {rectW > 40 && rectH > 40 && (
            <rect
              x={startX + 12}
              y={startY + 12}
              width={rectW - 24}
              height={rectH - 24}
              fill="#f0fdfa"
              stroke="#14b8a6"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}

          {/* Center Plot Label */}
          <text
            x={startX + rectW / 2}
            y={startY + rectH / 2 - 4}
            textAnchor="middle"
            fill="#0f172a"
            fontSize="13"
            fontWeight="700"
            fontFamily="Plus Jakarta Sans, sans-serif"
          >
            {areaLabel}
          </text>
          <text
            x={startX + rectW / 2}
            y={startY + rectH / 2 + 14}
            textAnchor="middle"
            fill="#64748b"
            fontSize="10"
            fontFamily="Plus Jakarta Sans, sans-serif"
          >
            Indicative Footprint Envelope
          </text>

          {/* Corner tick marks */}
          <circle cx={startX} cy={startY} r="3" fill="#0f172a" />
          <circle cx={startX + rectW} cy={startY} r="3" fill="#0f172a" />
          <circle cx={startX} cy={startY + rectH} r="3" fill="#0f172a" />
          <circle cx={startX + rectW} cy={startY + rectH} r="3" fill="#0f172a" />
        </svg>

        {/* Legend */}
        <div className="w-full flex items-center justify-between px-3 pt-2 text-[11px] text-slate-500 border-t border-slate-200/60 mt-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-slate-900 inline-block" />
            <span>Property Boundary</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-teal-500 border-t border-dashed border-teal-500 inline-block" />
            <span>Indicative Setback Guide</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
        <ShieldAlert className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
        <p>
          Diagram illustrates scaled boundary proportion. Precise municipal setbacks, easements, and zoning envelope must be verified with local municipal planning authorities.
        </p>
      </div>
    </div>
  );
};

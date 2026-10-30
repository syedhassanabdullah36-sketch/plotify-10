import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Maximize,
} from 'lucide-react';
import { FloorPlanValidation } from '../../types/floorplan';
import { MeasurementUnit } from '../../types/project';

interface FloorPlanValidationPanelProps {
  validation: FloorPlanValidation;
  unit: MeasurementUnit;
  onSelectRoom: (roomId: string) => void;
}

export const FloorPlanValidationPanel: React.FC<FloorPlanValidationPanelProps> = ({
  validation,
  unit,
  onSelectRoom,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const areaUnit = unit === 'feet' ? 'sq ft' : 'm²';

  const totalViolations =
    validation.boundaryViolations.length +
    validation.overlapViolations.length +
    validation.dimensionViolations.length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-xs">
      {/* Header Bar */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3.5 flex items-center justify-between bg-slate-50/70 hover:bg-slate-100/60 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2">
          {validation.isValid ? (
            <div className="p-1 bg-emerald-50 text-emerald-600 rounded">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          ) : (
            <div className="p-1 bg-amber-50 text-amber-600 rounded">
              <AlertTriangle className="w-4 h-4" />
            </div>
          )}
          <div>
            <span className="font-bold text-slate-900 block leading-tight">
              {validation.isValid ? 'Geometry Validation Passed' : `${totalViolations} Plan Warnings Detected`}
            </span>
            <span className="text-[11px] text-slate-500">
              Coverage: {validation.coveragePercent.toFixed(1)}% of plot (
              {validation.totalRoomArea.toLocaleString(undefined, { maximumFractionDigits: 1 })}{' '}
              {areaUnit})
            </span>
          </div>
        </div>

        <div className="text-slate-400">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded Issues List */}
      {isExpanded && (
        <div className="p-4 space-y-3 border-t border-slate-100">
          {/* Boundary Violations */}
          {validation.boundaryViolations.length > 0 && (
            <div className="space-y-1.5">
              <div className="font-semibold text-amber-900 flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Plot Boundary Violations ({validation.boundaryViolations.length})</span>
              </div>
              <div className="space-y-1 pl-2">
                {validation.boundaryViolations.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => onSelectRoom(item.roomId)}
                    className="p-2 bg-amber-50/60 hover:bg-amber-100/80 border border-amber-200/60 rounded-md cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-800">{item.roomName}</span>
                    <span className="text-[11px] text-amber-800">{item.issue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overlap Violations */}
          {validation.overlapViolations.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="font-semibold text-amber-900 flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Room Overlaps ({validation.overlapViolations.length})</span>
              </div>
              <div className="space-y-1 pl-2">
                {validation.overlapViolations.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-amber-50/60 border border-amber-200/60 rounded-md flex items-center justify-between"
                  >
                    <div className="text-slate-800 font-medium">
                      <button
                        onClick={() => onSelectRoom(item.roomAId)}
                        className="hover:underline text-teal-800"
                      >
                        {item.roomAName}
                      </button>
                      {' overlaps with '}
                      <button
                        onClick={() => onSelectRoom(item.roomBId)}
                        className="hover:underline text-teal-800"
                      >
                        {item.roomBName}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Non-positive Dimensions */}
          {validation.dimensionViolations.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="font-semibold text-red-900 flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                <XCircle className="w-3.5 h-3.5 text-red-600" />
                <span>Invalid Dimensions</span>
              </div>
              <div className="space-y-1 pl-2">
                {validation.dimensionViolations.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => onSelectRoom(item.roomId)}
                    className="p-2 bg-red-50/60 border border-red-200/60 rounded-md cursor-pointer flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-800">{item.roomName}</span>
                    <span className="text-[11px] text-red-700">{item.issue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Good */}
          {validation.isValid && (
            <p className="text-slate-500 text-[11px] leading-relaxed">
              All room envelopes fit cleanly within the plot boundaries without overlaps or negative dimensions.
            </p>
          )}

          {/* Professional Limits Notice */}
          <div className="pt-2 border-t border-slate-100 flex items-start gap-1.5 text-[11px] text-slate-400">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>
              Advisory spatial verification only. Does not certify building-code egress, setback clearance, or structural feasibility.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

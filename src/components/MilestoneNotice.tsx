import React from 'react';
import { PenTool, Layers, CheckCircle2, Info, ArrowRight, Sparkles } from 'lucide-react';

interface MilestoneNoticeProps {
  onOpenEditor?: () => void;
}

export const MilestoneNotice: React.FC<MilestoneNoticeProps> = ({ onOpenEditor }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-teal-50 text-teal-700 rounded-xl border border-teal-100 shrink-0">
            <PenTool className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-teal-800 uppercase tracking-wider">
                2D Floor-Plan Engine
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500 font-medium">Interactive Canvas</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-1">
              Architectural 2D Space & Boundary Editor
            </h3>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed max-w-2xl">
              Arrange programmed rooms directly inside the true scaled plot envelope. Includes real-time plot boundary collision detection, pairwise room overlap alerts, and live built-up footprint coverage metrics.
            </p>
          </div>
        </div>

        {onOpenEditor && (
          <button
            onClick={onOpenEditor}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs hover:shadow-md transition-all shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>Launch 2D Floor-Plan Editor</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Feature capabilities matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-xs">
        <div className="space-y-2">
          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            <span>Active 2D Floor-Plan Features</span>
          </div>
          <ul className="text-slate-600 space-y-1 pl-5 list-disc">
            <li>True-scale plot boundary canvas ({`W × L`}) with road elevation axis</li>
            <li>Drag-and-drop room repositioning with 0.5/1.0 unit grid snapping</li>
            <li>8-point resize handles and exact numeric dimension inspector</li>
            <li>Automated plot boundary violation warnings & overlap collision alerts</li>
            <li>Multi-floor support with floor-level tab separation and local persistence</li>
          </ul>
        </div>

        <div className="space-y-2">
          <div className="font-semibold text-slate-700 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Upcoming Engineering Roadmap</span>
          </div>
          <ul className="text-slate-500 space-y-1 pl-5 list-disc">
            <li>Arbitrary polygonal wall segment drafting</li>
            <li>Parametric door swings, window openings, and wall thickness</li>
            <li>Direct vector export to DXF and architectural PDF</li>
          </ul>
        </div>
      </div>

      {/* Professional Scope Disclaimer Banner */}
      <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-lg flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800 leading-relaxed">
          <span className="font-semibold">Professional Limits:</span> Plotify manages architectural project planning and dimensional metadata only. It does not produce construction-ready engineering drawings, certify structural safety, guarantee municipal building-code compliance, or provide verified contractor estimates. Consult a licensed local architect and structural engineer before construction.
        </p>
      </div>
    </div>
  );
};

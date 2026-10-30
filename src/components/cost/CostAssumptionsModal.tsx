import React from 'react';
import {
  X,
  BookOpen,
  DollarSign,
  Scale,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Wrench,
  HardHat,
  Boxes,
} from 'lucide-react';

interface CostAssumptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CostAssumptionsModal: React.FC<CostAssumptionsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-teal-400 flex items-center justify-center font-bold shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider">
                Cost Intelligence Methodology
              </div>
              <h2 className="text-base font-bold text-slate-900">
                Quantity Take-Off Formulas & Professional Boundaries
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-600 leading-relaxed">
          {/* 1. Deterministic QTO Formulas */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Boxes className="w-4 h-4 text-teal-700" />
              1. Geometry-Aware Quantity Measurement Rules
            </h4>
            <p>
              Quantities are calculated deterministically from active 2D floor-plan geometry:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-700">
              <li>
                <strong>Ground Foundation Slab:</strong> Ground floor area <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">W × L</code> multiplied by a standard 5" (0.13 m) slab thickness with 5% pump overage allowance.
              </li>
              <li>
                <strong>Shared Wall Deductions:</strong> Room perimeters are aggregated and reduced by a standard <strong>35% deduction</strong> to prevent double-counting shared interior partition walls between adjoining spaces.
              </li>
              <li>
                <strong>Envelope Glazing Deductions:</strong> External perimeter walls are derived from building boundaries multiplied by standard ceiling height (9 ft / 2.75 m) minus a <strong>22% fenestration allowance</strong> for windows and glazed doors.
              </li>
              <li>
                <strong>Finish Cutting Waste:</strong> Flooring and ceramic tiling include a standard <strong>8% waste allowance</strong> for corner cuts, pattern alignment, and layout breaks.
              </li>
            </ul>
          </div>

          {/* 2. Arithmetic & Aggregation Formulas */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-700" />
              2. Arithmetic Aggregation & Rate Validation
            </h4>
            <p>
              Calculations are strictly deterministic:
            </p>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-800 space-y-1">
              <div>Line Item Cost = Quantity × Unit Rate</div>
              <div>Subtotal = Sum of Line Item Costs (Materials + Labour + Equipment + Transport + Other)</div>
              <div>Contingency Amount = Subtotal × (Contingency % / 100)</div>
              <div>Tax / VAT = (Subtotal + Contingency) × (Tax % / 100) [Only when explicitly configured]</div>
              <div>Estimated Grand Total = Subtotal + Contingency + Tax</div>
              <div>Budget Variance = Target Budget - Estimated Grand Total</div>
            </div>
            <p>
              Contingency is never applied twice, and taxes are only computed when positive values are explicitly declared by the user.
            </p>
          </div>

          {/* 3. Trade Labour & Productivity Benchmarks */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HardHat className="w-4 h-4 text-amber-700" />
              3. Trade Labour Productivity Benchmarks
            </h4>
            <p>
              Labour man-hour allowances are derived from standard trade production rates:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-700">
              <li><strong>Structural & Concrete:</strong> 0.42 man-hours / sq ft (4.5 hrs / m²)</li>
              <li><strong>Drywall, Taping & Painting:</strong> 0.38 man-hours / sq ft (4.0 hrs / m²)</li>
              <li><strong>MEP Specialized Trades:</strong> 0.32 man-hours / sq ft (3.4 hrs / m²)</li>
            </ul>
          </div>

          {/* 4. Scheduling & Dependency Verification */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-4 h-4 text-teal-700" />
              4. Preliminary Construction Phase Staging
            </h4>
            <p>
              Preliminary construction phases represent generic development sequences. Planned phase durations and dependencies are checked automatically. If a succeeding phase is scheduled before a predecessor's calendar completion date, a scheduling conflict warning is raised.
            </p>
          </div>

          {/* Professional Limitations & Boundaries */}
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-2 text-amber-900">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              Professional Quantity Surveying Disclaimer
            </div>
            <p className="text-[11px] leading-relaxed">
              Plotify Cost Intelligence calculations are preliminary planning heuristics designed for early-stage feasibility evaluation, trade-off comparison, and budget tracking. They do not constitute a formal contractor bid, guaranteed maximum price (GMP), or certified bill of quantities (BOQ). Actual construction costs vary significantly based on local soil conditions, supply chain fluctuations, local union rates, contractor overheads, and site logistics. Always consult certified Quantity Surveyors (MRICS), general contractors, and structural engineers prior to contract execution or financing commitment.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};

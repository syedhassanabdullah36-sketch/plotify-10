import React from 'react';
import {
  X,
  BookOpen,
  Scale,
  ShieldCheck,
  Leaf,
  DollarSign,
  Maximize2,
  AlertTriangle,
} from 'lucide-react';

interface AssumptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AssumptionsModal: React.FC<AssumptionsModalProps> = ({
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
                Engineering Transparency
              </div>
              <h2 className="text-base font-bold text-slate-900">
                Calculation Models & Engineering Assumptions
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
          {/* 1. Spatial & Area Model */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-teal-700" />
              1. Spatial & Floor Area Calculations
            </h4>
            <p>
              <strong>Net Usable Area:</strong> Calculated as the sum of interior room envelopes <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">width × length</code>.
            </p>
            <p>
              <strong>Gross Floor Area (GFA):</strong> Calculated across all programmed building levels. Incorporates a deterministic 10–12% allowance for internal partition walls, structural columns, and vertical circulation (stairs/shafts) in accordance with IPMS 2 (International Property Measurement Standards).
            </p>
            <p>
              <strong>Plot Coverage Ratio:</strong> Calculated as Ground Level Footprint divided by declared Parcel Area <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">(Plot Width × Plot Length) × 100%</code>.
            </p>
          </div>

          {/* 2. Construction Cost Estimation Model */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-700" />
              2. Construction Cost Modeling
            </h4>
            <p>
              Cost calculations are derived from verified baseline unit-area construction rates categorized by Architectural Finish Tier:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-700">
              <li><strong>Economic:</strong> $165/sq ft (€1,750/m²)</li>
              <li><strong>Balanced Mid-Range:</strong> $240/sq ft (€2,550/m²)</li>
              <li><strong>High-End Architectural:</strong> $350/sq ft (€3,750/m²)</li>
              <li><strong>Ultra Luxury (Bespoke):</strong> $520/sq ft (€5,500/m²)</li>
            </ul>
            <p>
              <strong>Multi-Story Vertical Premium:</strong> An incremental +6% per floor beyond Level 1 is applied to account for vertical structural shear, scaffolding, elevator shafts, and vertical MEP risers.
            </p>
          </div>

          {/* 3. Embodied Carbon Takeoff */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Leaf className="w-4 h-4 text-emerald-700" />
              3. Upfront Embodied Carbon (A1–A3)
            </h4>
            <p>
              Carbon takeoff calculates cradle-to-gate upfront embodied emissions based on primary structural and envelope materials using verified coefficients from the <em>Inventory of Carbon & Energy (ICE Database)</em> and RICS Whole Life Carbon Assessment:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-700">
              <li>Mass Timber / Glulam: 180 kg CO₂e / m²</li>
              <li>Mineral Plaster / Render: 290 kg CO₂e / m²</li>
              <li>Natural Stone Ashlar: 330 kg CO₂e / m²</li>
              <li>Clay Facing Brick: 390 kg CO₂e / m²</li>
              <li>Fair-Faced Concrete: 490 kg CO₂e / m²</li>
              <li>Structural Glass Curtain Wall: 530 kg CO₂e / m²</li>
            </ul>
          </div>

          {/* 4. Living Constraint Graph & Multi-Criteria Optimization */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-4 h-4 text-teal-700" />
              4. Multi-Criteria Synthesis & Pareto Frontier
            </h4>
            <p>
              The composite score normalizes each criterion to a standard 0–100 scale and applies transparent user-controlled weights.
            </p>
            <p>
              <strong>Pareto Optimality:</strong> An alternative is designated Pareto-optimal if no other scenario achieves strictly better outcomes across all evaluated objectives (Area, Cost, Conflicts, Carbon) without sacrificing performance in at least one area.
            </p>
          </div>

          {/* Disclaimers & Professional Boundaries */}
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-2 text-amber-900">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              Professional Architectural Disclaimer
            </div>
            <p className="text-[11px] leading-relaxed">
              Plotify Future-Impact Simulator outputs are deterministic engineering heuristics intended for schematic design comparison, scenario benchmarking, and conceptual exploration. They do not constitute certified structural engineering, licensed architectural stamp approval, quantity surveying guarantees, or municipal zoning permit compliance. Consult registered architects and structural engineers for formal construction documentation.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            Close Transparency Report
          </button>
        </div>
      </div>
    </div>
  );
};

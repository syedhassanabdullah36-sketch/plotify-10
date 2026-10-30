import React, { useState } from 'react';
import { Project } from '../../types/project';
import {
  CostLineItem,
  CostItemCategory,
  CostScenario,
} from '../../types/costPlanning';
import { formatCurrency } from '../../utils/formatters';
import {
  Search,
  Filter,
  Plus,
  Trash2,
  Edit2,
  Check,
  Info,
  Layers,
  AlertTriangle,
  HardHat,
  Truck,
  Wrench,
  Boxes,
  HelpCircle,
  Percent,
} from 'lucide-react';

interface ItemizedEstimateTableProps {
  project: Project;
  scenario: CostScenario;
  onUpdateScenario: (updated: CostScenario) => void;
}

export const ItemizedEstimateTable: React.FC<ItemizedEstimateTableProps> = ({
  project,
  scenario,
  onUpdateScenario,
}) => {
  const [activeCategory, setActiveCategory] = useState<CostItemCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Quick state for adding custom line item
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItemCategory, setNewItemCategory] = useState<CostItemCategory>('materials');
  const [newItemName, setNewItemName] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState<number>(1);
  const [newItemUnit, setNewItemUnit] = useState('units');
  const [newItemRate, setNewItemRate] = useState<number>(100);
  const [newItemSource, setNewItemSource] = useState('Local Supplier Quote');

  // Filter line items
  const filteredItems = scenario.lineItems.filter((item) => {
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Category counts
  const categoryCounts = {
    all: scenario.lineItems.length,
    materials: scenario.lineItems.filter((i) => i.category === 'materials').length,
    labour: scenario.lineItems.filter((i) => i.category === 'labour').length,
    equipment: scenario.lineItems.filter((i) => i.category === 'equipment').length,
    transport: scenario.lineItems.filter((i) => i.category === 'transport').length,
    other: scenario.lineItems.filter((i) => i.category === 'other').length,
  };

  // Inline rate update
  const handleUpdateItem = (itemId: string, updates: Partial<CostLineItem>) => {
    const updatedList = scenario.lineItems.map((item) => {
      if (item.id !== itemId) return item;
      const updated = { ...item, ...updates };
      // Always recalculate extendedCost deterministically
      const qty = typeof updated.quantity === 'number' ? Math.max(0, updated.quantity) : 0;
      const rate = typeof updated.unitRate === 'number' ? Math.max(0, updated.unitRate) : 0;
      updated.extendedCost = Math.round(qty * rate);
      return updated;
    });

    onUpdateScenario({
      ...scenario,
      lineItems: updatedList,
      updatedAt: new Date().toISOString(),
    });
  };

  // Delete line item
  const handleDeleteItem = (itemId: string) => {
    const updatedList = scenario.lineItems.filter((i) => i.id !== itemId);
    onUpdateScenario({
      ...scenario,
      lineItems: updatedList,
      updatedAt: new Date().toISOString(),
    });
  };

  // Add custom line item
  const handleCreateCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const prefix = newItemCategory.charAt(0).toUpperCase();
    const existingOfCat = scenario.lineItems.filter((i) => i.category === newItemCategory).length + 1;
    const code = `${prefix}-${String(existingOfCat).padStart(2, '0')}`;

    const newItem: CostLineItem = {
      id: `cost-custom-${Date.now()}`,
      code,
      category: newItemCategory,
      name: newItemName.trim(),
      description: newItemDescription.trim() || 'Custom user-specified line item.',
      quantity: Math.max(0, newItemQuantity),
      unit: newItemUnit.trim() || 'units',
      unitRate: Math.max(0, newItemRate),
      extendedCost: Math.round(Math.max(0, newItemQuantity) * Math.max(0, newItemRate)),
      quantitySource: 'user-entered',
      calculationFormula: 'User-entered direct quantity & unit rate',
      assumptions: 'Custom user estimate item.',
      supplierOrSource: newItemSource.trim() || 'User specification',
      rateDate: new Date().toISOString().split('T')[0],
    };

    onUpdateScenario({
      ...scenario,
      lineItems: [...scenario.lineItems, newItem],
      updatedAt: new Date().toISOString(),
    });

    // Reset and close
    setNewItemName('');
    setNewItemDescription('');
    setNewItemQuantity(1);
    setNewItemRate(100);
    setIsAddModalOpen(false);
  };

  // Contingency rate change
  const handleContingencyChange = (rate: number) => {
    if (isNaN(rate) || rate < 0 || rate > 50) return;
    onUpdateScenario({
      ...scenario,
      contingencyRatePercent: rate,
      updatedAt: new Date().toISOString(),
    });
  };

  // Tax rate change
  const handleTaxChange = (rate: number) => {
    if (isNaN(rate) || rate < 0 || rate > 40) return;
    onUpdateScenario({
      ...scenario,
      taxRatePercent: rate,
      updatedAt: new Date().toISOString(),
    });
  };

  const getCategoryIcon = (cat: CostItemCategory) => {
    switch (cat) {
      case 'materials':
        return <Boxes className="w-3.5 h-3.5 text-blue-600" />;
      case 'labour':
        return <HardHat className="w-3.5 h-3.5 text-amber-600" />;
      case 'equipment':
        return <Wrench className="w-3.5 h-3.5 text-emerald-600" />;
      case 'transport':
        return <Truck className="w-3.5 h-3.5 text-indigo-600" />;
      case 'other':
      default:
        return <Layers className="w-3.5 h-3.5 text-slate-600" />;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
      {/* Table Header & Category Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Itemized Construction Cost Take-Off
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Deterministic bill of quantities calculated from verified 2D geometry and editable trade rates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search line items or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-teal-500 w-48 sm:w-56"
            />
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Custom Item</span>
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 ${
            activeCategory === 'all'
              ? 'bg-teal-800 text-white border-teal-800'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          All Items ({categoryCounts.all})
        </button>
        <button
          onClick={() => setActiveCategory('materials')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeCategory === 'materials'
              ? 'bg-teal-800 text-white border-teal-800'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <Boxes className="w-3 h-3 text-blue-600" />
          <span>Materials ({categoryCounts.materials})</span>
        </button>
        <button
          onClick={() => setActiveCategory('labour')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeCategory === 'labour'
              ? 'bg-teal-800 text-white border-teal-800'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <HardHat className="w-3 h-3 text-amber-600" />
          <span>Labour ({categoryCounts.labour})</span>
        </button>
        <button
          onClick={() => setActiveCategory('equipment')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeCategory === 'equipment'
              ? 'bg-teal-800 text-white border-teal-800'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <Wrench className="w-3 h-3 text-emerald-600" />
          <span>Equipment ({categoryCounts.equipment})</span>
        </button>
        <button
          onClick={() => setActiveCategory('transport')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeCategory === 'transport'
              ? 'bg-teal-800 text-white border-teal-800'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <Truck className="w-3 h-3 text-indigo-600" />
          <span>Transport ({categoryCounts.transport})</span>
        </button>
        <button
          onClick={() => setActiveCategory('other')}
          className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeCategory === 'other'
              ? 'bg-teal-800 text-white border-teal-800'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-3 h-3 text-slate-600" />
          <span>Other Preliminaries ({categoryCounts.other})</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-3 w-16">Code</th>
              <th className="py-3 px-4">Line Item & Scope</th>
              <th className="py-3 px-3 text-right">Quantity</th>
              <th className="py-3 px-3 text-right">Unit Rate ({project.currency})</th>
              <th className="py-3 px-3 text-right">Extended Cost</th>
              <th className="py-3 px-3 text-center">Data Source</th>
              <th className="py-3 px-2 text-center w-16">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.map((item) => {
              const isExpanded = expandedItemId === item.id;

              return (
                <React.Fragment key={item.id}>
                  <tr className="hover:bg-slate-50/70 transition-colors">
                    {/* Code */}
                    <td className="py-3 px-3 font-mono font-bold text-slate-700">
                      <span className="flex items-center gap-1">
                        {getCategoryIcon(item.category)}
                        {item.code}
                      </span>
                    </td>

                    {/* Line Item & Scope */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 flex items-center gap-2">
                        <span>{item.name}</span>
                        {item.isStale && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded-sm border border-amber-200"
                            title="Geometry has changed since this was calculated. Sync QTO to update."
                          >
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                            Stale
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">
                        {item.description}
                      </div>
                    </td>

                    {/* Quantity & Unit (Editable for user-entered, fixed for geometry) */}
                    <td className="py-3 px-3 text-right tabular-nums">
                      {item.quantitySource === 'user-entered' ? (
                        <input
                          type="number"
                          min={0}
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { quantity: Number(e.target.value) })
                          }
                          className="w-20 px-1.5 py-0.5 text-right font-medium text-xs bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-teal-500"
                        />
                      ) : (
                        <span className="font-medium text-slate-800">
                          {item.quantity.toLocaleString()}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 ml-1">
                        {item.unit}
                      </span>
                    </td>

                    {/* Unit Rate (Inline Editable) */}
                    <td className="py-3 px-3 text-right tabular-nums">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {project.currency}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={item.unitRate}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { unitRate: Number(e.target.value) })
                          }
                          className="w-24 px-1.5 py-0.5 text-right font-semibold text-xs bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                        />
                      </div>
                    </td>

                    {/* Extended Cost */}
                    <td className="py-3 px-3 text-right font-black text-slate-900 tabular-nums">
                      {formatCurrency(item.extendedCost, project.currency)}
                    </td>

                    {/* Source Badge */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          item.quantitySource === 'geometry-derived'
                            ? 'bg-teal-50 text-teal-800 border-teal-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {item.quantitySource === 'geometry-derived'
                          ? 'Geometry'
                          : 'User-Entered'}
                      </span>
                    </td>

                    {/* Actions: Info toggle and Delete */}
                    <td className="py-3 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() =>
                            setExpandedItemId(isExpanded ? null : item.id)
                          }
                          className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Inspect calculation formula and assumptions"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete line item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Detail Row */}
                  {isExpanded && (
                    <tr className="bg-slate-50/80">
                      <td colSpan={7} className="py-3 px-4 text-xs text-slate-600 border-t border-slate-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <span className="font-bold text-slate-800 block">
                              Calculation Formula:
                            </span>
                            <code className="text-[11px] bg-white px-2 py-1 rounded-md border border-slate-200 block text-slate-700 font-mono">
                              {item.calculationFormula}
                            </code>
                            <div className="text-[11px] text-slate-500 pt-1">
                              <strong>Assumptions:</strong> {item.assumptions}
                            </div>
                          </div>

                          <div className="space-y-1 bg-white p-2.5 rounded-lg border border-slate-200 text-[11px]">
                            <span className="font-bold text-slate-800 block">
                              Rate Provenance & Source Notes:
                            </span>
                            <div>
                              <strong>Source / Supplier:</strong>{' '}
                              <span className="text-slate-700">
                                {item.supplierOrSource || 'Regional Estimating Guide (RSMeans / SMM7 Standard)'}
                              </span>
                            </div>
                            <div>
                              <strong>Rate Recorded Date:</strong>{' '}
                              <span className="text-slate-700 font-mono">
                                {item.rateDate || 'Current Q3 2026 Index'}
                              </span>
                            </div>
                            {item.notes && (
                              <div className="text-slate-500 italic">
                                Note: {item.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Contingency, Taxes, and Bottom Summary Settings */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-wrap items-center gap-6 text-xs">
          {/* Contingency Rate input */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700 flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-teal-700" />
              Contingency Allowance
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={40}
                step={0.5}
                value={scenario.contingencyRatePercent}
                onChange={(e) => handleContingencyChange(Number(e.target.value))}
                className="w-20 px-2 py-1 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-slate-500">% of Subtotal</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Covers unforeseen site conditions & design changes.
            </div>
          </div>

          {/* Tax / Statutory rate input */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700 flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-teal-700" />
              Tax / VAT Charges
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={scenario.taxRatePercent}
                onChange={(e) => handleTaxChange(Number(e.target.value))}
                className="w-20 px-2 py-1 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-slate-500">% (0% if exempt)</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Only applied when explicitly configured by user.
            </div>
          </div>
        </div>

        {/* Quick calculation recap */}
        <div className="text-right text-xs space-y-1 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-6">
          <div className="text-slate-500">
            Subtotal: <strong className="text-slate-800">{formatCurrency(scenario.lineItems.reduce((acc, i) => acc + i.extendedCost, 0), project.currency)}</strong>
          </div>
          <div className="text-slate-500">
            + {scenario.contingencyRatePercent}% Contingency:{' '}
            <strong className="text-slate-800">
              {formatCurrency(
                Math.round(
                  scenario.lineItems.reduce((acc, i) => acc + i.extendedCost, 0) *
                    (scenario.contingencyRatePercent / 100)
                ),
                project.currency
              )}
            </strong>
          </div>
          {scenario.taxRatePercent > 0 && (
            <div className="text-slate-500">
              + {scenario.taxRatePercent}% Tax:{' '}
              <strong className="text-slate-800">
                {formatCurrency(
                  Math.round(
                    (scenario.lineItems.reduce((acc, i) => acc + i.extendedCost, 0) *
                      (1 + scenario.contingencyRatePercent / 100)) *
                      (scenario.taxRatePercent / 100)
                  ),
                  project.currency
                )}
              </strong>
            </div>
          )}
        </div>
      </div>

      {/* Add Custom Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h4 className="text-base font-bold text-slate-900">
              Add Custom Line Item
            </h4>

            <form onSubmit={handleCreateCustomItem} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Cost Category
                </label>
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value as CostItemCategory)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                >
                  <option value="materials">Materials</option>
                  <option value="labour">Labour</option>
                  <option value="equipment">Equipment</option>
                  <option value="transport">Transport</option>
                  <option value="other">Other Preliminaries</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bespoke Joinery & Kitchen Island"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Description / Specification
                </label>
                <input
                  type="text"
                  placeholder="e.g. Custom walnut veneered cabinetry with quartz countertop"
                  value={newItemDescription}
                  onChange={(e) => setNewItemDescription(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    required
                    value={newItemQuantity}
                    onChange={(e) => setNewItemQuantity(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="units, sq ft, hrs"
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Rate ({project.currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={newItemRate}
                    onChange={(e) => setNewItemRate(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Supplier / Quote Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. Local Millwork Subcontractor Quote #2026-A"
                  value={newItemSource}
                  onChange={(e) => setNewItemSource(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-xs font-semibold shadow-2xs cursor-pointer"
                >
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

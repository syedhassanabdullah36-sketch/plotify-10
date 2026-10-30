import { Currency, MeasurementUnit } from '../types/project';

export function formatCurrency(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function formatArea(width: number, length: number, unit: MeasurementUnit): {
  area: number;
  label: string;
  formula: string;
} {
  const area = width * length;
  const unitLabel = unit === 'feet' ? 'sq ft' : 'm²';
  return {
    area,
    label: `${area.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unitLabel}`,
    formula: `${width} ${unit === 'feet' ? 'ft' : 'm'} × ${length} ${unit === 'feet' ? 'ft' : 'm'}`,
  };
}

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return isoString;
  }
}

export function getStatusStyle(status: string): { bg: string; text: string; border: string } {
  switch (status) {
    case 'Drafting':
      return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
    case 'Concept Feasibility':
      return { bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200' };
    case 'Schematic Design':
      return { bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200' };
    case 'Client Review':
      return { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' };
    case 'Permit Review':
      return { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200' };
    case 'Approved':
      return { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' };
    default:
      return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
  }
}

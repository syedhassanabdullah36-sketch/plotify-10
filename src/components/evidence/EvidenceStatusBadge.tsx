import React from 'react';
import { ValidationStatus } from '../../types/evidence';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  HelpCircle,
  XCircle,
  FileQuestion,
} from 'lucide-react';

interface EvidenceStatusBadgeProps {
  status: ValidationStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const EvidenceStatusBadge: React.FC<EvidenceStatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2',
  }[size];

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  }[size];

  switch (status) {
    case 'pass':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 ${sizeClasses}`}
        >
          {showIcon && <CheckCircle2 className={`${iconSizes} text-emerald-600 shrink-0`} />}
          <span>Pass</span>
        </span>
      );

    case 'conflict':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-md bg-rose-50 text-rose-800 border border-rose-200 ${sizeClasses}`}
        >
          {showIcon && <AlertCircle className={`${iconSizes} text-rose-600 shrink-0`} />}
          <span>Conflict</span>
        </span>
      );

    case 'stale':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-md bg-amber-50 text-amber-800 border border-amber-300 ${sizeClasses}`}
        >
          {showIcon && <Clock className={`${iconSizes} text-amber-600 shrink-0`} />}
          <span>Stale</span>
        </span>
      );

    case 'pending':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-md bg-sky-50 text-sky-800 border border-sky-200 ${sizeClasses}`}
        >
          {showIcon && <HelpCircle className={`${iconSizes} text-sky-600 shrink-0`} />}
          <span>Pending</span>
        </span>
      );

    case 'not-assessed':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-200 ${sizeClasses}`}
        >
          {showIcon && <FileQuestion className={`${iconSizes} text-slate-500 shrink-0`} />}
          <span>Not Assessed</span>
        </span>
      );

    case 'failed':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-md bg-red-100 text-red-900 border border-red-300 ${sizeClasses}`}
        >
          {showIcon && <XCircle className={`${iconSizes} text-red-600 shrink-0`} />}
          <span>Failed</span>
        </span>
      );

    default:
      return null;
  }
};

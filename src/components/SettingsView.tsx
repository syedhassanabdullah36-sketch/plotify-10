import React, { useRef, useState } from 'react';
import {
  Settings as SettingsIcon,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  ShieldAlert,
  CheckCircle,
  HelpCircle,
  HardDrive,
  FileCode,
  ShieldCheck,
} from 'lucide-react';
import { AppSettings, MeasurementUnit, Currency, Project } from '../types/project';
import { safeJsonParse } from '../utils/securityUtils';

interface SettingsViewProps {
  settings: AppSettings;
  projects: Project[];
  onUpdateSettings: (settings: AppSettings) => void;
  onRestoreSamples: () => void | Promise<boolean | void>;
  onClearAllData: () => void | Promise<boolean | void>;
  onImportProjects: (imported: Project[]) => void | Promise<boolean | void>;
  onOpenSystemHealth?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  projects,
  onUpdateSettings,
  onRestoreSamples,
  onClearAllData,
  onImportProjects,
  onOpenSystemHealth,
}) => {
  const [importMessage, setImportMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUnitChange = (unit: MeasurementUnit) => {
    onUpdateSettings({ ...settings, defaultUnit: unit });
  };

  const handleCurrencyChange = (currency: Currency) => {
    onUpdateSettings({ ...settings, defaultCurrency: currency });
  };

  const handleRoleChange = (role: 'architect' | 'homeowner') => {
    onUpdateSettings({ ...settings, role });
  };

  // Export JSON file
  const handleExportJSON = () => {
    const dataStr = JSON.stringify(projects, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `architecture_intelligence_os_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isBusy) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (isBusy) return;
      setIsBusy(true);
      try {
        const text = event.target?.result as string;
        const parsed = safeJsonParse<unknown[]>(text, []);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('Imported JSON file must contain an array of valid project records.');
        }

        const validProjects: Project[] = parsed.filter(
          (p): p is Project =>
            p !== null &&
            typeof p === 'object' &&
            typeof (p as Project).name === 'string' &&
            typeof (p as Project).plotWidth === 'number' &&
            (p as Project).plotWidth > 0 &&
            typeof (p as Project).plotLength === 'number' &&
            (p as Project).plotLength > 0
        );

        if (validProjects.length === 0) {
          throw new Error('No valid architectural project records found in the JSON file.');
        }

        const result = await onImportProjects(validProjects);
        if (result === false) {
          setImportMessage({
            text: 'Failed to persist imported projects to active storage provider.',
            isError: true,
          });
          return;
        }

        setImportMessage({
          text: `Successfully imported ${validProjects.length} projects with sanitized integrity verification.`,
          isError: false,
        });
      } catch (err: unknown) {
        setImportMessage({
          text: err instanceof Error ? err.message : 'Invalid JSON file structure.',
          isError: true,
        });
      } finally {
        setIsBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="pb-4 border-b border-slate-200">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Settings & Data Governance
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure default measurement units, export project backups, and view architectural scope boundaries.
        </p>
      </div>

      {/* Preferences Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <SettingsIcon className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-900">Application Defaults</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Default Unit */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Default Measurement Unit
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUnitChange('feet')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  settings.defaultUnit === 'feet'
                    ? 'border-teal-600 bg-teal-50/50 text-slate-900 ring-1 ring-teal-600'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                Feet (ft / sq ft)
              </button>
              <button
                type="button"
                onClick={() => handleUnitChange('metres')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  settings.defaultUnit === 'metres'
                    ? 'border-teal-600 bg-teal-50/50 text-slate-900 ring-1 ring-teal-600'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                Metres (m / m²)
              </button>
            </div>
          </div>

          {/* Default Currency */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Default Budget Currency
            </label>
            <select
              value={settings.defaultCurrency}
              onChange={(e) => handleCurrencyChange(e.target.value as Currency)}
              className="w-full py-2 px-3 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              {(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'AED', 'CHF'] as Currency[]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* User Profile Perspective */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              User Role Context
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleRoleChange('architect')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  settings.role === 'architect'
                    ? 'border-teal-600 bg-teal-50/50 text-slate-900 ring-1 ring-teal-600'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                Architect
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange('homeowner')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  settings.role === 'homeowner'
                    ? 'border-teal-600 bg-teal-50/50 text-slate-900 ring-1 ring-teal-600'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                Homeowner
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Data Management Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <HardDrive className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-900">Project Data & Local Storage</h3>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          All architectural projects are preserved directly inside your browser's local storage repository (<code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 text-[11px] font-mono">localStorage</code>). No remote server storage or external API is required.
        </p>

        {importMessage && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center justify-between ${
              importMessage.isError
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            <span>{importMessage.text}</span>
            <button
              onClick={() => setImportMessage(null)}
              className="text-xs font-semibold ml-2 underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* Export JSON */}
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Download className="w-4 h-4 text-slate-600" />
                <span>Backup Projects</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                Download a JSON backup of all {projects.length} project envelopes and room programs.
              </p>
            </div>
            <button
              onClick={handleExportJSON}
              className="mt-4 w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              Export JSON File
            </button>
          </div>

          {/* Import JSON */}
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-slate-600" />
                <span>Restore Backup</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                Import and merge previous project JSON files into your local workspace.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
                id="import-json-input"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                Select JSON File
              </button>
            </div>
          </div>

          {/* Reset to Samples */}
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-slate-600" />
                <span>Architectural Samples</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                Reset repository to standard villa, penthouse, and studio demo records.
              </p>
            </div>
            <button
              onClick={onRestoreSamples}
              className="mt-4 w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              Load Sample Data
            </button>
          </div>
        </div>

        {/* Clear Data Danger Zone */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Wipe all saved projects from browser storage:
          </div>
          {showClearConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 font-semibold">Are you sure?</span>
              <button
                onClick={() => {
                  onClearAllData();
                  setShowClearConfirm(false);
                }}
                className="px-3 py-1 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700 cursor-pointer"
              >
                Yes, Delete All
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1 bg-slate-100 text-slate-700 rounded text-xs hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Data</span>
            </button>
          )}
        </div>
      </div>

      {/* Production Infrastructure & Security Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Production Infrastructure & Security Engine
              </h3>
              <p className="text-xs text-slate-500">
                Storage quota diagnostics, schema integrity audits, full disaster recovery bundles, and client privacy governance.
              </p>
            </div>
          </div>
          {onOpenSystemHealth && (
            <button
              onClick={onOpenSystemHealth}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Open Security Engine</span>
            </button>
          )}
        </div>
      </div>

      {/* Professional Scope & Standards Card */}
      <div className="bg-amber-50/70 rounded-xl border border-amber-200/80 p-6 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-800" />
          <h3 className="text-sm font-bold text-amber-900">
            Professional Architectural Limits & Disclaimers
          </h3>
        </div>

        <p className="text-xs text-amber-900/90 leading-relaxed">
          <strong>Plotify — AI-Powered Architectural Intelligence</strong> is designed to manage architectural project programming, client brief specifications, plot boundaries, and spatial allocations.
        </p>

        <ul className="text-xs text-amber-900/80 space-y-1.5 pl-5 list-disc">
          <li><strong>No Construction Drawings:</strong> This software does not produce construction-ready, stamped architectural blueprints or detailed mechanical/electrical/plumbing (MEP) schematics.</li>
          <li><strong>No Structural Safety Certification:</strong> Dimension and room figures do not substitute for structural engineering, load calculations, seismic analysis, or foundation soil surveys.</li>
          <li><strong>No Building Code Guarantee:</strong> Municipal setback guidelines, floor-area ratios (FAR), and fire egress regulations vary by municipality and must be confirmed with local code officials.</li>
          <li><strong>No Verified Cost Estimates:</strong> Budget figures represent rough client guidelines, not formal general contractor tender bids.</li>
        </ul>
      </div>
    </div>
  );
};

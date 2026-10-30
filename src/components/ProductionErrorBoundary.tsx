/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Download, ShieldCheck, LifeBuoy } from 'lucide-react';
import { generateSystemBackup, downloadSystemBackup } from '../services/backupService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  exportedEmergencyBackup: boolean;
}

export class ProductionErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    exportedEmergencyBackup: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      exportedEmergencyBackup: false,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ProductionErrorBoundary] Caught runtime exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleEmergencyExport = () => {
    try {
      const backup = generateSystemBackup();
      downloadSystemBackup(backup);
      this.setState({ exportedEmergencyBackup: true });
    } catch (e) {
      console.error('[ProductionErrorBoundary] Emergency export failed:', e);
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetToSafeState = () => {
    // Clear potentially corrupted transient view states while preserving core storage
    try {
      sessionStorage.clear();
      window.location.href = window.location.pathname;
    } catch {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || 'An unexpected rendering or runtime error occurred.';

      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 selection:bg-rose-500 selection:text-white">
          <div className="max-w-2xl w-full bg-slate-800/90 border border-slate-700/80 rounded-2xl p-8 shadow-2xl backdrop-blur-sm space-y-6">
            {/* Header */}
            <div className="flex items-center space-x-4 border-b border-slate-700 pb-5">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
                  Plotify Operational Recovery Shield
                </h1>
                <p className="text-sm text-slate-400">
                  The application caught an unhandled runtime exception and protected your architectural project data from corruption.
                </p>
              </div>
            </div>

            {/* Error Details */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 font-mono text-xs text-rose-300 overflow-x-auto">
              <p className="font-semibold text-rose-400 mb-1">Diagnostic Log:</p>
              <p className="break-words">{errorMessage}</p>
            </div>

            {/* Reassurance Banner */}
            <div className="flex items-start space-x-3 bg-teal-950/40 border border-teal-800/50 rounded-xl p-4 text-xs text-teal-200">
              <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-teal-300">Data Integrity Intact</p>
                <p className="text-teal-200/80 mt-0.5">
                  Your stored projects, floor plans, and revision milestones remain safely preserved in local storage. You can immediately export an emergency backup before restarting.
                </p>
              </div>
            </div>

            {/* Recovery Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                onClick={this.handleEmergencyExport}
                className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>{this.state.exportedEmergencyBackup ? 'Backup Downloaded' : 'Export JSON Dump'}</span>
              </button>

              <button
                onClick={this.handleReload}
                className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-xs transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              <button
                onClick={this.handleResetToSafeState}
                className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 font-medium text-xs transition"
              >
                <LifeBuoy className="w-4 h-4" />
                <span>Restart Clean Session</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

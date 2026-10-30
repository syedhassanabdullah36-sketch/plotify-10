/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Bookmark, X, Check, User, Sparkles, AlertCircle } from 'lucide-react';
import { Project } from '../../types/project';
import { CollaboratorProfile, SnapshotTrigger } from '../../types/versioning';
import { DEFAULT_COLLABORATORS, getActiveCollaborator, setActiveCollaborator } from '../../services/versioningService';

interface SnapshotCreateModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onSave: (params: {
    trigger: SnapshotTrigger;
    label: string;
    description: string;
    versionTag: string;
    author: CollaboratorProfile;
  }) => void;
  suggestedTag?: string;
}

export const SnapshotCreateModal: React.FC<SnapshotCreateModalProps> = ({
  project,
  isOpen,
  onClose,
  onSave,
  suggestedTag = 'v1.1-Milestone',
}) => {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [versionTag, setVersionTag] = useState(suggestedTag);
  const [selectedAuthor, setSelectedAuthor] = useState<CollaboratorProfile>(getActiveCollaborator());
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      setError('Please provide a milestone title or revision label.');
      return;
    }
    setError(null);
    setActiveCollaborator(selectedAuthor);
    onSave({
      trigger: 'manual',
      label: label.trim(),
      description: description.trim(),
      versionTag: versionTag.trim() || suggestedTag,
      author: selectedAuthor,
    });
    setLabel('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
              <Bookmark className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                Create Project Milestone Snapshot
              </h3>
              <p className="text-xs text-slate-500">
                Preserve a verified, immutable state of "{project.name}"
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Version Tag
              </label>
              <input
                type="text"
                value={versionTag}
                onChange={(e) => setVersionTag(e.target.value)}
                placeholder="v1.0"
                className="w-full px-3 py-2 text-xs font-mono font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Milestone Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Approved Schematic Layout"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Author & Disciplinary Attribution
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 border border-slate-200 rounded-lg bg-slate-50/50">
              {DEFAULT_COLLABORATORS.map((collab) => {
                const isSelected = selectedAuthor.id === collab.id;
                return (
                  <button
                    key={collab.id}
                    type="button"
                    onClick={() => setSelectedAuthor(collab)}
                    className={`flex items-center gap-2.5 p-2 rounded-lg text-left transition-all border text-xs cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50 border-teal-400 text-teal-950 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[10px] shrink-0 ${collab.avatarColor}`}
                    >
                      {collab.initials}
                    </div>
                    <div className="truncate">
                      <div className="truncate leading-tight">{collab.name}</div>
                      <div className="text-[10px] text-slate-500 font-normal truncate">
                        {collab.roleTitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Change Log & Design Rationale
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe key architectural, structural, or MEP changes made in this revision..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>

          <div className="p-3 bg-teal-50/70 border border-teal-200/60 rounded-xl flex items-start gap-2.5 text-[11px] text-teal-900 leading-relaxed">
            <Sparkles className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Deterministic Geometry Frozen:</span> Snapshot will encapsulate all {project.floorPlan?.rooms?.length || 0} rooms, plot boundary dimensions, structural grid, MEP clash findings, and cost parameters.
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs hover:shadow transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Record Snapshot</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

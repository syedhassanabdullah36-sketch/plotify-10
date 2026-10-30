import React, { useState } from 'react';
import {
  ArrowLeft,
  Save,
  Compass,
  Layers,
  Building,
  Home,
  AlertCircle,
  Plus,
  Minus,
  CheckCircle,
  Maximize2,
  Coins,
  FileText,
} from 'lucide-react';
import {
  Project,
  ProjectFormData,
  ProjectType,
  MeasurementUnit,
  RoadFacingSide,
  Currency,
  ProjectStatus,
  RoomConfig,
} from '../types/project';
import { formatArea, formatCurrency } from '../utils/formatters';

interface ProjectFormViewProps {
  initialProject?: Project | null;
  onSave: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (project: Project) => void;
  onCancel: () => void;
  defaultUnit?: MeasurementUnit;
  defaultCurrency?: Currency;
}

export const ProjectFormView: React.FC<ProjectFormViewProps> = ({
  initialProject,
  onSave,
  onUpdate,
  onCancel,
  defaultUnit = 'feet',
  defaultCurrency = 'USD',
}) => {
  const isEditing = Boolean(initialProject);

  // Form State
  const [formData, setFormData] = useState<ProjectFormData>({
    name: initialProject ? initialProject.name : '',
    projectType: initialProject ? initialProject.projectType : 'house',
    customProjectType: initialProject?.customProjectType || '',
    plotWidth: initialProject ? initialProject.plotWidth.toString() : '40',
    plotLength: initialProject ? initialProject.plotLength.toString() : '70',
    unit: initialProject ? initialProject.unit : defaultUnit,
    roadFacing: initialProject ? initialProject.roadFacing : 'North',
    floors: initialProject ? initialProject.floors : 2,
    rooms: initialProject
      ? { ...initialProject.rooms }
      : {
          bedrooms: 3,
          bathrooms: 2,
          kitchen: 1,
          livingRoom: 1,
          diningRoom: 1,
          homeOffice: 0,
          balcony: 1,
          garage: 1,
          laundry: 1,
          storage: 0,
        },
    budget: initialProject ? initialProject.budget.toString() : '350000',
    currency: initialProject ? initialProject.currency : defaultCurrency,
    notes: initialProject ? initialProject.notes : '',
    status: initialProject ? initialProject.status : 'Drafting',
  });

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});

  const validate = () => {
    const errs: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      errs.name = 'Project name is required';
    } else if (formData.name.trim().length < 3) {
      errs.name = 'Project name must be at least 3 characters';
    }

    if (formData.projectType === 'other' && !formData.customProjectType?.trim()) {
      errs.customProjectType = 'Please specify the custom structure or project type';
    }

    const widthNum = parseFloat(formData.plotWidth);
    if (!formData.plotWidth || isNaN(widthNum) || widthNum <= 0) {
      errs.plotWidth = 'Plot width must be a positive number greater than 0';
    } else if (widthNum > 10000) {
      errs.plotWidth = 'Plot width exceeds realistic single-envelope boundaries';
    }

    const lengthNum = parseFloat(formData.plotLength);
    if (!formData.plotLength || isNaN(lengthNum) || lengthNum <= 0) {
      errs.plotLength = 'Plot length must be a positive number greater than 0';
    } else if (lengthNum > 10000) {
      errs.plotLength = 'Plot length exceeds realistic boundaries';
    }

    if (!formData.floors || formData.floors < 1) {
      errs.floors = 'Number of floors must be at least 1';
    } else if (formData.floors > 30) {
      errs.floors = 'Maximum 30 floors supported in this version';
    }

    const budgetNum = parseFloat(formData.budget);
    if (formData.budget && (isNaN(budgetNum) || budgetNum < 0)) {
      errs.budget = 'Budget must be a non-negative number';
    }

    if (formData.rooms.bedrooms < 0 || formData.rooms.bathrooms < 0 || formData.rooms.kitchen < 0) {
      errs.rooms = 'Room counts cannot be negative';
    }

    return errs;
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validate());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    setTouched({
      name: true,
      customProjectType: true,
      plotWidth: true,
      plotLength: true,
      floors: true,
      budget: true,
    });

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const widthNum = parseFloat(formData.plotWidth);
    const lengthNum = parseFloat(formData.plotLength);
    const budgetNum = parseFloat(formData.budget) || 0;

    const payload = {
      name: formData.name.trim(),
      projectType: formData.projectType,
      customProjectType: formData.customProjectType?.trim() || undefined,
      plotWidth: widthNum,
      plotLength: lengthNum,
      unit: formData.unit,
      roadFacing: formData.roadFacing,
      floors: Number(formData.floors),
      rooms: formData.rooms,
      budget: budgetNum,
      currency: formData.currency,
      notes: formData.notes.trim(),
      status: formData.status,
    };

    if (isEditing && initialProject) {
      onUpdate({
        ...initialProject,
        ...payload,
      });
    } else {
      onSave(payload);
    }
  };

  // Helper to adjust room counts
  const updateRoomCount = (roomKey: keyof RoomConfig, delta: number) => {
    setFormData((prev) => {
      const current = (prev.rooms[roomKey] as number) || 0;
      const next = Math.max(0, current + delta);
      return {
        ...prev,
        rooms: {
          ...prev.rooms,
          [roomKey]: next,
        },
      };
    });
  };

  // Real-time calculated geometry
  const widthVal = parseFloat(formData.plotWidth) || 0;
  const lengthVal = parseFloat(formData.plotLength) || 0;
  const { area, label: areaLabel } = formatArea(widthVal, lengthVal, formData.unit);

  const roadFacingOptions: RoadFacingSide[] = [
    'North',
    'South',
    'East',
    'West',
    'North-East',
    'North-West',
    'South-East',
    'South-West',
    'Corner / Multiple Roads',
  ];

  const currencyOptions: Currency[] = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'AED', 'CHF'];

  const statusOptions: ProjectStatus[] = [
    'Drafting',
    'Concept Feasibility',
    'Schematic Design',
    'Client Review',
    'Permit Review',
    'Approved',
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {isEditing ? `Edit "${initialProject?.name}"` : 'New Architectural Project'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Specify dimensional boundaries, orientation, and spatial program.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            <Save className="w-4 h-4 text-teal-400" />
            <span>{isEditing ? 'Save Changes' : 'Create Project'}</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Project Identity */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Building className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900">Project Identity & Type</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Project Name */}
            <div>
              <label htmlFor="projectName" className="block text-xs font-semibold text-slate-700 mb-1">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                id="projectName"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                onBlur={() => handleBlur('name')}
                placeholder="e.g. Modernist Courtyard Villa"
                className={`w-full px-3.5 py-2 text-sm bg-white border rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 ${
                  touched.name && errors.name
                    ? 'border-red-400 focus:ring-red-500/20'
                    : 'border-slate-200 focus:ring-teal-500/20 focus:border-teal-500'
                }`}
              />
              {touched.name && errors.name && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.name}</span>
                </p>
              )}
            </div>

            {/* Project Status */}
            <div>
              <label htmlFor="projectStatus" className="block text-xs font-semibold text-slate-700 mb-1">
                Project Status
              </label>
              <select
                id="projectStatus"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as ProjectStatus })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              >
                {statusOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Project Type Buttons */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Structure Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { type: 'house' as ProjectType, label: 'House / Villa', desc: 'Detached or semi-detached residential' },
                { type: 'apartment' as ProjectType, label: 'Apartment / Flat', desc: 'Multi-unit residential floor or suite' },
                { type: 'other' as ProjectType, label: 'Other', desc: 'Commercial, studio, or custom annex' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.type}
                  onClick={() => setFormData({ ...formData, projectType: item.type })}
                  className={`p-3 text-left rounded-lg border transition-all cursor-pointer ${
                    formData.projectType === item.type
                      ? 'border-teal-600 bg-teal-50/50 text-slate-900 shadow-xs ring-1 ring-teal-600'
                      : 'border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  <div className="font-semibold text-xs text-slate-900">{item.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>

            {formData.projectType === 'other' && (
              <div className="mt-3">
                <label htmlFor="customType" className="block text-xs font-semibold text-slate-700 mb-1">
                  Specify Project Type <span className="text-red-500">*</span>
                </label>
                <input
                  id="customType"
                  type="text"
                  value={formData.customProjectType || ''}
                  onChange={(e) => setFormData({ ...formData, customProjectType: e.target.value })}
                  onBlur={() => handleBlur('customProjectType')}
                  placeholder="e.g. Garden Pavilion, Artist Studio, Duplex Annex"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
                {touched.customProjectType && errors.customProjectType && (
                  <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{errors.customProjectType}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Plot Dimensions & Orientation */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-bold text-slate-900">Plot Dimensions & Orientation</h3>
            </div>

            {/* Units Toggle */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, unit: 'feet' })}
                className={`px-3 py-1 font-semibold rounded-md transition-all cursor-pointer ${
                  formData.unit === 'feet'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Feet (ft)
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, unit: 'metres' })}
                className={`px-3 py-1 font-semibold rounded-md transition-all cursor-pointer ${
                  formData.unit === 'metres'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Metres (m)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Plot Width */}
            <div>
              <label htmlFor="plotWidth" className="block text-xs font-semibold text-slate-700 mb-1">
                Plot Width ({formData.unit}) <span className="text-red-500">*</span>
              </label>
              <input
                id="plotWidth"
                type="number"
                step="0.1"
                min="0.1"
                value={formData.plotWidth}
                onChange={(e) => setFormData({ ...formData, plotWidth: e.target.value })}
                onBlur={() => handleBlur('plotWidth')}
                placeholder="40"
                className={`w-full px-3.5 py-2 text-sm bg-white border rounded-lg tabular-nums text-slate-900 focus:outline-hidden focus:ring-2 ${
                  touched.plotWidth && errors.plotWidth
                    ? 'border-red-400 focus:ring-red-500/20'
                    : 'border-slate-200 focus:ring-teal-500/20 focus:border-teal-500'
                }`}
              />
              {touched.plotWidth && errors.plotWidth && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.plotWidth}</span>
                </p>
              )}
            </div>

            {/* Plot Length */}
            <div>
              <label htmlFor="plotLength" className="block text-xs font-semibold text-slate-700 mb-1">
                Plot Length ({formData.unit}) <span className="text-red-500">*</span>
              </label>
              <input
                id="plotLength"
                type="number"
                step="0.1"
                min="0.1"
                value={formData.plotLength}
                onChange={(e) => setFormData({ ...formData, plotLength: e.target.value })}
                onBlur={() => handleBlur('plotLength')}
                placeholder="70"
                className={`w-full px-3.5 py-2 text-sm bg-white border rounded-lg tabular-nums text-slate-900 focus:outline-hidden focus:ring-2 ${
                  touched.plotLength && errors.plotLength
                    ? 'border-red-400 focus:ring-red-500/20'
                    : 'border-slate-200 focus:ring-teal-500/20 focus:border-teal-500'
                }`}
              />
              {touched.plotLength && errors.plotLength && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.plotLength}</span>
                </p>
              )}
            </div>
          </div>

          {/* Computed Area Live Preview */}
          {widthVal > 0 && lengthVal > 0 && (
            <div className="p-3.5 bg-teal-50/70 border border-teal-200/80 rounded-lg flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-teal-900">Total Plot Footprint Area:</span>
                <span className="font-bold text-teal-950 tabular-nums text-sm">{areaLabel}</span>
              </div>
              <div className="text-teal-700 tabular-nums">
                Aspect ratio: {(widthVal / lengthVal).toFixed(2)} : 1
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            {/* Road Facing Side */}
            <div>
              <label htmlFor="roadFacing" className="block text-xs font-semibold text-slate-700 mb-1">
                Road-Facing Elevation <span className="text-red-500">*</span>
              </label>
              <select
                id="roadFacing"
                value={formData.roadFacing}
                onChange={(e) => setFormData({ ...formData, roadFacing: e.target.value as RoadFacingSide })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              >
                {roadFacingOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Primary access road elevation, determines primary entrance and daylight orientation.
              </p>
            </div>

            {/* Number of Floors */}
            <div>
              <label htmlFor="floors" className="block text-xs font-semibold text-slate-700 mb-1">
                Number of Floors <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, floors: Math.max(1, prev.floors - 1) }))}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                  disabled={formData.floors <= 1}
                  aria-label="Decrease floors"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <input
                  id="floors"
                  type="number"
                  min="1"
                  max="30"
                  value={formData.floors}
                  onChange={(e) => setFormData({ ...formData, floors: parseInt(e.target.value) || 1 })}
                  onBlur={() => handleBlur('floors')}
                  className="w-24 text-center font-bold text-slate-900 py-1.5 border border-slate-200 rounded-lg tabular-nums text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />

                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, floors: Math.min(30, prev.floors + 1) }))}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                  aria-label="Increase floors"
                >
                  <Plus className="w-4 h-4" />
                </button>

                <span className="text-xs text-slate-500">
                  {formData.floors === 1 ? 'Single Story (Ground)' : `${formData.floors} Storeys`}
                </span>
              </div>
              {touched.floors && errors.floors && (
                <p className="mt-1 text-xs text-red-600">{errors.floors}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Room Programming Requirements */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-bold text-slate-900">Required Rooms & Spatial Program</h3>
            </div>
            <span className="text-xs text-slate-500">
              Total Programmed Spaces:{' '}
              <strong className="text-slate-800 tabular-nums">
                {Object.values(formData.rooms)
                  .filter((v): v is number => typeof v === 'number')
                  .reduce((a, b) => a + b, 0)}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Bedrooms */}
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <div className="text-xs font-semibold text-slate-800">Bedrooms</div>
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => updateRoomCount('bedrooms', -1)}
                  className="p-1 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer"
                  aria-label="Decrease bedrooms"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-base font-bold text-slate-900 tabular-nums">
                  {formData.rooms.bedrooms}
                </span>
                <button
                  type="button"
                  onClick={() => updateRoomCount('bedrooms', 1)}
                  className="p-1 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer"
                  aria-label="Increase bedrooms"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Bathrooms */}
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <div className="text-xs font-semibold text-slate-800">Bathrooms</div>
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => updateRoomCount('bathrooms', -1)}
                  className="p-1 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer"
                  aria-label="Decrease bathrooms"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-base font-bold text-slate-900 tabular-nums">
                  {formData.rooms.bathrooms}
                </span>
                <button
                  type="button"
                  onClick={() => updateRoomCount('bathrooms', 1)}
                  className="p-1 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer"
                  aria-label="Increase bathrooms"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Kitchen */}
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <div className="text-xs font-semibold text-slate-800">Kitchens</div>
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => updateRoomCount('kitchen', -1)}
                  className="p-1 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer"
                  aria-label="Decrease kitchens"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-base font-bold text-slate-900 tabular-nums">
                  {formData.rooms.kitchen}
                </span>
                <button
                  type="button"
                  onClick={() => updateRoomCount('kitchen', 1)}
                  className="p-1 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer"
                  aria-label="Increase kitchens"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Living Room */}
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <div className="text-xs font-semibold text-slate-800">Living Rooms</div>
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => updateRoomCount('livingRoom', -1)}
                  className="p-1 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer"
                  aria-label="Decrease living rooms"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-base font-bold text-slate-900 tabular-nums">
                  {formData.rooms.livingRoom}
                </span>
                <button
                  type="button"
                  onClick={() => updateRoomCount('livingRoom', 1)}
                  className="p-1 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer"
                  aria-label="Increase living rooms"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Optional additional architectural spaces */}
          <div className="pt-2">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Auxiliary & Specialized Spaces
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {[
                { key: 'diningRoom' as keyof RoomConfig, label: 'Dining' },
                { key: 'homeOffice' as keyof RoomConfig, label: 'Office' },
                { key: 'balcony' as keyof RoomConfig, label: 'Balcony' },
                { key: 'garage' as keyof RoomConfig, label: 'Garage' },
                { key: 'laundry' as keyof RoomConfig, label: 'Laundry' },
                { key: 'storage' as keyof RoomConfig, label: 'Storage' },
              ].map((aux) => {
                const count = (formData.rooms[aux.key] as number) || 0;
                return (
                  <div
                    key={aux.key}
                    className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 text-center"
                  >
                    <div className="text-[11px] font-medium text-slate-600 truncate">{aux.label}</div>
                    <div className="mt-1 flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateRoomCount(aux.key, -1)}
                        className="w-5 h-5 flex items-center justify-center bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-100 text-xs cursor-pointer"
                        aria-label={`Decrease ${aux.label}`}
                      >
                        -
                      </button>
                      <span className="text-xs font-bold text-slate-900 tabular-nums w-4 text-center">
                        {count}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateRoomCount(aux.key, 1)}
                        className="w-5 h-5 flex items-center justify-center bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-100 text-xs cursor-pointer"
                        aria-label={`Increase ${aux.label}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Section 4: Budget & Financial Planning */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Coins className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900">Approximate Budget & Currency</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Currency selector */}
            <div>
              <label htmlFor="currency" className="block text-xs font-semibold text-slate-700 mb-1">
                Selected Currency <span className="text-red-500">*</span>
              </label>
              <select
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value as Currency })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              >
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>
                    {c} ({formatCurrency(1000, c).replace(/\d|,/g, '').trim()})
                  </option>
                ))}
              </select>
            </div>

            {/* Approximate Budget */}
            <div>
              <label htmlFor="budget" className="block text-xs font-semibold text-slate-700 mb-1">
                Approximate Target Budget
              </label>
              <div className="relative">
                <input
                  id="budget"
                  type="number"
                  min="0"
                  step="1000"
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  onBlur={() => handleBlur('budget')}
                  placeholder="350000"
                  className={`w-full px-3.5 py-2 text-sm bg-white border rounded-lg tabular-nums text-slate-900 focus:outline-hidden focus:ring-2 ${
                    touched.budget && errors.budget
                      ? 'border-red-400 focus:ring-red-500/20'
                      : 'border-slate-200 focus:ring-teal-500/20 focus:border-teal-500'
                  }`}
                />
              </div>
              {touched.budget && errors.budget ? (
                <p className="mt-1 text-xs text-red-600">{errors.budget}</p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                  Formatted:{' '}
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(parseFloat(formData.budget) || 0, formData.currency)}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section 5: Optional Project Notes */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <FileText className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-900">Project Notes & Constraints</h3>
          </div>

          <div>
            <label htmlFor="projectNotes" className="block text-xs font-semibold text-slate-700 mb-1">
              Architectural Notes, Soil/Slope Observations, or Client Goals (Optional)
            </label>
            <textarea
              id="projectNotes"
              rows={4}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g. South elevation requires shaded overhangs. Rear plot contains mature oak tree to be preserved. Client requested high energy efficiency and cross-ventilation."
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
              <span>Supports site considerations, setbacks, and client brief details</span>
              <span>{formData.notes.length} characters</span>
            </div>
          </div>
        </div>

        {/* Bottom Submission Bar */}
        <div className="pt-2 pb-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs hover:shadow-md transition-all cursor-pointer"
          >
            <Save className="w-4 h-4 text-teal-400" />
            <span>{isEditing ? 'Save Changes' : 'Create Project'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

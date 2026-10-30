import React, { useState, useMemo } from 'react';
import { Project, RoadFacingSide, FloorPlanRoom } from '../../types/project';
import {
  SiteContextData,
  SiteAccessPoint,
  SiteObstacle,
  NeighborContext,
  SiteSetbacks,
  PreservationStatus,
  ObstacleType,
} from '../../types/siteContext';
import {
  initializeProjectSiteContext,
  computeBuildingPlacementBounds,
  evaluateSiteConstraints,
  evaluateSolarOrientation,
} from '../../services/siteIntelligenceService';
import {
  Compass,
  ArrowLeft,
  MapPin,
  Save,
  RotateCcw,
  TreePine,
  Sun,
  Wind,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Eye,
  Sliders,
  Plus,
  Trash2,
  Camera,
  Maximize2,
  FileCheck2,
  Info,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import { formatArea } from '../../utils/formatters';

interface SiteContextWorkspaceProps {
  project: Project;
  onBack: () => void;
  onSaveProject: (updated: Project) => void;
  onOpenFloorPlan?: (project: Project) => void;
  onOpenEvidenceLedger?: (project: Project) => void;
  onOpenDocumentation?: (project: Project) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type SiteTab = 'site-plan' | 'profile-setup' | 'setbacks-obstacles' | 'solar-environmental' | 'constraints-audit' | 'photo-evidence';

export const SiteContextWorkspace: React.FC<SiteContextWorkspaceProps> = ({
  project,
  onBack,
  onSaveProject,
  onOpenFloorPlan,
  onOpenEvidenceLedger,
  onOpenDocumentation,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<SiteTab>('site-plan');

  // Working site context state
  const [siteData, setSiteData] = useState<SiteContextData>(() =>
    initializeProjectSiteContext(project)
  );

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [selectedObstacleId, setSelectedObstacleId] = useState<string | null>(null);

  // New obstacle draft form modal/drawer
  const [isAddingObstacle, setIsAddingObstacle] = useState<boolean>(false);
  const [newObstacleType, setNewObstacleType] = useState<ObstacleType>('tree');
  const [newObstacleName, setNewObstacleName] = useState<string>('Mature Oak Tree');
  const [newObstacleX, setNewObstacleX] = useState<number>(10);
  const [newObstacleY, setNewObstacleY] = useState<number>(10);
  const [newObstacleSize, setNewObstacleSize] = useState<number>(8);
  const [newObstaclePreserve, setNewObstaclePreserve] = useState<PreservationStatus>('preserve-mandatory');

  // Photo attachment draft
  const [isAddingPhoto, setIsAddingPhoto] = useState<boolean>(false);
  const [newPhotoTitle, setNewPhotoTitle] = useState<string>('Front Street Approach');
  const [newPhotoCaption, setNewPhotoCaption] = useState<string>('View looking towards northern property boundary.');
  const [newPhotoDirection, setNewPhotoDirection] = useState<RoadFacingSide>(project.roadFacing);

  // Derived analyses
  const projectWithActiveSite = useMemo<Project>(() => {
    return {
      ...project,
      siteContext: siteData,
    };
  }, [project, siteData]);

  const bounds = useMemo(() => computeBuildingPlacementBounds(projectWithActiveSite), [projectWithActiveSite]);
  const constraints = useMemo(() => evaluateSiteConstraints(projectWithActiveSite), [projectWithActiveSite]);
  const solarAnalysis = useMemo(() => evaluateSolarOrientation(projectWithActiveSite), [projectWithActiveSite]);

  const unitLabel = project.unit === 'feet' ? 'ft' : 'm';
  const unitAreaLabel = project.unit === 'feet' ? 'sq ft' : 'm²';
  const parcelArea = project.plotWidth * project.plotLength;

  // Save handler
  const handleSave = () => {
    const updated: Project = {
      ...project,
      siteContext: {
        ...siteData,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    onSaveProject(updated);
    setHasUnsavedChanges(false);
    onShowToast?.('Site & context profile saved successfully!', 'success');
  };

  const updateSite = (updater: (prev: SiteContextData) => SiteContextData) => {
    setSiteData((prev) => {
      const next = updater(prev);
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleAddObstacle = (e: React.FormEvent) => {
    e.preventDefault();
    const newObs: SiteObstacle = {
      id: `obs-${Date.now()}`,
      name: newObstacleName.trim() || 'Site Feature',
      type: newObstacleType,
      x: Number(newObstacleX) || 0,
      y: Number(newObstacleY) || 0,
      width: Number(newObstacleSize) || 5,
      length: Number(newObstacleSize) || 5,
      preservationStatus: newObstaclePreserve,
      notes: 'Recorded in Site & Context Intelligence profile.',
    };

    updateSite((prev) => ({
      ...prev,
      obstacles: [...prev.obstacles, newObs],
    }));

    setIsAddingObstacle(false);
    onShowToast?.(`Added site feature "${newObs.name}"`, 'success');
  };

  const handleDeleteObstacle = (id: string) => {
    updateSite((prev) => ({
      ...prev,
      obstacles: prev.obstacles.filter((o) => o.id !== id),
    }));
    if (selectedObstacleId === id) setSelectedObstacleId(null);
    onShowToast?.('Removed site feature.', 'info');
  };

  const handleAddPhoto = (e: React.FormEvent) => {
    e.preventDefault();
    updateSite((prev) => ({
      ...prev,
      photos: [
        ...prev.photos,
        {
          id: `photo-${Date.now()}`,
          title: newPhotoTitle.trim() || 'Site Photo',
          caption: newPhotoCaption.trim(),
          observationDate: new Date().toISOString().split('T')[0],
          facingDirection: newPhotoDirection,
        },
      ],
    }));
    setIsAddingPhoto(false);
    onShowToast?.('Added site reference observation.', 'success');
  };

  const handleDeletePhoto = (id: string) => {
    updateSite((prev) => ({
      ...prev,
      photos: prev.photos.filter((p) => p.id !== id),
    }));
    onShowToast?.('Deleted site reference photo entry.', 'info');
  };

  // Interactive SVG Site Plan Rendering
  const renderInteractiveSitePlan = () => {
    const plotW = Math.max(project.plotWidth, 10);
    const plotL = Math.max(project.plotLength, 10);

    // Padding around parcel for dimension markings, compass, setback labels
    const pad = 16;
    const viewW = plotW + pad * 2;
    const viewL = plotL + pad * 2;

    const rooms = (project.floorPlan?.rooms || []).filter((r) => (r.floorLevel || 1) === 1);
    const s = siteData.setbacks;

    // Setback lines coordinates inside parcel
    const sbLeft = pad + s.sideLeft;
    const sbRight = pad + plotW - s.sideRight;
    let sbTop = pad + s.front;
    let sbBottom = pad + plotL - s.rear;

    if (project.roadFacing.includes('South')) {
      sbTop = pad + s.rear;
      sbBottom = pad + plotL - s.front;
    }

    const sbWidth = Math.max(0, sbRight - sbLeft);
    const sbHeight = Math.max(0, sbBottom - sbTop);

    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
              <Compass className="w-4 h-4 text-teal-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Interactive Site & Placement Plan
              </h3>
              <p className="text-[11px] text-slate-500">
                True North: {siteData.northOrientationOffsetDeg}° • Road Frontage: {project.roadFacing} • Parcel Area: {parcelArea.toLocaleString()} {unitAreaLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddingObstacle(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-xs shadow-2xs transition-colors cursor-pointer"
            >
              <TreePine className="w-3.5 h-3.5 text-emerald-700" />
              <span>Add Obstacle / Tree</span>
            </button>
            {onOpenFloorPlan && (
              <button
                onClick={() => onOpenFloorPlan(project)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-900 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-teal-700" />
                <span>Adjust 2D Rooms</span>
              </button>
            )}
          </div>
        </div>

        {/* SVG Drawing Canvas */}
        <div className="w-full flex justify-center bg-white rounded-xl border border-slate-200 p-2 sm:p-4 overflow-x-auto shadow-inner select-none relative">
          <svg
            viewBox={`0 0 ${viewW} ${viewL}`}
            className="w-full max-w-[760px] h-auto max-h-[500px]"
            role="img"
            aria-label={`Site plan for ${project.name}`}
          >
            <defs>
              {/* Setback hatched pattern */}
              <pattern id="setback-stripe" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="4" stroke="#f1f5f9" strokeWidth="2" />
              </pattern>
            </defs>

            {/* Surrounding Context Ground */}
            <rect x="0" y="0" width={viewW} height={viewL} fill="#f8fafc" />

            {/* Road Indicator Band along designated frontage */}
            {project.roadFacing.includes('North') && (
              <rect x={pad - 4} y="1" width={plotW + 8} height={pad - 3} fill="#334155" rx="1" />
            )}
            {project.roadFacing.includes('South') && (
              <rect x={pad - 4} y={pad + plotL + 2} width={plotW + 8} height={pad - 3} fill="#334155" rx="1" />
            )}
            {project.roadFacing.includes('West') && (
              <rect x="1" y={pad - 4} width={pad - 3} height={plotL + 8} fill="#334155" rx="1" />
            )}
            {project.roadFacing.includes('East') && (
              <rect x={pad + plotW + 2} y={pad - 4} width={pad - 3} height={plotL + 8} fill="#334155" rx="1" />
            )}

            {/* Legal Plot Parcel Boundary */}
            <rect
              x={pad}
              y={pad}
              width={plotW}
              height={plotL}
              fill="#ffffff"
              stroke="#0f766e"
              strokeWidth="0.8"
              strokeDasharray="2.5, 2.5"
            />

            {/* Setback Buffer Zone Rectangle (Allowable Building Envelope) */}
            {sbWidth > 0 && sbHeight > 0 && (
              <g>
                <rect
                  x={sbLeft}
                  y={sbTop}
                  width={sbWidth}
                  height={sbHeight}
                  fill="#f0fdfa"
                  stroke="#14b8a6"
                  strokeWidth="0.5"
                  strokeDasharray="1.5, 1.5"
                />
                <text
                  x={sbLeft + 1}
                  y={sbTop + 2.5}
                  fontSize={Math.max(plotW * 0.02, 1.6)}
                  fill="#0d9488"
                  fontWeight="bold"
                >
                  Allowable Build Envelope
                </text>
              </g>
            )}

            {/* Dimension markings on parcel perimeter */}
            <text
              x={pad + plotW / 2}
              y={pad - 2.5}
              fontSize={Math.max(plotW * 0.03, 2.2)}
              fill="#0f766e"
              textAnchor="middle"
              fontWeight="bold"
            >
              Width: {plotW} {unitLabel}
            </text>
            <text
              x={pad - 2.5}
              y={pad + plotL / 2}
              fontSize={Math.max(plotL * 0.03, 2.2)}
              fill="#0f766e"
              textAnchor="middle"
              fontWeight="bold"
              transform={`rotate(-90 ${pad - 2.5} ${pad + plotL / 2})`}
            >
              Depth: {plotL} {unitLabel}
            </text>

            {/* Setback Dimension Tags */}
            <text
              x={pad + plotW / 2}
              y={sbTop - 1}
              fontSize={Math.max(plotW * 0.022, 1.8)}
              fill="#64748b"
              textAnchor="middle"
            >
              Front Setback: {s.front} {unitLabel}
            </text>
            <text
              x={pad + plotW / 2}
              y={sbBottom + 2.5}
              fontSize={Math.max(plotW * 0.022, 1.8)}
              fill="#64748b"
              textAnchor="middle"
            >
              Rear Setback: {s.rear} {unitLabel}
            </text>

            {/* Access Points on Parcel Edges */}
            {siteData.accessPoints.map((acc) => {
              const ax = pad + Math.min(acc.offsetAlongSide, plotW - acc.width);
              const ay = pad;
              return (
                <g key={acc.id}>
                  <rect
                    x={ax}
                    y={ay - 1}
                    width={acc.width}
                    height="2"
                    fill="#f59e0b"
                    stroke="#b45309"
                    strokeWidth="0.5"
                  />
                  <text
                    x={ax + acc.width / 2}
                    y={ay + 3}
                    fontSize={Math.max(plotW * 0.02, 1.6)}
                    fill="#92400e"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    Gate: {acc.name} ({acc.width} {unitLabel})
                  </text>
                </g>
              );
            })}

            {/* Preserved Obstacles & Trees */}
            {siteData.obstacles.map((obs) => {
              const ox = pad + obs.x;
              const oy = pad + obs.y;
              const isTree = obs.type === 'tree';
              const isSelected = selectedObstacleId === obs.id;

              return (
                <g
                  key={obs.id}
                  onClick={() => setSelectedObstacleId(obs.id)}
                  className="cursor-pointer"
                >
                  {isTree ? (
                    <g>
                      {/* Tree canopy */}
                      <circle
                        cx={ox + obs.width / 2}
                        cy={oy + obs.length / 2}
                        r={obs.width / 2}
                        fill="#dcfce7"
                        stroke="#16a34a"
                        strokeWidth={isSelected ? 1.2 : 0.6}
                      />
                      {/* Tree trunk */}
                      <circle
                        cx={ox + obs.width / 2}
                        cy={oy + obs.length / 2}
                        r={obs.width * 0.15}
                        fill="#15803d"
                      />
                    </g>
                  ) : (
                    <rect
                      x={ox}
                      y={oy}
                      width={obs.width}
                      height={obs.length}
                      fill="#fed7aa"
                      stroke="#ea580c"
                      strokeWidth={isSelected ? 1.2 : 0.6}
                      rx="0.5"
                    />
                  )}
                  <text
                    x={ox + obs.width / 2}
                    y={oy + obs.length + 2}
                    fontSize={Math.max(plotW * 0.018, 1.5)}
                    fill="#1e293b"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {obs.name}
                  </text>
                </g>
              );
            })}

            {/* Ground-Floor Building Footprint Rooms */}
            {rooms.map((room) => {
              const rx = pad + room.x;
              const ry = pad + room.y;
              const rw = room.width;
              const rl = room.length;

              const isOutOfBounds =
                room.x < 0 ||
                room.y < 0 ||
                room.x + room.width > project.plotWidth ||
                room.y + room.length > project.plotLength;

              const fontSz = Math.max(Math.min(rw, rl) * 0.18, 1.6);

              return (
                <g key={room.id}>
                  <rect
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rl}
                    fill="#f1f5f9"
                    stroke={isOutOfBounds ? '#e11d48' : '#334155'}
                    strokeWidth={isOutOfBounds ? 1.2 : 0.8}
                    rx="0.5"
                  />
                  <text
                    x={rx + rw / 2}
                    y={ry + rl / 2}
                    fontSize={fontSz}
                    fill="#0f172a"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {room.name}
                  </text>
                </g>
              );
            })}

            {/* Compass Rose / North Indicator at Top-Right */}
            <g transform={`translate(${viewW - 10}, 8) rotate(${siteData.northOrientationOffsetDeg})`}>
              <circle cx="0" cy="0" r="5" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.5" />
              <polygon points="0,-4.5 1.8,1.5 0,0 -1.8,1.5" fill="#e11d48" />
              <polygon points="0,4.5 1.8,-1.5 0,0 -1.8,-1.5" fill="#64748b" />
              <text x="0" y="-5.5" fontSize="2" fill="#e11d48" fontWeight="bold" textAnchor="middle">
                N
              </text>
            </g>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-3 pt-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border border-dashed border-teal-600 bg-white inline-block" />
              Plot Parcel Boundary
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border border-dashed border-teal-400 bg-teal-50 inline-block" />
              Allowable Build Zone (Setbacks)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border border-slate-700 bg-slate-100 inline-block" />
              Building Footprint (Level 1)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-200 border border-emerald-600 inline-block" />
              Protected Tree / Obstacle
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-amber-400 inline-block" />
              Access Gate
            </span>
          </div>

          <span className="font-mono text-slate-400">
            Coordinates: (0,0) Top-Left of Parcel
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* 1. Header Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Return to Project Overview"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-800 border border-teal-200 flex items-center justify-center font-bold shadow-2xs">
              <Compass className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Site & Context Intelligence Engine
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-teal-100 text-teal-900 border border-teal-200">
                  Module v1.0
                </span>
                {hasUnsavedChanges && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900">
                    Unsaved Edits
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Physical context, solar path, setbacks, obstacles, and environmental constraints for{' '}
                <strong className="text-slate-700">{project.name}</strong>
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => {
                setSiteData(initializeProjectSiteContext(project));
                setHasUnsavedChanges(false);
                onShowToast?.('Reset site profile to project defaults.', 'info');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset</span>
            </button>

            <button
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-teal-400" />
              <span>Save Site Profile</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Site Navigation Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-xs flex flex-wrap gap-1">
        {[
          { id: 'site-plan' as const, label: 'Site Plan & Layout', icon: Compass },
          { id: 'profile-setup' as const, label: 'Parcel & Topography', icon: MapPin },
          { id: 'setbacks-obstacles' as const, label: 'Setbacks & Features', icon: TreePine },
          { id: 'solar-environmental' as const, label: 'Sun & Microclimate', icon: Sun },
          { id: 'constraints-audit' as const, label: 'Constraints Audit', icon: ShieldCheck, badge: constraints.filter((c) => c.status === 'conflict').length },
          { id: 'photo-evidence' as const, label: 'Photos & Field Notes', icon: Camera, badge: siteData.photos.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-teal-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {typeof tab.badge === 'number' && tab.badge > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isActive ? 'bg-teal-400 text-slate-900' : 'bg-rose-100 text-rose-800'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Tab Contents */}

      {/* TAB 1: INTERACTIVE SITE PLAN */}
      {activeTab === 'site-plan' && (
        <div className="space-y-6">
          {renderInteractiveSitePlan()}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 bg-white rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-400 block font-medium">Parcel Legal Dimensions</span>
              <strong className="text-base text-slate-900 block mt-0.5">
                {project.plotWidth} × {project.plotLength} {unitLabel}
              </strong>
              <span className="text-[11px] text-teal-700 font-medium">Area: {parcelArea.toLocaleString()} {unitAreaLabel}</span>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-400 block font-medium">Ground Footprint Placement</span>
              <strong className="text-base text-slate-900 block mt-0.5">
                {bounds.hasRooms ? `${bounds.width} × ${bounds.length} ${unitLabel}` : 'No Rooms Placed'}
              </strong>
              <span className="text-[11px] text-slate-500 font-medium">{bounds.groundArea} {unitAreaLabel} Built Ground Area</span>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-400 block font-medium">Design Setback Standard</span>
              <strong className="text-base text-slate-900 block mt-0.5">
                Front: {siteData.setbacks.front}{unitLabel} · Rear: {siteData.setbacks.rear}{unitLabel}
              </strong>
              <span className="text-[11px] text-slate-500">Sides: {siteData.setbacks.sideLeft}{unitLabel} & {siteData.setbacks.sideRight}{unitLabel}</span>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-400 block font-medium">Topography & Gradient</span>
              <strong className="text-base text-slate-900 block mt-0.5 capitalize">
                {siteData.slope.replace(/-/g, ' ')}
              </strong>
              <span className="text-[11px] text-slate-500">Drainage: {siteData.slopeDirection}</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PARCEL & TOPOGRAPHY SETUP */}
      {activeTab === 'profile-setup' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-base font-bold text-slate-900">Parcel Identification & Topography</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Record user-observed or survey-recorded physical location parameters.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* Site / Plot Name */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Plot / Parcel Name</label>
              <input
                type="text"
                value={siteData.siteName || ''}
                onChange={(e) => updateSite((p) => ({ ...p, siteName: e.target.value }))}
                placeholder="e.g. Lot 42, Alpine Pines Estate"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-600"
              />
            </div>

            {/* Address / Location Description */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Project Address / Location Description</label>
              <input
                type="text"
                value={siteData.address || ''}
                onChange={(e) => updateSite((p) => ({ ...p, address: e.target.value }))}
                placeholder="e.g. 1422 Timberline Ridge Road"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-600"
              />
            </div>

            {/* City / Region */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">City / Municipality / Region</label>
              <input
                type="text"
                value={siteData.cityRegion || ''}
                onChange={(e) => updateSite((p) => ({ ...p, cityRegion: e.target.value }))}
                placeholder="e.g. Zurich Canton, Switzerland"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-600"
              />
            </div>

            {/* Location Confidence Classification */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Source & Confidence Level</label>
              <select
                value={siteData.locationConfidence}
                onChange={(e) => updateSite((p) => ({ ...p, locationConfidence: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-600 cursor-pointer"
              >
                <option value="user-observation">User Field Observation (Unverified)</option>
                <option value="survey-stamped">Licensed Cadastral Land Survey (Stamped)</option>
                <option value="municipal-cadastral">Official Municipal GIS Title Record</option>
                <option value="unverified">Estimated / Preliminary Concept</option>
              </select>
            </div>

            {/* Optional Coordinates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Latitude (Optional)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={siteData.latitude ?? ''}
                  onChange={(e) => updateSite((p) => ({ ...p, latitude: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  placeholder="e.g. 47.3769"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-600"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Longitude (Optional)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={siteData.longitude ?? ''}
                  onChange={(e) => updateSite((p) => ({ ...p, longitude: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  placeholder="e.g. 8.5417"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-600"
                />
              </div>
            </div>

            {/* North Orientation Offset Slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700">True North Alignment Offset</label>
                <span className="font-mono text-teal-700 font-bold">{siteData.northOrientationOffsetDeg}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="359"
                value={siteData.northOrientationOffsetDeg}
                onChange={(e) => updateSite((p) => ({ ...p, northOrientationOffsetDeg: parseInt(e.target.value, 10) }))}
                className="w-full accent-teal-600 cursor-pointer"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                <span>0° (Top is North)</span>
                <span>90° (East)</span>
                <span>180° (South)</span>
                <span>270° (West)</span>
              </div>
            </div>

            {/* Topography Slope & Direction */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Topography Gradient</label>
              <select
                value={siteData.slope}
                onChange={(e) => updateSite((p) => ({ ...p, slope: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-600 cursor-pointer"
              >
                <option value="flat-under-2-pct">Flat Site (&lt; 2% slope) — Standard Slab / Footings</option>
                <option value="gentle-2-to-5-pct">Gentle Slope (2% - 5%) — Minimal Cut &amp; Fill</option>
                <option value="moderate-5-to-10-pct">Moderate Slope (5% - 10%) — Stepped Foundations</option>
                <option value="steep-over-10-pct">Steep Slope (&gt; 10%) — Retaining Walls &amp; Grading</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Slope Downward Fall Direction</label>
              <select
                value={siteData.slopeDirection}
                onChange={(e) => updateSite((p) => ({ ...p, slopeDirection: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-teal-600 cursor-pointer"
              >
                <option value="None">None (Flat Terrain)</option>
                <option value="North">Towards North</option>
                <option value="South">Towards South</option>
                <option value="East">Towards East</option>
                <option value="West">Towards West</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1 text-xs">Site History & Environmental Notes</label>
            <textarea
              rows={3}
              value={siteData.generalNotes || ''}
              onChange={(e) => updateSite((p) => ({ ...p, generalNotes: e.target.value }))}
              placeholder="Record known easements, soil conditions, historic land use, underground utility markers, or boundary peg observations..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-teal-600"
            />
          </div>
        </div>
      )}

      {/* TAB 3: SETBACKS & OBSTACLES */}
      {activeTab === 'setbacks-obstacles' && (
        <div className="space-y-6">
          {/* Setbacks Configuration */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Zoning Setback Clearance Lines</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Define required perimeter buffer zones (in {unitLabel}). The building footprint will be checked against these limits.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Front Yard Setback</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={siteData.setbacks.front}
                    onChange={(e) =>
                      updateSite((p) => ({
                        ...p,
                        setbacks: { ...p.setbacks, front: Math.max(0, parseFloat(e.target.value) || 0) },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900"
                  />
                  <span className="text-slate-500 font-mono">{unitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Along road frontage</span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Rear Yard Setback</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={siteData.setbacks.rear}
                    onChange={(e) =>
                      updateSite((p) => ({
                        ...p,
                        setbacks: { ...p.setbacks, rear: Math.max(0, parseFloat(e.target.value) || 0) },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900"
                  />
                  <span className="text-slate-500 font-mono">{unitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Opposite road frontage</span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Left Side Setback</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={siteData.setbacks.sideLeft}
                    onChange={(e) =>
                      updateSite((p) => ({
                        ...p,
                        setbacks: { ...p.setbacks, sideLeft: Math.max(0, parseFloat(e.target.value) || 0) },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900"
                  />
                  <span className="text-slate-500 font-mono">{unitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Perimeter boundary</span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Right Side Setback</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={siteData.setbacks.sideRight}
                    onChange={(e) =>
                      updateSite((p) => ({
                        ...p,
                        setbacks: { ...p.setbacks, sideRight: Math.max(0, parseFloat(e.target.value) || 0) },
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900"
                  />
                  <span className="text-slate-500 font-mono">{unitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Perimeter boundary</span>
              </div>
            </div>
          </div>

          {/* Existing Obstacles & Trees List */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Protected Trees & Physical Site Obstacles</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Features that constrain building footprint placement (trees, easements, utility poles).
                </p>
              </div>

              <button
                onClick={() => setIsAddingObstacle(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-teal-400" />
                <span>Add Feature</span>
              </button>
            </div>

            {siteData.obstacles.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No physical obstacles or protected trees recorded on this site.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Feature Name</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 font-mono">Location (X, Y)</th>
                      <th className="py-2.5 px-3 font-mono">Dimension</th>
                      <th className="py-2.5 px-3">Preservation Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {siteData.obstacles.map((obs) => (
                      <tr key={obs.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{obs.name}</td>
                        <td className="py-2.5 px-3 capitalize text-slate-600">{obs.type.replace('-', ' ')}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">({obs.x}, {obs.y}) {unitLabel}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">{obs.width} × {obs.length} {unitLabel}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              obs.preservationStatus === 'preserve-mandatory'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : obs.preservationStatus === 'preserve-preferred'
                                ? 'bg-teal-50 text-teal-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {obs.preservationStatus.replace(/-/g, ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleDeleteObstacle(obs.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="Delete obstacle"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SOLAR & ENVIRONMENTAL */}
      {activeTab === 'solar-environmental' && (
        <div className="space-y-6">
          {/* Solar Facade Exposure Cards */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Facade Solar Exposure & Daylighting Analysis</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Deterministic geometric solar calculation based on {siteData.northOrientationOffsetDeg}° North orientation angle.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">North Facade</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-900 inline-block capitalize">
                  {solarAnalysis.facadeSunExposure.northFacade.replace(/-/g, ' ')}
                </span>
                <p className="text-[11px] text-slate-500 leading-tight pt-1">
                  Even, diffuse daylight with minimal thermal gain. Ideal for studios and service rooms.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">South Facade</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 inline-block capitalize">
                  {solarAnalysis.facadeSunExposure.southFacade.replace(/-/g, ' ')}
                </span>
                <p className="text-[11px] text-slate-500 leading-tight pt-1">
                  Maximum winter solar heat gain. Recommended for primary living spaces with summer overhangs.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">East Facade</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-900 inline-block capitalize">
                  {solarAnalysis.facadeSunExposure.eastFacade.replace(/-/g, ' ')}
                </span>
                <p className="text-[11px] text-slate-500 leading-tight pt-1">
                  Low-angle morning sunlight. Ideal for bedrooms, breakfast dining, and kitchens.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 block">West Facade</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900 inline-block capitalize">
                  {solarAnalysis.facadeSunExposure.westFacade.replace(/-/g, ' ')}
                </span>
                <p className="text-[11px] text-slate-500 leading-tight pt-1">
                  High late-afternoon solar heat and glare risk. Requires deep louvers or shading pergolas.
                </p>
              </div>
            </div>

            {/* Recommendations List */}
            <div className="pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Passive Solar Architectural Strategies
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {solarAnalysis.passiveSolarRecommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Microclimate, Prevailing Wind & Environmental Exposures */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Prevailing Wind & Acoustic Context</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Microclimatic factors influencing natural ventilation, noise attenuation, and glazing specification.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Prevailing Wind Direction</label>
                <select
                  value={siteData.environmental.prevailingWindDirection || 'South-West'}
                  onChange={(e) =>
                    updateSite((p) => ({
                      ...p,
                      environmental: { ...p.environmental, prevailingWindDirection: e.target.value as any },
                    }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                >
                  <option value="North">North Wind</option>
                  <option value="South">South Wind</option>
                  <option value="East">East Wind</option>
                  <option value="West">West Wind</option>
                  <option value="North-East">North-East</option>
                  <option value="North-West">North-West</option>
                  <option value="South-East">South-East</option>
                  <option value="South-West">South-West</option>
                  <option value="Variable">Variable / Seasonal</option>
                </select>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Cross-ventilation potential: {solarAnalysis.crossVentilationFeasibility.toUpperCase()}
                </span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Primary Noise Source</label>
                <input
                  type="text"
                  value={siteData.environmental.primaryNoiseSource || ''}
                  onChange={(e) =>
                    updateSite((p) => ({
                      ...p,
                      environmental: { ...p.environmental, primaryNoiseSource: e.target.value },
                    }))
                  }
                  placeholder="e.g. Arterial road traffic, railway corridor"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
            </div>

            {solarAnalysis.acousticBufferRecommendations.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-amber-950 font-bold mb-0.5">Acoustic Glazing Recommendation:</strong>
                  {solarAnalysis.acousticBufferRecommendations[0]}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: CONSTRAINTS AUDIT */}
      {activeTab === 'constraints-audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Deterministic Site Constraints Audit</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Exact spatial rule checks reconciling current building footprint against legal parcel boundaries and obstacles.
              </p>
            </div>
            {onOpenEvidenceLedger && (
              <button
                onClick={() => onOpenEvidenceLedger(projectWithActiveSite)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-900 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                <FileCheck2 className="w-3.5 h-3.5 text-teal-700" />
                <span>View Full Evidence Ledger →</span>
              </button>
            )}
          </div>

          <div className="space-y-4">
            {constraints.map((chk) => (
              <div
                key={chk.id}
                className={`p-4 rounded-xl border transition-all ${
                  chk.status === 'pass'
                    ? 'bg-emerald-50/40 border-emerald-200'
                    : chk.status === 'conflict'
                    ? 'bg-rose-50/50 border-rose-200'
                    : 'bg-amber-50/40 border-amber-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-400 font-semibold">[{chk.id}]</span>
                    <h4 className="text-sm font-bold text-slate-900">{chk.title}</h4>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] self-start sm:self-auto ${
                      chk.status === 'pass'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : chk.status === 'conflict'
                        ? 'bg-rose-100 text-rose-900 border border-rose-300'
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                    }`}
                  >
                    {chk.status.toUpperCase()}
                  </span>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed mb-3">
                  {chk.details}
                </p>

                <div className="pt-2 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block font-mono">Formula / Invariant:</span>
                    <code className="text-slate-800 font-mono text-[10px] bg-white/70 px-1 py-0.5 rounded">
                      {chk.formulaOrRule}
                    </code>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-mono">Statutory Review Required:</span>
                    <span className="text-amber-900 font-medium">
                      {chk.requiresProfessionalReview}
                    </span>
                  </div>
                </div>

                {chk.recommendation && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-start gap-1.5 text-xs text-rose-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span><strong>Suggested Action:</strong> {chk.recommendation}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: PHOTO EVIDENCE & FIELD NOTES */}
      {activeTab === 'photo-evidence' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Site Photographs & Field Documentation</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Record photographic observations, street frontage angles, and boundary pegs for handoff dossiers.
              </p>
            </div>

            <button
              onClick={() => setIsAddingPhoto(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-teal-400" />
              <span>Add Field Note / Photo</span>
            </button>
          </div>

          {siteData.photos.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No site photos or field notes attached yet. Click &quot;Add Field Note / Photo&quot; to log site observations.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {siteData.photos.map((item) => (
                <div key={item.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-xs">{item.title}</h4>
                    <button
                      onClick={() => handleDeletePhoto(item.id)}
                      className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">{item.caption}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-200/60 font-mono">
                    <span>Date: {item.observationDate}</span>
                    <span>Facing: {item.facingDirection || 'Site Center'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-[11px] flex items-center gap-2">
            <Info className="w-4 h-4 text-teal-700 shrink-0" />
            <span>Site photographs and field notes serve as non-binding visual references, not certified cadastral boundary surveys.</span>
          </div>
        </div>
      )}

      {/* MODAL: ADD OBSTACLE */}
      {isAddingObstacle && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleAddObstacle}
            className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Add Site Feature / Obstacle</h3>
              <button
                type="button"
                onClick={() => setIsAddingObstacle(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Feature Name</label>
                <input
                  type="text"
                  required
                  value={newObstacleName}
                  onChange={(e) => setNewObstacleName(e.target.value)}
                  placeholder="e.g. Heritage Mature Oak"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Type</label>
                  <select
                    value={newObstacleType}
                    onChange={(e) => setNewObstacleType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="tree">Tree / Protected Canopy</option>
                    <option value="utility-pole">Utility Pole / Hydrant</option>
                    <option value="easement">Drainage / Sewer Easement</option>
                    <option value="rock-outcrop">Rock Outcrop / Bedrock</option>
                    <option value="inspection-chamber">Inspection Manhole</option>
                    <option value="other">Other Obstacle</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Preservation Policy</label>
                  <select
                    value={newObstaclePreserve}
                    onChange={(e) => setNewObstaclePreserve(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="preserve-mandatory">Preserve (Mandatory)</option>
                    <option value="preserve-preferred">Preserve (Preferred)</option>
                    <option value="removable">Permit to Remove</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">X Coord ({unitLabel})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={newObstacleX}
                    onChange={(e) => setNewObstacleX(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Y Coord ({unitLabel})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={newObstacleY}
                    onChange={(e) => setNewObstacleY(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Size / Dia ({unitLabel})</label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={newObstacleSize}
                    onChange={(e) => setNewObstacleSize(parseFloat(e.target.value) || 5)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddingObstacle(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-xs font-semibold text-white cursor-pointer"
              >
                Add Feature
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ADD PHOTO */}
      {isAddingPhoto && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleAddPhoto}
            className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Add Site Observation / Note</h3>
              <button
                type="button"
                onClick={() => setIsAddingPhoto(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={newPhotoTitle}
                  onChange={(e) => setNewPhotoTitle(e.target.value)}
                  placeholder="e.g. Southern Boundary Fence"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Direction Faced</label>
                <select
                  value={newPhotoDirection}
                  onChange={(e) => setNewPhotoDirection(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                >
                  <option value="North">Facing North</option>
                  <option value="South">Facing South</option>
                  <option value="East">Facing East</option>
                  <option value="West">Facing West</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Notes / Caption</label>
                <textarea
                  rows={3}
                  value={newPhotoCaption}
                  onChange={(e) => setNewPhotoCaption(e.target.value)}
                  placeholder="Observation details, neighbouring property line notes..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddingPhoto(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-xs font-semibold text-white cursor-pointer"
              >
                Save Observation
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

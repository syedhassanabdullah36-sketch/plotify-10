import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Project, FloorPlanRoom, MeasurementUnit } from '../../types/project';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import { FloorPlanToolbar } from './FloorPlanToolbar';
import { RoomInspector } from './RoomInspector';
import {
  AlertTriangle,
  Network,
  Save,
  ArrowRight,
  X,
  RotateCcw,
} from 'lucide-react';
import {
  checkBoundaryViolations,
  checkRoomOverlaps,
  calculateFloorMetrics,
  generateDefaultLayout,
  ROOM_TYPE_CONFIG,
  BoundaryViolation,
  snapValue,
} from './geometry';

interface FloorPlanEditorProps {
  project: Project;
  onSaveProjectFloorPlan: (rooms: FloorPlanRoom[]) => void;
  onBack: () => void;
  onOpen3D?: () => void;
  onOpenDesignStudio?: () => void;
  onOpenDecisionTwin?: () => void;
  onOpenConstraintGraph?: () => void;
  onDraftChange?: (rooms: FloorPlanRoom[], isModified: boolean) => void;
  initialSelectedRoomId?: string | null;
}

export const FloorPlanEditor: React.FC<FloorPlanEditorProps> = ({
  project,
  onSaveProjectFloorPlan,
  onBack,
  onOpen3D,
  onOpenDesignStudio,
  onOpenDecisionTwin,
  onOpenConstraintGraph,
  onDraftChange,
  initialSelectedRoomId,
}) => {
  // Initialize rooms from project floorPlan or generate from room program
  const [rooms, setRooms] = useState<FloorPlanRoom[]>(() => {
    if (project.floorPlan && Array.isArray(project.floorPlan.rooms) && project.floorPlan.rooms.length > 0) {
      return project.floorPlan.rooms;
    }
    return generateDefaultLayout(project);
  });

  const [currentFloor, setCurrentFloor] = useState<number>(1);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialSelectedRoomId || null);
  const [zoom, setZoom] = useState<number>(100);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [gridSnap, setGridSnap] = useState<number>(0.5);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [pendingNavTarget, setPendingNavTarget] = useState<'back' | '3d' | 'design' | null>(null);

  // Notify parent of draft updates for Architectural Decision Twin live sync safely
  const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  });

  const lastNotifiedDraftRef = useRef<{ rooms: FloorPlanRoom[]; isModified: boolean } | null>(null);

  useEffect(() => {
    if (
      !lastNotifiedDraftRef.current ||
      lastNotifiedDraftRef.current.rooms !== rooms ||
      lastNotifiedDraftRef.current.isModified !== hasUnsavedChanges
    ) {
      lastNotifiedDraftRef.current = { rooms, isModified: hasUnsavedChanges };
      onDraftChangeRef.current?.(rooms, hasUnsavedChanges);
    }
  }, [rooms, hasUnsavedChanges]);

  // Warn on page unload/refresh when changes are unsaved
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Safe navigation triggers
  const triggerSafeNav = (target: 'back' | '3d' | 'design') => {
    if (hasUnsavedChanges) {
      setPendingNavTarget(target);
    } else {
      if (target === 'back') onBack();
      else if (target === '3d' && onOpen3D) onOpen3D();
      else if (target === 'design' && onOpenDesignStudio) onOpenDesignStudio();
    }
  };

  const handleConfirmDiscard = () => {
    const target = pendingNavTarget;
    setPendingNavTarget(null);
    setHasUnsavedChanges(false);
    if (target === 'back') onBack();
    else if (target === '3d' && onOpen3D) onOpen3D();
    else if (target === 'design' && onOpenDesignStudio) onOpenDesignStudio();
  };

  const handleSaveAndNavigate = () => {
    onSaveProjectFloorPlan(rooms);
    setHasUnsavedChanges(false);
    const target = pendingNavTarget;
    setPendingNavTarget(null);
    if (target === 'back') onBack();
    else if (target === '3d' && onOpen3D) onOpen3D();
    else if (target === 'design' && onOpenDesignStudio) onOpenDesignStudio();
  };

  // Filter rooms for current floor
  const currentFloorRooms = useMemo(() => {
    return rooms.filter((r) => r.floorLevel === currentFloor);
  }, [rooms, currentFloor]);

  // Selected room object
  const selectedRoom = useMemo(() => {
    return rooms.find((r) => r.id === selectedRoomId) || null;
  }, [rooms, selectedRoomId]);

  // Boundary violations for current floor
  const boundaryViolations = useMemo(() => {
    const map = new Map<string, BoundaryViolation>();
    currentFloorRooms.forEach((room) => {
      const v = checkBoundaryViolations(room, project.plotWidth, project.plotLength);
      if (v) map.set(room.id, v);
    });
    return map;
  }, [currentFloorRooms, project.plotWidth, project.plotLength]);

  // Overlap collisions for current floor
  const overlapCollisions = useMemo(() => {
    return checkRoomOverlaps(currentFloorRooms);
  }, [currentFloorRooms]);

  // Set of room IDs that have overlaps
  const overlapRoomIds = useMemo(() => {
    const set = new Set<string>();
    overlapCollisions.forEach((c) => {
      set.add(c.room1Id);
      set.add(c.room2Id);
    });
    return set;
  }, [overlapCollisions]);

  // Floor area metrics
  const metrics = useMemo(() => {
    return calculateFloorMetrics(
      rooms,
      project.plotWidth,
      project.plotLength,
      project.unit,
      currentFloor
    );
  }, [rooms, project.plotWidth, project.plotLength, project.unit, currentFloor]);

  // Save handler
  const handleSave = useCallback(() => {
    onSaveProjectFloorPlan(rooms);
    setHasUnsavedChanges(false);
  }, [onSaveProjectFloorPlan, rooms]);

  // Update room handler
  const handleUpdateRoom = useCallback((updated: FloorPlanRoom) => {
    setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setHasUnsavedChanges(true);
  }, []);

  // Add room handler
  const handleAddRoom = (type: string, name?: string) => {
    const config = ROOM_TYPE_CONFIG[type] || ROOM_TYPE_CONFIG.custom;
    const unitFactor = project.unit === 'metres' ? 0.3048 : 1.0;

    const w = snapValue(Math.min(config.defaultW * unitFactor, project.plotWidth * 0.4), gridSnap);
    const l = snapValue(Math.min(config.defaultL * unitFactor, project.plotLength * 0.4), gridSnap);

    // Find non-occupied placement
    const newRoom: FloorPlanRoom = {
      id: `room-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: name || config.label,
      type,
      x: snapValue(Math.max(1, project.plotWidth * 0.1), gridSnap),
      y: snapValue(Math.max(1, project.plotLength * 0.1), gridSnap),
      width: w,
      length: l,
      color: config.defaultColor,
      floorLevel: currentFloor,
    };

    setRooms((prev) => [...prev, newRoom]);
    setSelectedRoomId(newRoom.id);
    setHasUnsavedChanges(true);
  };

  // Delete room handler
  const handleDeleteRoom = (roomId: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    if (selectedRoomId === roomId) setSelectedRoomId(null);
    setHasUnsavedChanges(true);
  };

  // Duplicate room handler
  const handleDuplicateRoom = (room: FloorPlanRoom) => {
    const unitStep = project.unit === 'metres' ? 1.0 : 2.0;
    const newX = snapValue(Math.min(project.plotWidth - room.width, room.x + unitStep), gridSnap);
    const newY = snapValue(Math.min(project.plotLength - room.length, room.y + unitStep), gridSnap);

    const dup: FloorPlanRoom = {
      ...room,
      id: `room-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: `${room.name} (Copy)`,
      x: Math.max(0, newX),
      y: Math.max(0, newY),
    };

    setRooms((prev) => [...prev, dup]);
    setSelectedRoomId(dup.id);
    setHasUnsavedChanges(true);
  };

  // Auto-generate layout handler
  const handleAutoGenerate = () => {
    const newRooms = generateDefaultLayout(project);
    setRooms(newRooms);
    setSelectedRoomId(null);
    setHasUnsavedChanges(true);
  };

  // Snap room inside plot boundary helper
  const handleSnapInsideBoundary = (room: FloorPlanRoom) => {
    const safeX = snapValue(
      Math.max(0, Math.min(room.x, project.plotWidth - room.width)),
      gridSnap
    );
    const safeY = snapValue(
      Math.max(0, Math.min(room.y, project.plotLength - room.length)),
      gridSnap
    );

    handleUpdateRoom({
      ...room,
      x: safeX,
      y: safeY,
    });
  };

  // Keyboard navigation & deletion listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing inside an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      if (!selectedRoom) return;

      const step = e.shiftKey ? (gridSnap > 0 ? gridSnap * 4 : 2) : (gridSnap > 0 ? gridSnap : 0.5);

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleUpdateRoom({ ...selectedRoom, x: snapValue(selectedRoom.x - step, gridSnap) });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleUpdateRoom({ ...selectedRoom, x: snapValue(selectedRoom.x + step, gridSnap) });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleUpdateRoom({ ...selectedRoom, y: snapValue(selectedRoom.y - step, gridSnap) });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleUpdateRoom({ ...selectedRoom, y: snapValue(selectedRoom.y + step, gridSnap) });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteRoom(selectedRoom.id);
      } else if (e.key === 'Escape') {
        setSelectedRoomId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRoom, gridSnap, handleUpdateRoom]);

  const unitSuffix = project.unit === 'feet' ? 'ft' : 'm';

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Editor Toolbar */}
      <FloorPlanToolbar
        currentFloor={currentFloor}
        totalFloors={project.floors}
        onSelectFloor={(f) => {
          setCurrentFloor(f);
          setSelectedRoomId(null);
        }}
        metrics={metrics}
        onAddRoom={handleAddRoom}
        onAutoGenerate={handleAutoGenerate}
        onSave={handleSave}
        hasUnsavedChanges={hasUnsavedChanges}
        onBack={() => triggerSafeNav('back')}
        onOpen3D={onOpen3D ? () => triggerSafeNav('3d') : undefined}
        onOpenDesignStudio={onOpenDesignStudio ? () => triggerSafeNav('design') : undefined}
        onOpenDecisionTwin={onOpenDecisionTwin}
        onOpenConstraintGraph={onOpenConstraintGraph}
        zoom={zoom}
        onZoomChange={setZoom}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(!showGrid)}
        gridSnap={gridSnap}
        onSnapChange={setGridSnap}
        boundaryWarningCount={boundaryViolations.size}
        overlapWarningCount={overlapCollisions.length}
        unitSuffix={unitSuffix}
      />

      {/* Draft Divergence Notice Banner */}
      {hasUnsavedChanges && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5 text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold">2D Draft Divergence: </span>
              <span>
                3D building viewer, FAR metrics, and interior finish schedules are currently reflecting the last saved revision.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenDecisionTwin && (
              <button
                onClick={onOpenDecisionTwin}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-semibold transition-colors cursor-pointer"
              >
                <Network className="w-3.5 h-3.5" />
                <span>Inspect Twin</span>
              </button>
            )}
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-teal-400" />
              <span>Save & Sync Model</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Work Area: Canvas on Left, Inspector on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Interactive 2D Canvas (9 cols) */}
        <div className="lg:col-span-9">
          <FloorPlanCanvas
            plotWidth={project.plotWidth}
            plotLength={project.plotLength}
            unit={project.unit}
            roadFacing={project.roadFacing}
            rooms={currentFloorRooms}
            selectedRoomId={selectedRoomId}
            onSelectRoom={setSelectedRoomId}
            onUpdateRoom={handleUpdateRoom}
            boundaryViolations={boundaryViolations}
            overlapRoomIds={overlapRoomIds}
            gridSnap={gridSnap}
            showGrid={showGrid}
            zoom={zoom}
          />
        </div>

        {/* Selected Room Inspector (3 cols) */}
        <div className="lg:col-span-3">
          <RoomInspector
            selectedRoom={selectedRoom}
            onUpdateRoom={handleUpdateRoom}
            onDeleteRoom={handleDeleteRoom}
            onDuplicateRoom={handleDuplicateRoom}
            plotWidth={project.plotWidth}
            plotLength={project.plotLength}
            unit={project.unit}
            boundaryViolation={selectedRoom ? boundaryViolations.get(selectedRoom.id) || null : null}
            overlapCollisions={overlapCollisions}
            onSnapInsideBoundary={handleSnapInsideBoundary}
          />
        </div>
      </div>

      {/* Unsaved Changes Guard Dialog */}
      {pendingNavTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Unsaved Floor Plan Changes</h3>
                <p className="text-xs text-slate-500">Decision Twin State Divergence</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              You have modified the 2D floor plan. If you navigate away without saving, your current edits will be discarded and the 3D building viewer and area schedules will remain on the previous saved revision.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setPendingNavTarget(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                onClick={handleConfirmDiscard}
                className="px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 rounded-lg border border-red-200 transition-colors cursor-pointer"
              >
                Discard & Leave
              </button>
              <button
                onClick={handleSaveAndNavigate}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5 text-teal-400" />
                <span>Save & Continue</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

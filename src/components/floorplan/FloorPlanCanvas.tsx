import React, { useRef, useState, useEffect, useCallback } from 'react';
import { FloorPlanRoom, MeasurementUnit, RoadFacingSide } from '../../types/project';
import { BoundaryViolation, OverlapCollision, snapValue } from './geometry';
import { AlertTriangle, Compass, Maximize2 } from 'lucide-react';

interface FloorPlanCanvasProps {
  plotWidth: number;
  plotLength: number;
  unit: MeasurementUnit;
  roadFacing: RoadFacingSide;
  rooms: FloorPlanRoom[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  onUpdateRoom: (updated: FloorPlanRoom) => void;
  boundaryViolations: Map<string, BoundaryViolation>;
  overlapRoomIds: Set<string>;
  gridSnap: number;
  showGrid: boolean;
  zoom: number;
}

type DragMode = 'move' | 'resize-nw' | 'resize-n' | 'resize-ne' | 'resize-e' | 'resize-se' | 'resize-s' | 'resize-sw' | 'resize-w' | null;

interface DragState {
  mode: DragMode;
  roomId: string;
  startPointerX: number;
  startPointerY: number;
  initialRoom: FloorPlanRoom;
}

export const FloorPlanCanvas: React.FC<FloorPlanCanvasProps> = ({
  plotWidth,
  plotLength,
  unit,
  roadFacing,
  rooms,
  selectedRoomId,
  onSelectRoom,
  onUpdateRoom,
  boundaryViolations,
  overlapRoomIds,
  gridSnap,
  showGrid,
  zoom,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 550,
  });

  const [dragState, setDragState] = useState<DragState | null>(null);

  // Measure container dimensions
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({
          width: Math.max(400, rect.width),
          height: Math.max(380, rect.height),
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Compute pixels-per-unit scale
  // We leave 60px padding on each side for rulers & orientation annotations
  const padding = 65;
  const availW = Math.max(100, containerSize.width - padding * 2);
  const availH = Math.max(100, containerSize.height - padding * 2);

  const baseScale = Math.min(availW / plotWidth, availH / plotLength);
  const scale = baseScale * (zoom / 100);

  const plotPixelW = plotWidth * scale;
  const plotPixelH = plotLength * scale;

  // Center the plot in canvas
  const originX = Math.max(padding, (containerSize.width - plotPixelW) / 2);
  const originY = Math.max(padding, (containerSize.height - plotPixelH) / 2);

  // Conversion helpers: Screen px to Plot units
  const screenToPlotCoord = useCallback(
    (screenX: number, screenY: number) => {
      const uX = (screenX - originX) / scale;
      const uY = (screenY - originY) / scale;
      return { uX, uY };
    },
    [originX, originY, scale]
  );

  // Handle pointer down on a room for moving
  const handleRoomPointerDown = (e: React.PointerEvent, room: FloorPlanRoom) => {
    e.stopPropagation();
    onSelectRoom(room.id);

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      mode: 'move',
      roomId: room.id,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      initialRoom: { ...room },
    });
  };

  // Handle pointer down on a resize handle
  const handleHandlePointerDown = (
    e: React.PointerEvent,
    mode: DragMode,
    room: FloorPlanRoom
  ) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      mode,
      roomId: room.id,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      initialRoom: { ...room },
    });
  };

  // Handle pointer move
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;

    const dxUnits = (e.clientX - dragState.startPointerX) / scale;
    const dyUnits = (e.clientY - dragState.startPointerY) / scale;

    const init = dragState.initialRoom;
    const minSize = 2; // minimum 2 feet or 2 metres

    let nextX = init.x;
    let nextY = init.y;
    let nextW = init.width;
    let nextL = init.length;

    if (dragState.mode === 'move') {
      nextX = snapValue(init.x + dxUnits, gridSnap);
      nextY = snapValue(init.y + dyUnits, gridSnap);
    } else if (dragState.mode === 'resize-e') {
      nextW = Math.max(minSize, snapValue(init.width + dxUnits, gridSnap));
    } else if (dragState.mode === 'resize-s') {
      nextL = Math.max(minSize, snapValue(init.length + dyUnits, gridSnap));
    } else if (dragState.mode === 'resize-se') {
      nextW = Math.max(minSize, snapValue(init.width + dxUnits, gridSnap));
      nextL = Math.max(minSize, snapValue(init.length + dyUnits, gridSnap));
    } else if (dragState.mode === 'resize-w') {
      const rawW = init.width - dxUnits;
      nextW = Math.max(minSize, snapValue(rawW, gridSnap));
      nextX = snapValue(init.x + (init.width - nextW), gridSnap);
    } else if (dragState.mode === 'resize-n') {
      const rawL = init.length - dyUnits;
      nextL = Math.max(minSize, snapValue(rawL, gridSnap));
      nextY = snapValue(init.y + (init.length - nextL), gridSnap);
    } else if (dragState.mode === 'resize-nw') {
      const rawW = init.width - dxUnits;
      const rawL = init.length - dyUnits;
      nextW = Math.max(minSize, snapValue(rawW, gridSnap));
      nextL = Math.max(minSize, snapValue(rawL, gridSnap));
      nextX = snapValue(init.x + (init.width - nextW), gridSnap);
      nextY = snapValue(init.y + (init.length - nextL), gridSnap);
    } else if (dragState.mode === 'resize-ne') {
      const rawL = init.length - dyUnits;
      nextW = Math.max(minSize, snapValue(init.width + dxUnits, gridSnap));
      nextL = Math.max(minSize, snapValue(rawL, gridSnap));
      nextY = snapValue(init.y + (init.length - nextL), gridSnap);
    } else if (dragState.mode === 'resize-sw') {
      const rawW = init.width - dxUnits;
      nextW = Math.max(minSize, snapValue(rawW, gridSnap));
      nextL = Math.max(minSize, snapValue(init.length + dyUnits, gridSnap));
      nextX = snapValue(init.x + (init.width - nextW), gridSnap);
    }

    onUpdateRoom({
      ...init,
      x: Number(nextX.toFixed(1)),
      y: Number(nextY.toFixed(1)),
      width: Number(nextW.toFixed(1)),
      length: Number(nextL.toFixed(1)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe ignore
      }
      setDragState(null);
    }
  };

  const unitSuffix = unit === 'feet' ? 'ft' : 'm';

  // Generate ruler tick marks
  const tickStep = plotWidth > 40 ? 10 : 5;
  const xTicks: number[] = [];
  for (let t = 0; t <= plotWidth; t += tickStep) xTicks.push(t);

  const yTicks: number[] = [];
  for (let t = 0; t <= plotLength; t += tickStep) yTicks.push(t);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  return (
    <div
      ref={containerRef}
      onPointerDown={() => onSelectRoom(null)}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative w-full h-[580px] bg-slate-900/5 rounded-xl border border-slate-200 overflow-hidden select-none cursor-default"
      style={{
        backgroundImage: showGrid
          ? `radial-gradient(circle, rgba(15, 23, 42, 0.12) 1px, transparent 1px)`
          : 'none',
        backgroundSize: `${Math.max(12, gridSnap * scale)}px ${Math.max(12, gridSnap * scale)}px`,
      }}
    >
      {/* Road Orientation Banner */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs text-xs">
        <Compass className="w-3.5 h-3.5 text-teal-700 shrink-0" />
        <span className="font-semibold text-slate-800">Plot Elevation:</span>
        <span className="text-slate-600">{roadFacing}</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500 tabular-nums">
          {plotWidth} × {plotLength} {unitSuffix}
        </span>
      </div>

      {/* SVG Canvas Layer */}
      <svg
        className="w-full h-full pointer-events-none"
        style={{ width: containerSize.width, height: containerSize.height }}
      >
        <g transform={`translate(${originX}, ${originY})`}>
          {/* Plot Property Boundary Outer Box */}
          <rect
            x={0}
            y={0}
            width={plotPixelW}
            height={plotPixelH}
            fill="#ffffff"
            stroke="#1e293b"
            strokeWidth="2.5"
            rx="3"
            className="pointer-events-auto"
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectRoom(null);
            }}
          />

          {/* Indicative Setback Zone (5ft / 1.5m guide inside plot) */}
          {plotWidth > 15 && plotLength > 15 && (
            <rect
              x={5 * scale}
              y={5 * scale}
              width={Math.max(0, (plotWidth - 10) * scale)}
              height={Math.max(0, (plotLength - 10) * scale)}
              fill="none"
              stroke="#0d9488"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.35"
            />
          )}

          {/* Grid lines inside plot */}
          {showGrid &&
            xTicks.map((xVal) => (
              <line
                key={`gx-${xVal}`}
                x1={xVal * scale}
                y1={0}
                x2={xVal * scale}
                y2={plotPixelH}
                stroke="#cbd5e1"
                strokeWidth="0.75"
                opacity="0.4"
              />
            ))}

          {showGrid &&
            yTicks.map((yVal) => (
              <line
                key={`gy-${yVal}`}
                x1={0}
                y1={yVal * scale}
                x2={plotPixelW}
                y2={yVal * scale}
                stroke="#cbd5e1"
                strokeWidth="0.75"
                opacity="0.4"
              />
            ))}

          {/* Top Ruler Axis */}
          <line
            x1={0}
            y1={-12}
            x2={plotPixelW}
            y2={-12}
            stroke="#0d9488"
            strokeWidth="1.5"
          />
          {xTicks.map((xVal) => (
            <g key={`xtick-${xVal}`} transform={`translate(${xVal * scale}, -12)`}>
              <line x1={0} y1={-4} x2={0} y2={4} stroke="#0d9488" strokeWidth="1.5" />
              <text
                x={0}
                y={-8}
                textAnchor="middle"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fill="#0f766e"
                fontWeight="600"
              >
                {xVal}
              </text>
            </g>
          ))}

          {/* Left Ruler Axis */}
          <line
            x1={-12}
            y1={0}
            x2={-12}
            y2={plotPixelH}
            stroke="#0d9488"
            strokeWidth="1.5"
          />
          {yTicks.map((yVal) => (
            <g key={`ytick-${yVal}`} transform={`translate(-12, ${yVal * scale})`}>
              <line x1={-4} y1={0} x2={4} y2={0} stroke="#0d9488" strokeWidth="1.5" />
              <text
                x={-8}
                y={3}
                textAnchor="end"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fill="#0f766e"
                fontWeight="600"
              >
                {yVal}
              </text>
            </g>
          ))}

          {/* Plot Center Watermark Label */}
          <text
            x={plotPixelW / 2}
            y={plotPixelH / 2}
            textAnchor="middle"
            fontSize="12"
            fill="#94a3b8"
            opacity="0.4"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontWeight="600"
          >
            PLOT ENVELOPE: {plotWidth} × {plotLength} {unitSuffix}
          </text>
        </g>
      </svg>

      {/* HTML Room Elements Layer for crisp interaction and resize handles */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          width: containerSize.width,
          height: containerSize.height,
        }}
      >
        <div
          className="absolute"
          style={{
            transform: `translate(${originX}px, ${originY}px)`,
          }}
        >
          {rooms.map((room) => {
            const isSelected = room.id === selectedRoomId;
            const hasBoundaryViolation = boundaryViolations.has(room.id);
            const hasOverlap = overlapRoomIds.has(room.id);

            const pxLeft = room.x * scale;
            const pxTop = room.y * scale;
            const pxWidth = room.width * scale;
            const pxHeight = room.length * scale;
            const area = (room.width * room.length).toFixed(1);

            let borderStyle = 'border border-slate-300';
            if (isSelected) {
              borderStyle = 'ring-2 ring-teal-600 border-teal-700 shadow-md z-30';
            }
            if (hasOverlap) {
              borderStyle = 'ring-2 ring-amber-500 border-amber-600 z-20';
            }
            if (hasBoundaryViolation) {
              borderStyle = 'ring-2 ring-red-500 border-red-600 z-20';
            }

            return (
              <div
                key={room.id}
                onPointerDown={(e) => handleRoomPointerDown(e, room)}
                className={`absolute pointer-events-auto rounded transition-shadow flex flex-col justify-between p-2 select-none group cursor-move ${borderStyle}`}
                style={{
                  left: `${pxLeft}px`,
                  top: `${pxTop}px`,
                  width: `${pxWidth}px`,
                  height: `${pxHeight}px`,
                  backgroundColor: room.color || '#f1f5f9',
                }}
              >
                {/* Room Name and Type */}
                <div className="flex items-start justify-between gap-1 overflow-hidden pointer-events-none">
                  <span className="font-bold text-xs text-slate-900 truncate leading-tight">
                    {room.name}
                  </span>

                  {(hasBoundaryViolation || hasOverlap) && (
                    <span
                      title={
                        hasBoundaryViolation
                          ? 'Room exceeds plot boundaries!'
                          : 'Room overlaps another space!'
                      }
                      className="p-0.5 rounded bg-white shadow-2xs shrink-0"
                    >
                      <AlertTriangle
                        className={`w-3.5 h-3.5 ${
                          hasBoundaryViolation ? 'text-red-600' : 'text-amber-600'
                        }`}
                      />
                    </span>
                  )}
                </div>

                {/* Dimensions and Area Badge */}
                <div className="flex items-center justify-between text-[11px] text-slate-600 tabular-nums pointer-events-none pt-1">
                  <span className="font-medium truncate">
                    {room.width}×{room.length} {unitSuffix}
                  </span>
                  <span className="text-[10px] text-teal-800 font-semibold px-1 py-0.2 bg-white/80 rounded border border-slate-200/60 shadow-2xs shrink-0">
                    {area} {unit === 'feet' ? 'sq ft' : 'm²'}
                  </span>
                </div>

                {/* Resize Handles (Active only when room is selected) */}
                {isSelected && (
                  <>
                    {/* Corner Handles */}
                    <div
                      onPointerDown={(e) => handleHandlePointerDown(e, 'resize-nw', room)}
                      className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-teal-700 rounded-xs cursor-nw-resize pointer-events-auto z-40 hover:bg-teal-50 shadow-xs"
                    />
                    <div
                      onPointerDown={(e) => handleHandlePointerDown(e, 'resize-ne', room)}
                      className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-teal-700 rounded-xs cursor-ne-resize pointer-events-auto z-40 hover:bg-teal-50 shadow-xs"
                    />
                    <div
                      onPointerDown={(e) => handleHandlePointerDown(e, 'resize-se', room)}
                      className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-teal-700 rounded-xs cursor-se-resize pointer-events-auto z-40 hover:bg-teal-50 shadow-xs"
                    />
                    <div
                      onPointerDown={(e) => handleHandlePointerDown(e, 'resize-sw', room)}
                      className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-teal-700 rounded-xs cursor-sw-resize pointer-events-auto z-40 hover:bg-teal-50 shadow-xs"
                    />

                    {/* Edge Handles */}
                    <div
                      onPointerDown={(e) => handleHandlePointerDown(e, 'resize-n', room)}
                      className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-2 bg-white border border-teal-700 rounded-xs cursor-n-resize pointer-events-auto z-40 hover:bg-teal-50"
                    />
                    <div
                      onPointerDown={(e) => handleHandlePointerDown(e, 'resize-s', room)}
                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-2 bg-white border border-teal-700 rounded-xs cursor-s-resize pointer-events-auto z-40 hover:bg-teal-50"
                    />
                    <div
                      onPointerDown={(e) => handleHandlePointerDown(e, 'resize-w', room)}
                      className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-2 h-4 bg-white border border-teal-700 rounded-xs cursor-w-resize pointer-events-auto z-40 hover:bg-teal-50"
                    />
                    <div
                      onPointerDown={(e) => handleHandlePointerDown(e, 'resize-e', room)}
                      className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-2 h-4 bg-white border border-teal-700 rounded-xs cursor-e-resize pointer-events-auto z-40 hover:bg-teal-50"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

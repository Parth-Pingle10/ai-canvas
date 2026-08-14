import { useCallback, useEffect, useRef, useState } from "react";
import type { BoundingBox, Point, Stroke, StrokeTool } from "../../types/document";
import { useCanvasStore } from "../../state/canvasStore";
import { CanvasRenderer } from "../../canvas/CanvasRenderer";
import {
  boundsOfPoints,
  clamp,
  screenToWorld,
  unionBounds,
  zoomCameraAtPoint,
} from "../../canvas/CoordinateSystem";
import { panCamera } from "../../canvas/Camera";
import { detectPanTrigger, FrameScheduler, getCoalescedEvents, pointerEventToWorldPoint } from "../../canvas/InputManager";
import { MAX_ZOOM, MIN_ZOOM } from "../../types/tools";
import { distanceToStroke, scalePoints, strokeIntersectsBox, translatePoints } from "../../utils/geometry";
import { generateId } from "../../utils/id";

type Handle = "nw" | "ne" | "sw" | "se";

type GestureMode =
  | { kind: "idle" }
  | { kind: "draw"; stroke: Stroke }
  | { kind: "erase"; erasedIds: Set<string> }
  | { kind: "pan"; lastX: number; lastY: number }
  | {
      kind: "select-drag";
      startWorld: Point;
      originals: Map<string, Stroke>;
      live: Map<string, Stroke>;
      moved: boolean;
    }
  | { kind: "marquee"; startWorld: Point; current: BoundingBox }
  | {
      kind: "resize";
      handle: Handle;
      anchor: Point;
      originals: Map<string, Stroke>;
      live: Map<string, Stroke>;
      originalBounds: BoundingBox;
    };

const PICK_RADIUS_SCREEN_PX = 10;

export function CanvasView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const schedulerRef = useRef<FrameScheduler | null>(null);
  const gestureRef = useRef<GestureMode>({ kind: "idle" });
  const viewportRef = useRef({ width: 0, height: 0 });
  const spaceHeldRef = useRef(false);
  const [, forceRerender] = useState(0);
  const [visibleStats, setVisibleStats] = useState({ visible: 0, total: 0 });

  const strokes = useCanvasStore((s) => s.strokes);
  const camera = useCanvasStore((s) => s.camera);
  const tool = useCanvasStore((s) => s.tool);
  const toolSettings = useCanvasStore((s) => s.toolSettings);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const setCamera = useCanvasStore((s) => s.setCamera);
  const setSelection = useCanvasStore((s) => s.setSelection);
  const addStroke = useCanvasStore((s) => s.addStroke);
  const commitStrokes = useCanvasStore((s) => s.commitStrokes);
  const setViewportSize = useCanvasStore((s) => s.setViewportSize);

  // Refs mirroring frequently-read store state, so pointer handlers (which
  // are not React-reactive) always see the latest values without needing to
  // be re-subscribed on every store change.
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const toolSettingsRef = useRef(toolSettings);
  toolSettingsRef.current = toolSettings;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const scheduleRender = useCallback(() => {
    schedulerRef.current?.request();
  }, []);

  const draw = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const gesture = gestureRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let displayStrokes = strokesRef.current;
    let liveStroke: Stroke | null = null;
    let marquee: BoundingBox | null = null;

    if (gesture.kind === "draw") {
      liveStroke = gesture.stroke;
    } else if (gesture.kind === "erase" && gesture.erasedIds.size > 0) {
      displayStrokes = displayStrokes.filter((s) => !gesture.erasedIds.has(s.id));
    } else if (gesture.kind === "select-drag" || gesture.kind === "resize") {
      const overrides = gesture.live;
      displayStrokes = displayStrokes.map((s) => overrides.get(s.id) ?? s);
    } else if (gesture.kind === "marquee") {
      marquee = gesture.current;
    }

    const { visibleCount, totalCount } = renderer.render({
      strokes: displayStrokes,
      camera: cameraRef.current,
      viewportWidth: viewportRef.current.width,
      viewportHeight: viewportRef.current.height,
      devicePixelRatio: dpr,
      liveStroke,
      selectedIds: new Set(selectedIdsRef.current),
      marquee,
      showGrid: true,
    });
    setVisibleStats((prev) =>
      prev.visible === visibleCount && prev.total === totalCount
        ? prev
        : { visible: visibleCount, total: totalCount }
    );
  }, []);

  // Mount: create renderer + scheduler, observe resize.
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const renderer = new CanvasRenderer(canvasRef.current);
    rendererRef.current = renderer;
    schedulerRef.current = new FrameScheduler(draw);

    const resize = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      viewportRef.current = { width: rect.width, height: rect.height };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(rect.width, rect.height, dpr);
      setViewportSize({ width: rect.width, height: rect.height });
      scheduleRender();
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render whenever committed state changes.
  useEffect(() => {
    scheduleRender();
  }, [strokes, camera, selectedIds, scheduleRender]);

  const worldFromEvent = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const w = screenToWorld(
      { x: clientX - rect.left, y: clientY - rect.top },
      cameraRef.current,
      viewportRef.current.width,
      viewportRef.current.height
    );
    return { x: w.x, y: w.y };
  }, []);

  const pickRadiusWorld = useCallback(() => PICK_RADIUS_SCREEN_PX / cameraRef.current.zoom, []);

  const hitTestAt = useCallback((world: Point): Stroke | null => {
    const radius = pickRadiusWorld();
    const list = strokesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (distanceToStroke(world.x, world.y, s) <= Math.max(radius, s.width / 2 + radius * 0.4)) {
        return s;
      }
    }
    return null;
  }, [pickRadiusWorld]);

  const handleAt = useCallback((world: Point): Handle | null => {
    if (selectedIdsRef.current.length === 0) return null;
    const selected = strokesRef.current.filter((s) => selectedIdsRef.current.includes(s.id));
    if (selected.length === 0) return null;
    let bounds = selected[0].bounds;
    for (let i = 1; i < selected.length; i++) bounds = unionBounds(bounds, selected[i].bounds);
    const r = 10 / cameraRef.current.zoom;
    const corners: [Handle, number, number][] = [
      ["nw", bounds.minX, bounds.minY],
      ["ne", bounds.maxX, bounds.minY],
      ["sw", bounds.minX, bounds.maxY],
      ["se", bounds.maxX, bounds.maxY],
    ];
    for (const [h, x, y] of corners) {
      if (Math.hypot(world.x - x, world.y - y) <= r) return h;
    }
    return null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      const world = worldFromEvent(e.clientX, e.clientY);
      const currentTool = toolRef.current;

      const panTrigger = detectPanTrigger(e, spaceHeldRef.current, currentTool);
      if (panTrigger) {
        gestureRef.current = { kind: "pan", lastX: e.clientX, lastY: e.clientY };
        return;
      }

      if (e.button !== 0) return;

      if (currentTool === "select") {
        const handle = handleAt(world);
        if (handle) {
          const selected = strokesRef.current.filter((s) => selectedIdsRef.current.includes(s.id));
          let bounds = selected[0].bounds;
          for (let i = 1; i < selected.length; i++) bounds = unionBounds(bounds, selected[i].bounds);
          const anchor =
            handle === "nw"
              ? { x: bounds.maxX, y: bounds.maxY }
              : handle === "ne"
              ? { x: bounds.minX, y: bounds.maxY }
              : handle === "sw"
              ? { x: bounds.maxX, y: bounds.minY }
              : { x: bounds.minX, y: bounds.minY };
          const originals = new Map(selected.map((s) => [s.id, s] as const));
          gestureRef.current = {
            kind: "resize",
            handle,
            anchor,
            originals,
            live: new Map(originals),
            originalBounds: bounds,
          };
          return;
        }

        const hit = hitTestAt(world);
        if (hit) {
          const additive = e.shiftKey || e.metaKey || e.ctrlKey;
          let nextSelection: string[];
          if (additive) {
            nextSelection = selectedIdsRef.current.includes(hit.id)
              ? selectedIdsRef.current.filter((id) => id !== hit.id)
              : [...selectedIdsRef.current, hit.id];
          } else {
            nextSelection = selectedIdsRef.current.includes(hit.id) ? selectedIdsRef.current : [hit.id];
          }
          setSelection(nextSelection);
          const originals = new Map(
            strokesRef.current.filter((s) => nextSelection.includes(s.id)).map((s) => [s.id, s] as const)
          );
          gestureRef.current = {
            kind: "select-drag",
            startWorld: world,
            originals,
            live: new Map(originals),
            moved: false,
          };
        } else {
          if (!(e.shiftKey || e.metaKey || e.ctrlKey)) setSelection([]);
          gestureRef.current = {
            kind: "marquee",
            startWorld: world,
            current: { minX: world.x, minY: world.y, maxX: world.x, maxY: world.y },
          };
        }
        scheduleRender();
        return;
      }

      if (currentTool === "eraser") {
        const erasedIds = new Set<string>();
        const radius = pickRadiusWorld();
        for (const s of strokesRef.current) {
          if (distanceToStroke(world.x, world.y, s) <= Math.max(radius, s.width / 2)) {
            erasedIds.add(s.id);
          }
        }
        gestureRef.current = { kind: "erase", erasedIds };
        scheduleRender();
        return;
      }

      // Drawing tools: pen, pencil, highlighter.
      const settings = toolSettingsRef.current[currentTool];
      const point: Point = { ...world, pressure: e.pressure || 1, tiltX: e.tiltX ?? 0, tiltY: e.tiltY ?? 0, timestamp: Date.now() };
      const stroke: Stroke = {
        id: generateId("stroke"),
        type: "stroke",
        points: [point],
        color: settings.color,
        width: settings.width,
        tool: currentTool as StrokeTool,
        opacity: settings.opacity,
        bounds: boundsOfPoints([point]),
        createdAt: Date.now(),
        version: 1,
      };
      gestureRef.current = { kind: "draw", stroke };
      scheduleRender();
    },
    [worldFromEvent, handleAt, hitTestAt, pickRadiusWorld, setSelection, scheduleRender]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current;
      if (gesture.kind === "idle") return;

      if (gesture.kind === "pan") {
        const dx = e.clientX - gesture.lastX;
        const dy = e.clientY - gesture.lastY;
        gestureRef.current = { ...gesture, lastX: e.clientX, lastY: e.clientY };
        setCamera(panCamera(cameraRef.current, dx, dy));
        return;
      }

      if (gesture.kind === "draw") {
        const events = getCoalescedEvents(e);
        const rect = canvasRef.current!.getBoundingClientRect();
        const newPoints: Point[] = events.map((ev) =>
          pointerEventToWorldPoint(ev, rect, cameraRef.current, viewportRef.current.width, viewportRef.current.height)
        );
        const points = [...gesture.stroke.points, ...newPoints];
        const stroke: Stroke = {
          ...gesture.stroke,
          points,
          bounds: boundsOfPoints(points),
          version: gesture.stroke.version + 1,
        };
        gestureRef.current = { kind: "draw", stroke };
        scheduleRender();
        return;
      }

      if (gesture.kind === "erase") {
        const world = worldFromEvent(e.clientX, e.clientY);
        const radius = pickRadiusWorld();
        let changed = false;
        for (const s of strokesRef.current) {
          if (gesture.erasedIds.has(s.id)) continue;
          if (distanceToStroke(world.x, world.y, s) <= Math.max(radius, s.width / 2)) {
            gesture.erasedIds.add(s.id);
            changed = true;
          }
        }
        if (changed) scheduleRender();
        return;
      }

      if (gesture.kind === "select-drag") {
        const world = worldFromEvent(e.clientX, e.clientY);
        const dx = world.x - gesture.startWorld.x;
        const dy = world.y - gesture.startWorld.y;
        const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || gesture.moved;
        // Always recompute from the pristine originals + total delta, so
        // successive move events compose correctly instead of drifting.
        gesture.originals.forEach((orig, id) => {
          const points = translatePoints(orig.points, dx, dy);
          gesture.live.set(id, { ...orig, points, bounds: boundsOfPoints(points), version: orig.version + 1 });
        });
        gestureRef.current = { ...gesture, moved };
        scheduleRender();
        return;
      }

      if (gesture.kind === "resize") {
        const world = worldFromEvent(e.clientX, e.clientY);
        const { anchor, originalBounds } = gesture;
        const newW = Math.max(1, Math.abs(world.x - anchor.x));
        const newH = Math.max(1, Math.abs(world.y - anchor.y));
        const origW = Math.max(1, originalBounds.maxX - originalBounds.minX);
        const origH = Math.max(1, originalBounds.maxY - originalBounds.minY);
        const scaleX = newW / origW;
        const scaleY = newH / origH;
        // Recompute from the pristine originals + total scale each move.
        gesture.originals.forEach((orig, id) => {
          const points = scalePoints(orig.points, anchor, scaleX, scaleY);
          const width = clamp(orig.width * ((scaleX + scaleY) / 2), 0.5, 400);
          gesture.live.set(id, {
            ...orig,
            points,
            width,
            bounds: boundsOfPoints(points),
            version: orig.version + 1,
          });
        });
        scheduleRender();
        return;
      }

      if (gesture.kind === "marquee") {
        const world = worldFromEvent(e.clientX, e.clientY);
        const current: BoundingBox = {
          minX: Math.min(gesture.startWorld.x, world.x),
          minY: Math.min(gesture.startWorld.y, world.y),
          maxX: Math.max(gesture.startWorld.x, world.x),
          maxY: Math.max(gesture.startWorld.y, world.y),
        };
        gestureRef.current = { ...gesture, current };
        scheduleRender();
        return;
      }
    },
    [worldFromEvent, pickRadiusWorld, setCamera, scheduleRender]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current;
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture may already be released — safe to ignore.
      }

      if (gesture.kind === "draw") {
        if (gesture.stroke.points.length > 0) {
          addStroke(gesture.stroke);
        }
      } else if (gesture.kind === "erase") {
        if (gesture.erasedIds.size > 0) {
          commitStrokes(strokesRef.current.filter((s) => !gesture.erasedIds.has(s.id)));
        }
      } else if (gesture.kind === "select-drag") {
        if (gesture.moved) {
          const overrides = gesture.live;
          commitStrokes(strokesRef.current.map((s) => overrides.get(s.id) ?? s));
        }
      } else if (gesture.kind === "resize") {
        const overrides = gesture.live;
        commitStrokes(strokesRef.current.map((s) => overrides.get(s.id) ?? s));
      } else if (gesture.kind === "marquee") {
        const box = gesture.current;
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        const hits = strokesRef.current.filter((s) => strokeIntersectsBox(s, box)).map((s) => s.id);
        if (hits.length > 0) {
          setSelection(additive ? Array.from(new Set([...selectedIdsRef.current, ...hits])) : hits);
        }
      }

      gestureRef.current = { kind: "idle" };
      scheduleRender();
    },
    [addStroke, commitStrokes, setSelection, scheduleRender]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = canvasRef.current!.getBoundingClientRect();
      const pivot = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      if (e.ctrlKey || e.metaKey) {
        // Pinch-zoom on trackpads is delivered as wheel+ctrlKey.
        const factor = Math.exp(-e.deltaY * 0.01);
        setCamera(
          zoomCameraAtPoint(
            cameraRef.current,
            factor,
            pivot,
            viewportRef.current.width,
            viewportRef.current.height,
            MIN_ZOOM,
            MAX_ZOOM
          )
        );
        return;
      }

      if (e.shiftKey) {
        setCamera(panCamera(cameraRef.current, e.deltaY, 0));
        return;
      }

      // Plain wheel: two-finger trackpad pan (deltaX/deltaY), or mouse wheel zoom.
      if (Math.abs(e.deltaX) > 0 || e.deltaMode !== 0) {
        setCamera(panCamera(cameraRef.current, e.deltaX, e.deltaY));
      } else {
        const factor = Math.exp(-e.deltaY * 0.001);
        setCamera(
          zoomCameraAtPoint(
            cameraRef.current,
            factor,
            pivot,
            viewportRef.current.width,
            viewportRef.current.height,
            MIN_ZOOM,
            MAX_ZOOM
          )
        );
      }
    },
    [setCamera]
  );

  // Space-to-pan tracking.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTypingTarget(e.target)) {
        spaceHeldRef.current = true;
        forceRerender((n) => n + 1);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        forceRerender((n) => n + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const cursor = cursorForTool(tool, spaceHeldRef.current);

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas
        ref={canvasRef}
        className="canvas-surface"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="canvas-stats" aria-hidden="true">
        {visibleStats.visible}/{visibleStats.total} strokes visible · zoom{" "}
        {(camera.zoom * 100).toFixed(0)}%
      </div>
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function cursorForTool(tool: string, spaceHeld: boolean): string {
  if (spaceHeld || tool === "hand") return "grab";
  if (tool === "select") return "default";
  if (tool === "eraser") return "cell";
  return "crosshair";
}

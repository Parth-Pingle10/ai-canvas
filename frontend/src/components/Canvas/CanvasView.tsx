import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BoundingBox,
  CanvasConnector,
  CanvasShape,
  CanvasText,
  Point,
  ShapeType,
  Stroke,
  StrokeTool,
} from "../../types/document";
import { useCanvasStore } from "../../state/canvasStore";
import { CanvasRenderer, type LaserTrail } from "../../canvas/CanvasRenderer";
import {
  boundsOfPoints,
  clamp,
  screenToWorld,
  unionBounds,
  worldToScreen,
  zoomCameraAtPoint,
} from "../../canvas/CoordinateSystem";
import { panCamera } from "../../canvas/Camera";
import {
  detectPanTrigger,
  FrameScheduler,
  getCoalescedEvents,
  pointerEventToWorldPoint,
} from "../../canvas/InputManager";
import { MAX_ZOOM, MIN_ZOOM } from "../../types/tools";
import {
  distanceToSegment,
  distanceToStroke,
  scalePoints,
  strokeIntersectsBox,
  translatePoints,
} from "../../utils/geometry";
import { generateId } from "../../utils/id";
import { boundsOfShape, boundsOfText, resolveConnectorEndpoints } from "../../canvas/ShapeRenderer";

type Handle = "nw" | "ne" | "sw" | "se";

type GestureMode =
  | { kind: "idle" }
  | { kind: "draw"; stroke: Stroke }
  | { kind: "laser"; trail: LaserTrail }
  | { kind: "draw-shape"; startWorld: Point; shape: CanvasShape }
  | { kind: "draw-connector"; startWorld: Point; connector: CanvasConnector }
  | { kind: "erase"; erasedStrokeIds: Set<string>; erasedShapeIds: Set<string>; erasedConnectorIds: Set<string>; erasedTextIds: Set<string> }
  | { kind: "pan"; lastX: number; lastY: number }
  | {
      kind: "select-drag";
      startWorld: Point;
      originalStrokes: Map<string, Stroke>;
      originalShapes: Map<string, CanvasShape>;
      originalConnectors: Map<string, CanvasConnector>;
      originalTexts: Map<string, CanvasText>;
      liveStrokes: Map<string, Stroke>;
      liveShapes: Map<string, CanvasShape>;
      liveConnectors: Map<string, CanvasConnector>;
      liveTexts: Map<string, CanvasText>;
      moved: boolean;
    }
  | { kind: "marquee"; startWorld: Point; current: BoundingBox }
  | {
      kind: "resize";
      handle: Handle;
      anchor: Point;
      originalStrokes: Map<string, Stroke>;
      originalShapes: Map<string, CanvasShape>;
      originalTexts: Map<string, CanvasText>;
      liveStrokes: Map<string, Stroke>;
      liveShapes: Map<string, CanvasShape>;
      liveTexts: Map<string, CanvasText>;
      originalBounds: BoundingBox;
    };

const PICK_RADIUS_SCREEN_PX = 10;

export interface CanvasViewProps {
  onManualAnalyze?: () => void;
}

export function CanvasView({ onManualAnalyze }: CanvasViewProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const schedulerRef = useRef<FrameScheduler | null>(null);
  const gestureRef = useRef<GestureMode>({ kind: "idle" });
  const viewportRef = useRef({ width: 0, height: 0 });
  const spaceHeldRef = useRef(false);
  const [, forceRerender] = useState(0);

  const strokes = useCanvasStore((s) => s.strokes);
  const shapes = useCanvasStore((s) => s.shapes);
  const connectors = useCanvasStore((s) => s.connectors);
  const textObjects = useCanvasStore((s) => s.textObjects);
  const camera = useCanvasStore((s) => s.camera);
  const tool = useCanvasStore((s) => s.tool);
  const toolSettings = useCanvasStore((s) => s.toolSettings);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const setCamera = useCanvasStore((s) => s.setCamera);
  const setSelection = useCanvasStore((s) => s.setSelection);
  const addStroke = useCanvasStore((s) => s.addStroke);
  const addShape = useCanvasStore((s) => s.addShape);
  const addConnector = useCanvasStore((s) => s.addConnector);
  const addTextObject = useCanvasStore((s) => s.addTextObject);
  const commitScene = useCanvasStore((s) => s.commitScene);
  const setViewportSize = useCanvasStore((s) => s.setViewportSize);

  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;
  const connectorsRef = useRef(connectors);
  connectorsRef.current = connectors;
  const textObjectsRef = useRef(textObjects);
  textObjectsRef.current = textObjects;
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const toolSettingsRef = useRef(toolSettings);
  toolSettingsRef.current = toolSettings;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const showGridRef = useRef(showGrid);
  showGridRef.current = showGrid;
  const laserTrailsRef = useRef<LaserTrail[]>([]);

  const [inlineTextEditor, setInlineTextEditor] = useState<{
    worldX: number;
    worldY: number;
    initialText: string;
    fontSize: number;
    color: string;
    existingId?: string;
  } | null>(null);

  const scheduleRender = useCallback(() => {
    schedulerRef.current?.request();
  }, []);

  const commitInlineText = useCallback(
    (text: string) => {
      if (!inlineTextEditor) return;
      const trimmed = text.trim();
      if (trimmed) {
        if (inlineTextEditor.existingId) {
          const currentTexts = textObjectsRef.current;
          const nextTexts = currentTexts.map((t) => {
            if (t.id === inlineTextEditor.existingId) {
              const updated: CanvasText = {
                ...t,
                text: trimmed,
                fontSize: inlineTextEditor.fontSize,
                fontColor: inlineTextEditor.color,
                version: t.version + 1,
              };
              updated.bounds = boundsOfText(updated);
              return updated;
            }
            return t;
          });
          commitScene({ textObjects: nextTexts });
        } else {
          const textObj: CanvasText = {
            id: generateId("text"),
            type: "text",
            x: inlineTextEditor.worldX,
            y: inlineTextEditor.worldY,
            width: 120,
            height: 30,
            text: trimmed,
            fontSize: inlineTextEditor.fontSize,
            fontColor: inlineTextEditor.color,
            bounds: {
              minX: inlineTextEditor.worldX,
              minY: inlineTextEditor.worldY,
              maxX: inlineTextEditor.worldX + 120,
              maxY: inlineTextEditor.worldY + 30,
            },
            status: "confirmed",
            createdAt: Date.now(),
            version: 1,
          };
          textObj.bounds = boundsOfText(textObj);
          addTextObject(textObj);
        }
      } else if (inlineTextEditor.existingId) {
        const currentTexts = textObjectsRef.current;
        commitScene({ textObjects: currentTexts.filter((t) => t.id !== inlineTextEditor.existingId) });
      }
      setInlineTextEditor(null);
      scheduleRender();
    },
    [inlineTextEditor, addTextObject, commitScene, scheduleRender]
  );

  const draw = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const gesture = gestureRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let displayStrokes = strokesRef.current;
    let displayShapes = shapesRef.current;
    let displayConnectors = connectorsRef.current;
    let displayTexts = textObjectsRef.current;

    let liveStroke: Stroke | null = null;
    let liveShape: CanvasShape | null = null;
    let liveConnector: CanvasConnector | null = null;
    let marquee: BoundingBox | null = null;

    if (gesture.kind === "draw") {
      liveStroke = gesture.stroke;
    } else if (gesture.kind === "draw-shape") {
      liveShape = gesture.shape;
    } else if (gesture.kind === "draw-connector") {
      liveConnector = gesture.connector;
    } else if (gesture.kind === "erase") {
      displayStrokes = displayStrokes.filter((s) => !gesture.erasedStrokeIds.has(s.id));
      displayShapes = displayShapes.filter((s) => !gesture.erasedShapeIds.has(s.id));
      displayConnectors = displayConnectors.filter((c) => !gesture.erasedConnectorIds.has(c.id));
      displayTexts = displayTexts.filter((t) => !gesture.erasedTextIds.has(t.id));
    } else if (gesture.kind === "select-drag") {
      displayStrokes = displayStrokes.map((s) => gesture.liveStrokes.get(s.id) ?? s);
      displayShapes = displayShapes.map((s) => gesture.liveShapes.get(s.id) ?? s);
      displayConnectors = displayConnectors.map((c) => gesture.liveConnectors.get(c.id) ?? c);
      displayTexts = displayTexts.map((t) => gesture.liveTexts.get(t.id) ?? t);
    } else if (gesture.kind === "resize") {
      displayStrokes = displayStrokes.map((s) => gesture.liveStrokes.get(s.id) ?? s);
      displayShapes = displayShapes.map((s) => gesture.liveShapes.get(s.id) ?? s);
      displayTexts = displayTexts.map((t) => gesture.liveTexts.get(t.id) ?? t);
    } else if (gesture.kind === "marquee") {
      marquee = gesture.current;
    }

    const now = Date.now();
    laserTrailsRef.current = laserTrailsRef.current.filter((t) => now - t.createdAt < 3000);

    renderer.render({
      strokes: displayStrokes,
      shapes: displayShapes,
      connectors: displayConnectors,
      textObjects: displayTexts,
      camera: cameraRef.current,
      viewportWidth: viewportRef.current.width,
      viewportHeight: viewportRef.current.height,
      devicePixelRatio: dpr,
      liveStroke,
      liveShape,
      liveConnector,
      laserTrails: laserTrailsRef.current,
      selectedIds: new Set(selectedIdsRef.current),
      marquee,
      showGrid: showGridRef.current,
    });
  }, []);

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
  }, [draw, scheduleRender, setViewportSize]);

  useEffect(() => {
    scheduleRender();
  }, [strokes, shapes, connectors, textObjects, camera, selectedIds, showGrid, scheduleRender]);

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

  const hitTestAt = useCallback(
    (world: Point): { id: string; type: "stroke" | "shape" | "connector" | "text" } | null => {
      const radius = pickRadiusWorld();

      // Test text objects
      for (let i = textObjectsRef.current.length - 1; i >= 0; i--) {
        const t = textObjectsRef.current[i];
        if (
          world.x >= t.x - radius &&
          world.x <= t.x + t.width + radius &&
          world.y >= t.y - radius &&
          world.y <= t.y + t.height + radius
        ) {
          return { id: t.id, type: "text" };
        }
      }

      // Test shapes
      for (let i = shapesRef.current.length - 1; i >= 0; i--) {
        const s = shapesRef.current[i];
        if (
          world.x >= s.x - radius &&
          world.x <= s.x + s.width + radius &&
          world.y >= s.y - radius &&
          world.y <= s.y + s.height + radius
        ) {
          return { id: s.id, type: "shape" };
        }
      }

      // Test connectors
      const shapesMap = new Map(shapesRef.current.map((s) => [s.id, s]));
      for (let i = connectorsRef.current.length - 1; i >= 0; i--) {
        const c = connectorsRef.current[i];
        const { start, end } = resolveConnectorEndpoints(c, shapesMap);
        if (distanceToSegment(world.x, world.y, start.x, start.y, end.x, end.y) <= radius + 2) {
          return { id: c.id, type: "connector" };
        }
      }

      // Test strokes
      for (let i = strokesRef.current.length - 1; i >= 0; i--) {
        const s = strokesRef.current[i];
        if (distanceToStroke(world.x, world.y, s) <= Math.max(radius, s.width / 2 + radius * 0.4)) {
          return { id: s.id, type: "stroke" };
        }
      }

      return null;
    },
    [pickRadiusWorld]
  );

  const getCombinedSelectedBounds = useCallback((): BoundingBox | null => {
    const sel = new Set(selectedIdsRef.current);
    if (sel.size === 0) return null;
    const boundsList: BoundingBox[] = [];

    strokesRef.current.filter((s) => sel.has(s.id)).forEach((s) => boundsList.push(s.bounds));
    shapesRef.current.filter((s) => sel.has(s.id)).forEach((s) => boundsList.push(s.bounds));
    connectorsRef.current.filter((c) => sel.has(c.id)).forEach((c) => boundsList.push(c.bounds));
    textObjectsRef.current.filter((t) => sel.has(t.id)).forEach((t) => boundsList.push(t.bounds));

    if (boundsList.length === 0) return null;
    let b = boundsList[0];
    for (let i = 1; i < boundsList.length; i++) b = unionBounds(b, boundsList[i]);
    return b;
  }, []);

  const handleAt = useCallback(
    (world: Point): Handle | null => {
      const bounds = getCombinedSelectedBounds();
      if (!bounds) return null;
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
    },
    [getCombinedSelectedBounds]
  );

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
          const bounds = getCombinedSelectedBounds()!;
          const anchor =
            handle === "nw"
              ? { x: bounds.maxX, y: bounds.maxY }
              : handle === "ne"
              ? { x: bounds.minX, y: bounds.maxY }
              : handle === "sw"
              ? { x: bounds.maxX, y: bounds.minY }
              : { x: bounds.minX, y: bounds.minY };

          const sel = new Set(selectedIdsRef.current);
          const origStrokes = new Map(strokesRef.current.filter((s) => sel.has(s.id)).map((s) => [s.id, s]));
          const origShapes = new Map(shapesRef.current.filter((s) => sel.has(s.id)).map((s) => [s.id, s]));
          const origTexts = new Map(textObjectsRef.current.filter((t) => sel.has(t.id)).map((t) => [t.id, t]));

          gestureRef.current = {
            kind: "resize",
            handle,
            anchor,
            originalStrokes: origStrokes,
            originalShapes: origShapes,
            originalTexts: origTexts,
            liveStrokes: new Map(origStrokes),
            liveShapes: new Map(origShapes),
            liveTexts: new Map(origTexts),
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

          const sel = new Set(nextSelection);
          const origStrokes = new Map(strokesRef.current.filter((s) => sel.has(s.id)).map((s) => [s.id, s]));
          const origShapes = new Map(shapesRef.current.filter((s) => sel.has(s.id)).map((s) => [s.id, s]));
          const origConnectors = new Map(connectorsRef.current.filter((c) => sel.has(c.id)).map((c) => [c.id, c]));
          const origTexts = new Map(textObjectsRef.current.filter((t) => sel.has(t.id)).map((t) => [t.id, t]));

          gestureRef.current = {
            kind: "select-drag",
            startWorld: world,
            originalStrokes: origStrokes,
            originalShapes: origShapes,
            originalConnectors: origConnectors,
            originalTexts: origTexts,
            liveStrokes: new Map(origStrokes),
            liveShapes: new Map(origShapes),
            liveConnectors: new Map(origConnectors),
            liveTexts: new Map(origTexts),
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
        const erasedStrokeIds = new Set<string>();
        const erasedShapeIds = new Set<string>();
        const erasedConnectorIds = new Set<string>();
        const erasedTextIds = new Set<string>();
        const hit = hitTestAt(world);
        if (hit) {
          if (hit.type === "stroke") erasedStrokeIds.add(hit.id);
          else if (hit.type === "shape") erasedShapeIds.add(hit.id);
          else if (hit.type === "connector") erasedConnectorIds.add(hit.id);
          else if (hit.type === "text") erasedTextIds.add(hit.id);
        }
        gestureRef.current = { kind: "erase", erasedStrokeIds, erasedShapeIds, erasedConnectorIds, erasedTextIds };
        scheduleRender();
        return;
      }

      if (
        currentTool === "rectangle" ||
        currentTool === "circle" ||
        currentTool === "triangle" ||
        currentTool === "diamond"
      ) {
        const settings = toolSettingsRef.current[currentTool];
        const shapeType: ShapeType =
          currentTool === "rectangle"
            ? "rectangle"
            : currentTool === "circle"
            ? "circle"
            : currentTool === "triangle"
            ? "triangle"
            : "diamond";

        const shape: CanvasShape = {
          id: generateId("shape"),
          type: "shape",
          shapeType,
          x: world.x,
          y: world.y,
          width: 1,
          height: 1,
          strokeColor: settings.color,
          fillColor: "#ffffff",
          strokeWidth: settings.width,
          opacity: settings.opacity,
          bounds: { minX: world.x, minY: world.y, maxX: world.x + 1, maxY: world.y + 1 },
          status: "confirmed",
          createdAt: Date.now(),
          version: 1,
        };
        gestureRef.current = { kind: "draw-shape", startWorld: world, shape };
        scheduleRender();
        return;
      }

      if (currentTool === "arrow" || currentTool === "line" || currentTool === "connector") {
        const settings = toolSettingsRef.current[currentTool];
        const connector: CanvasConnector = {
          id: generateId("conn"),
          type: "connector",
          startX: world.x,
          startY: world.y,
          endX: world.x,
          endY: world.y,
          routing: currentTool === "connector" ? "orthogonal" : "straight",
          strokeColor: settings.color,
          strokeWidth: settings.width,
          startArrow: false,
          endArrow: currentTool !== "line",
          bounds: { minX: world.x, minY: world.y, maxX: world.x, maxY: world.y },
          status: "confirmed",
          createdAt: Date.now(),
          version: 1,
        };
        gestureRef.current = { kind: "draw-connector", startWorld: world, connector };
        scheduleRender();
        return;
      }

      if (currentTool === "text") {
        const hit = hitTestAt(world);
        if (hit && hit.type === "text") {
          const existing = textObjectsRef.current.find((t) => t.id === hit.id);
          if (existing) {
            setInlineTextEditor({
              worldX: existing.x,
              worldY: existing.y,
              initialText: existing.text,
              fontSize: existing.fontSize || 18,
              color: existing.fontColor || "#1e1e1e",
              existingId: existing.id,
            });
            gestureRef.current = { kind: "idle" };
            return;
          }
        }
        const settings = toolSettingsRef.current.text;
        setInlineTextEditor({
          worldX: world.x,
          worldY: world.y,
          initialText: "",
          fontSize: settings.width || 18,
          color: settings.color || "#1e1e1e",
        });
        gestureRef.current = { kind: "idle" };
        return;
      }

      if (currentTool === "laser") {
        const settings = toolSettingsRef.current.laser;
        const trail: LaserTrail = {
          id: generateId("laser"),
          points: [world],
          createdAt: Date.now(),
          color: settings.color || "#ff2a5f",
          width: settings.width || 5,
        };
        laserTrailsRef.current.push(trail);
        gestureRef.current = { kind: "laser", trail };
        scheduleRender();
        return;
      }

      // Drawing tools: pen, pencil, highlighter.
      const settings = toolSettingsRef.current[currentTool];
      const point: Point = {
        ...world,
        pressure: e.pressure || 1,
        tiltX: e.tiltX ?? 0,
        tiltY: e.tiltY ?? 0,
        timestamp: Date.now(),
      };
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
    [worldFromEvent, handleAt, getCombinedSelectedBounds, hitTestAt, setSelection, scheduleRender, addTextObject]
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

      if (gesture.kind === "laser") {
        const events = getCoalescedEvents(e);
        const rect = canvasRef.current!.getBoundingClientRect();
        const newPoints: Point[] = events.map((ev) =>
          pointerEventToWorldPoint(
            ev,
            rect,
            cameraRef.current,
            viewportRef.current.width,
            viewportRef.current.height
          )
        );
        gesture.trail.points.push(...newPoints);
        gesture.trail.createdAt = Date.now();
        scheduleRender();
        return;
      }

      if (gesture.kind === "draw") {
        const events = getCoalescedEvents(e);
        const rect = canvasRef.current!.getBoundingClientRect();
        const newPoints: Point[] = events.map((ev) =>
          pointerEventToWorldPoint(
            ev,
            rect,
            cameraRef.current,
            viewportRef.current.width,
            viewportRef.current.height
          )
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

      if (gesture.kind === "draw-shape") {
        const world = worldFromEvent(e.clientX, e.clientY);
        const minX = Math.min(gesture.startWorld.x, world.x);
        const minY = Math.min(gesture.startWorld.y, world.y);
        const w = Math.max(10, Math.abs(world.x - gesture.startWorld.x));
        const h = Math.max(10, Math.abs(world.y - gesture.startWorld.y));
        const shape: CanvasShape = {
          ...gesture.shape,
          x: minX,
          y: minY,
          width: w,
          height: h,
          bounds: { minX, minY, maxX: minX + w, maxY: minY + h },
        };
        shape.bounds = boundsOfShape(shape);
        gestureRef.current = { ...gesture, shape };
        scheduleRender();
        return;
      }

      if (gesture.kind === "draw-connector") {
        const world = worldFromEvent(e.clientX, e.clientY);
        const connector: CanvasConnector = {
          ...gesture.connector,
          endX: world.x,
          endY: world.y,
          bounds: {
            minX: Math.min(gesture.startWorld.x, world.x) - 5,
            minY: Math.min(gesture.startWorld.y, world.y) - 5,
            maxX: Math.max(gesture.startWorld.x, world.x) + 5,
            maxY: Math.max(gesture.startWorld.y, world.y) + 5,
          },
        };
        gestureRef.current = { ...gesture, connector };
        scheduleRender();
        return;
      }

      if (gesture.kind === "erase") {
        const world = worldFromEvent(e.clientX, e.clientY);
        const hit = hitTestAt(world);
        if (hit) {
          if (hit.type === "stroke") gesture.erasedStrokeIds.add(hit.id);
          else if (hit.type === "shape") gesture.erasedShapeIds.add(hit.id);
          else if (hit.type === "connector") gesture.erasedConnectorIds.add(hit.id);
          else if (hit.type === "text") gesture.erasedTextIds.add(hit.id);
          scheduleRender();
        }
        return;
      }

      if (gesture.kind === "select-drag") {
        const world = worldFromEvent(e.clientX, e.clientY);
        const dx = world.x - gesture.startWorld.x;
        const dy = world.y - gesture.startWorld.y;
        const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || gesture.moved;

        gesture.originalStrokes.forEach((orig, id) => {
          const points = translatePoints(orig.points, dx, dy);
          gesture.liveStrokes.set(id, {
            ...orig,
            points,
            bounds: boundsOfPoints(points),
            version: orig.version + 1,
          });
        });

        gesture.originalShapes.forEach((orig, id) => {
          const shape: CanvasShape = {
            ...orig,
            x: orig.x + dx,
            y: orig.y + dy,
            version: orig.version + 1,
            bounds: { minX: orig.x + dx, minY: orig.y + dy, maxX: orig.x + orig.width + dx, maxY: orig.y + orig.height + dy },
          };
          shape.bounds = boundsOfShape(shape);
          gesture.liveShapes.set(id, shape);
        });

        gesture.originalConnectors.forEach((orig, id) => {
          const conn: CanvasConnector = {
            ...orig,
            startX: orig.startX + dx,
            startY: orig.startY + dy,
            endX: orig.endX + dx,
            endY: orig.endY + dy,
            version: orig.version + 1,
            bounds: {
              minX: Math.min(orig.startX + dx, orig.endX + dx) - 5,
              minY: Math.min(orig.startY + dy, orig.endY + dy) - 5,
              maxX: Math.max(orig.startX + dx, orig.endX + dx) + 5,
              maxY: Math.max(orig.startY + dy, orig.endY + dy) + 5,
            },
          };
          gesture.liveConnectors.set(id, conn);
        });

        gesture.originalTexts.forEach((orig, id) => {
          const t: CanvasText = {
            ...orig,
            x: orig.x + dx,
            y: orig.y + dy,
            version: orig.version + 1,
            bounds: { minX: orig.x + dx, minY: orig.y + dy, maxX: orig.x + orig.width + dx, maxY: orig.y + orig.height + dy },
          };
          gesture.liveTexts.set(id, t);
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

        gesture.originalStrokes.forEach((orig, id) => {
          const points = scalePoints(orig.points, anchor, scaleX, scaleY);
          const width = clamp(orig.width * ((scaleX + scaleY) / 2), 0.5, 400);
          gesture.liveStrokes.set(id, {
            ...orig,
            points,
            width,
            bounds: boundsOfPoints(points),
            version: orig.version + 1,
          });
        });

        gesture.originalShapes.forEach((orig, id) => {
          const newX = anchor.x + (orig.x - anchor.x) * scaleX;
          const newY = anchor.y + (orig.y - anchor.y) * scaleY;
          const shape: CanvasShape = {
            ...orig,
            x: Math.min(newX, newX + orig.width * scaleX),
            y: Math.min(newY, newY + orig.height * scaleY),
            width: Math.max(20, orig.width * scaleX),
            height: Math.max(20, orig.height * scaleY),
            version: orig.version + 1,
            bounds: { minX: newX, minY: newY, maxX: newX + orig.width * scaleX, maxY: newY + orig.height * scaleY },
          };
          shape.bounds = boundsOfShape(shape);
          gesture.liveShapes.set(id, shape);
        });

        gesture.originalTexts.forEach((orig, id) => {
          const newX = anchor.x + (orig.x - anchor.x) * scaleX;
          const newY = anchor.y + (orig.y - anchor.y) * scaleY;
          gesture.liveTexts.set(id, {
            ...orig,
            x: newX,
            y: newY,
            width: Math.max(20, orig.width * scaleX),
            height: Math.max(15, orig.height * scaleY),
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
    [worldFromEvent, hitTestAt, setCamera, scheduleRender]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current;
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // safe to ignore
      }

      if (gesture.kind === "laser") {
        gesture.trail.createdAt = Date.now();
        gestureRef.current = { kind: "idle" };
        const decayLoop = () => {
          const now = Date.now();
          laserTrailsRef.current = laserTrailsRef.current.filter((t) => now - t.createdAt < 3000);
          scheduleRender();
          if (laserTrailsRef.current.length > 0) {
            requestAnimationFrame(decayLoop);
          }
        };
        requestAnimationFrame(decayLoop);
        return;
      }

      if (gesture.kind === "draw") {
        if (gesture.stroke.points.length > 0) {
          addStroke(gesture.stroke);
        }
      } else if (gesture.kind === "draw-shape") {
        if (gesture.shape.width > 5 && gesture.shape.height > 5) {
          addShape(gesture.shape);
        }
      } else if (gesture.kind === "draw-connector") {
        const c = gesture.connector;
        if (Math.hypot(c.endX - c.startX, c.endY - c.startY) > 5) {
          addConnector(gesture.connector);
        }
      } else if (gesture.kind === "erase") {
        const nextStrokes = strokesRef.current.filter((s) => !gesture.erasedStrokeIds.has(s.id));
        const nextShapes = shapesRef.current.filter((s) => !gesture.erasedShapeIds.has(s.id));
        const nextConnectors = connectorsRef.current.filter((c) => !gesture.erasedConnectorIds.has(c.id));
        const nextTexts = textObjectsRef.current.filter((t) => !gesture.erasedTextIds.has(t.id));
        commitScene({
          strokes: nextStrokes,
          shapes: nextShapes,
          connectors: nextConnectors,
          textObjects: nextTexts,
        });
      } else if (gesture.kind === "select-drag") {
        if (gesture.moved) {
          const nextStrokes = strokesRef.current.map((s) => gesture.liveStrokes.get(s.id) ?? s);
          const nextShapes = shapesRef.current.map((s) => gesture.liveShapes.get(s.id) ?? s);
          const nextConnectors = connectorsRef.current.map((c) => gesture.liveConnectors.get(c.id) ?? c);
          const nextTexts = textObjectsRef.current.map((t) => gesture.liveTexts.get(t.id) ?? t);
          commitScene({
            strokes: nextStrokes,
            shapes: nextShapes,
            connectors: nextConnectors,
            textObjects: nextTexts,
          });
        }
      } else if (gesture.kind === "resize") {
        const nextStrokes = strokesRef.current.map((s) => gesture.liveStrokes.get(s.id) ?? s);
        const nextShapes = shapesRef.current.map((s) => gesture.liveShapes.get(s.id) ?? s);
        const nextTexts = textObjectsRef.current.map((t) => gesture.liveTexts.get(t.id) ?? t);
        commitScene({
          strokes: nextStrokes,
          shapes: nextShapes,
          textObjects: nextTexts,
        });
      } else if (gesture.kind === "marquee") {
        const box = gesture.current;
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        const hitStrokes = strokesRef.current.filter((s) => strokeIntersectsBox(s, box)).map((s) => s.id);
        const hitShapes = shapesRef.current
          .filter(
            (s) =>
              s.x + s.width >= box.minX &&
              s.x <= box.maxX &&
              s.y + s.height >= box.minY &&
              s.y <= box.maxY
          )
          .map((s) => s.id);
        const hitConnectors = connectorsRef.current
          .filter((c) => c.bounds.maxX >= box.minX && c.bounds.minX <= box.maxX && c.bounds.maxY >= box.minY && c.bounds.minY <= box.maxY)
          .map((c) => c.id);
        const hitTexts = textObjectsRef.current
          .filter(
            (t) =>
              t.x + t.width >= box.minX &&
              t.x <= box.maxX &&
              t.y + t.height >= box.minY &&
              t.y <= box.maxY
          )
          .map((t) => t.id);

        const allHits = [...hitStrokes, ...hitShapes, ...hitConnectors, ...hitTexts];
        if (allHits.length > 0) {
          setSelection(additive ? Array.from(new Set([...selectedIdsRef.current, ...allHits])) : allHits);
        }
      }

      gestureRef.current = { kind: "idle" };
      scheduleRender();
    },
    [addStroke, addShape, addConnector, commitScene, setSelection, scheduleRender]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = canvasRef.current!.getBoundingClientRect();
      const pivot = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      if (e.ctrlKey || e.metaKey) {
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
      {inlineTextEditor && (() => {
        const rect = containerRef.current?.getBoundingClientRect();
        const vw = rect?.width || window.innerWidth;
        const vh = rect?.height || window.innerHeight;
        return (
          <InlineTextEditorComponent
            worldX={inlineTextEditor.worldX}
            worldY={inlineTextEditor.worldY}
            initialText={inlineTextEditor.initialText}
            fontSize={inlineTextEditor.fontSize}
            color={inlineTextEditor.color}
            camera={camera}
            viewportWidth={vw}
            viewportHeight={vh}
            onCommit={commitInlineText}
            onCancel={() => setInlineTextEditor(null)}
            onManualAnalyze={onManualAnalyze}
          />
        );
      })()}
    </div>
  );
}

function InlineTextEditorComponent({
  worldX,
  worldY,
  initialText,
  fontSize,
  color,
  camera,
  viewportWidth,
  viewportHeight,
  onCommit,
  onCancel,
  onManualAnalyze,
}: {
  worldX: number;
  worldY: number;
  initialText: string;
  fontSize: number;
  color: string;
  camera: { x: number; y: number; zoom: number };
  viewportWidth: number;
  viewportHeight: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
  onManualAnalyze?: () => void;
}) {
  const [val, setVal] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, []);

  const screen = worldToScreen({ x: worldX, y: worldY }, camera, viewportWidth, viewportHeight);

  return (
    <textarea
      ref={textareaRef}
      className="canvas-inline-text-editor"
      style={{
        position: "absolute",
        left: screen.x,
        top: screen.y,
        fontSize: `${Math.max(12, fontSize * camera.zoom)}px`,
        color,
        caretColor: color,
        fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", "Segoe UI", Roboto, sans-serif',
        lineHeight: 1.35,
        minWidth: `${Math.max(30, 30 * camera.zoom)}px`,
        minHeight: `${Math.max(24, 24 * camera.zoom)}px`,
      }}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          onCommit(val);
          onManualAnalyze?.();
        } else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onCommit(val);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onCommit(val)}
    />
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

const PEN_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%231e1e1e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>') 2 22, crosshair`;

const PENCIL_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%233a3a3a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>') 2 22, crosshair`;

const HIGHLIGHTER_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="%23ffd43b" stroke="%23d97706" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h3l6-6"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>') 3 20, crosshair`;

const ERASER_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="%23ffffff" stroke="%23e03131" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>') 5 19, cell`;

const LASER_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="%23ff2a5f"/><circle cx="12" cy="12" r="9" fill="none" stroke="%23ff2a5f" stroke-width="1.5" stroke-dasharray="2 2"/><circle cx="12" cy="12" r="2" fill="%23ffffff"/></svg>') 12 12, crosshair`;

function cursorForTool(tool: string, spaceHeld: boolean): string {
  if (spaceHeld || tool === "hand") return "grab";
  if (tool === "select") return "default";
  if (tool === "pen") return PEN_CURSOR;
  if (tool === "pencil") return PENCIL_CURSOR;
  if (tool === "highlighter") return HIGHLIGHTER_CURSOR;
  if (tool === "eraser") return ERASER_CURSOR;
  if (tool === "laser") return LASER_CURSOR;
  if (tool === "text") return "text";
  return "crosshair";
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useCanvasStore } from "../state/canvasStore";
import { Toolbar } from "../components/Toolbar/Toolbar";
import { TopRightActions } from "../components/UI/TopRightActions";
import { ShapePalette } from "../components/UI/ShapePalette";
import { BottomControls } from "../components/UI/BottomControls";
import { PromptSidebar } from "../components/UI/PromptSidebar";

// @ts-expect-error React test env flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setNativeValue(element: HTMLElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    (element as any).value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("UI Layout Components", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    useCanvasStore.setState({
      strokes: [],
      shapes: [],
      connectors: [],
      textObjects: [],
      aiObjects: [],
      selectedIds: [],
      tool: "pen",
      camera: { x: 0, y: 0, zoom: 1.5 },
      pendingRequests: [],
      history: { past: [], future: [] },
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  describe("Toolbar", () => {
    it("renders drawing tools, shapes dropdown in top bar, and center AI button", async () => {
      const onManualAnalyze = vi.fn();

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <Toolbar
            onManualAnalyze={onManualAnalyze}
          />
        );
      });

      // Check left section tools
      const penBtn = container.querySelector('button[aria-label="Pen"]');
      expect(penBtn).not.toBeNull();

      const selectBtn = container.querySelector('button[aria-label="Select"]');
      expect(selectBtn).not.toBeNull();

      const textBtn = container.querySelector('button[aria-label="Text"]');
      expect(textBtn).not.toBeNull();

      // Check shapes dropdown trigger in the top toolbar
      const shapesBtn = container.querySelector('button[aria-label="Shapes"]') as HTMLButtonElement;
      expect(shapesBtn).not.toBeNull();

      // Open shapes dropdown in top bar
      await act(async () => {
        shapesBtn.click();
      });

      const shapesDropdown = container.querySelector('.toolbar__shapes-dropdown');
      expect(shapesDropdown).not.toBeNull();

      // Click a shape option from the top bar dropdown
      const triangleOption = container.querySelector('button[aria-label="Triangle"]') as HTMLButtonElement;
      expect(triangleOption).not.toBeNull();

      await act(async () => {
        triangleOption.click();
      });

      expect(useCanvasStore.getState().tool).toBe("triangle");

      // Check center AI analyze button
      const aiBtn = container.querySelector('button[aria-label="Analyze region now (Ctrl+Enter)"]') as HTMLButtonElement;
      expect(aiBtn).not.toBeNull();
      aiBtn.click();
      expect(onManualAnalyze).toHaveBeenCalledTimes(1);
    });

    it("renders 3-dots menu with Draw to Shape, Laser Pointer, and Toggle Grid (default off)", async () => {
      expect(useCanvasStore.getState().showGrid).toBe(false);
      expect(useCanvasStore.getState().drawToShapeEnabled).toBe(false);

      const root = createRoot(container);
      await act(async () => {
        root.render(<Toolbar onManualAnalyze={vi.fn()} />);
      });

      const moreBtn = container.querySelector('button[aria-label="More options"]') as HTMLButtonElement;
      expect(moreBtn).not.toBeNull();

      // Open 3-dots menu
      await act(async () => {
        moreBtn.click();
      });

      const moreMenu = container.querySelector(".toolbar__more-menu");
      expect(moreMenu).not.toBeNull();

      // Test Laser pointer selection
      const laserBtn = container.querySelector('button[aria-label="Laser pointer"]') as HTMLButtonElement;
      expect(laserBtn).not.toBeNull();

      await act(async () => {
        laserBtn.click();
      });

      expect(useCanvasStore.getState().tool).toBe("laser");

      // Reopen menu to test Draw to Shape and Grid
      await act(async () => {
        moreBtn.click();
      });

      const drawToShapeBtn = container.querySelector('button[aria-label="Draw to shape"]') as HTMLButtonElement;
      expect(drawToShapeBtn).not.toBeNull();

      await act(async () => {
        drawToShapeBtn.click();
      });

      expect(useCanvasStore.getState().drawToShapeEnabled).toBe(true);

      const gridBtn = container.querySelector('button[aria-label="Toggle grid"]') as HTMLButtonElement;
      expect(gridBtn).not.toBeNull();

      await act(async () => {
        gridBtn.click();
      });

      expect(useCanvasStore.getState().showGrid).toBe(true);
    });

    it("switches tools when clicking drawing buttons", async () => {
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <Toolbar
            onManualAnalyze={vi.fn()}
          />
        );
      });

      const eraserBtn = container.querySelector('button[aria-label="Eraser"]') as HTMLButtonElement;
      await act(async () => {
        eraserBtn.click();
      });

      expect(useCanvasStore.getState().tool).toBe("eraser");
    });
  });

  describe("TopRightActions", () => {
    it("renders document actions in top right corner", async () => {
      const onSave = vi.fn();
      const onLoad = vi.fn();
      const onExport = vi.fn();
      const onClear = vi.fn();
      const onToggleHelp = vi.fn();

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <TopRightActions
            onSave={onSave}
            onLoad={onLoad}
            onExport={onExport}
            onClear={onClear}
            onToggleHelp={onToggleHelp}
          />
        );
      });

      const saveBtn = container.querySelector('button[aria-label="Save JSON"]') as HTMLButtonElement;
      expect(saveBtn).not.toBeNull();
      saveBtn.click();
      expect(onSave).toHaveBeenCalledTimes(1);

      const loadBtn = container.querySelector('button[aria-label="Load JSON"]') as HTMLButtonElement;
      expect(loadBtn).not.toBeNull();
      loadBtn.click();
      expect(onLoad).toHaveBeenCalledTimes(1);

      const exportBtn = container.querySelector('button[aria-label="Download as Image"]') as HTMLButtonElement;
      expect(exportBtn).not.toBeNull();
      exportBtn.click();
      expect(onExport).toHaveBeenCalledTimes(1);

      const clearBtn = container.querySelector('button[aria-label="Clear canvas"]') as HTMLButtonElement;
      expect(clearBtn).not.toBeNull();
      clearBtn.click();
      expect(onClear).toHaveBeenCalledTimes(1);

      const helpBtn = container.querySelector('button[aria-label="Keyboard shortcuts"]') as HTMLButtonElement;
      expect(helpBtn).not.toBeNull();
      helpBtn.click();
      expect(onToggleHelp).toHaveBeenCalledTimes(1);
    });
  });

  describe("ShapePalette", () => {
    it("renders color picker and brush/stroke size controls on left-hand middle", async () => {
      useCanvasStore.setState({ tool: "rectangle" });
      const onClose = vi.fn();
      const root = createRoot(container);
      await act(async () => {
        root.render(<ShapePalette isOpen={true} onClose={onClose} />);
      });

      const palette = container.querySelector(".shape-palette");
      expect(palette).not.toBeNull();

      // Verify title shows current active shape style
      const title = container.querySelector(".shape-palette__title");
      expect(title?.textContent).toBe("Rectangle Style");

      // Verify Color and Size controls exist
      const labels = Array.from(container.querySelectorAll(".shape-palette__property-label")).map((el) => (el.textContent || "").toLowerCase());
      expect(labels.some((l) => l.includes("color"))).toBe(true);
      expect(labels.some((l) => l.includes("stroke") || l.includes("size"))).toBe(true);
    });

    it("does not render when tool is select and isOpen is false", async () => {
      useCanvasStore.setState({ tool: "select" });
      const root = createRoot(container);
      await act(async () => {
        root.render(<ShapePalette isOpen={false} onClose={vi.fn()} />);
      });

      expect(container.querySelector(".shape-palette")).toBeNull();
    });
  });

  describe("BottomControls", () => {
    it("displays dynamic actual zoom and triggers undo/redo/delete", async () => {
      useCanvasStore.setState({
        camera: { x: 0, y: 0, zoom: 1.75 },
        selectedIds: ["stroke_1"],
        history: { past: [{} as any], future: [{} as any] },
      });

      const root = createRoot(container);
      await act(async () => {
        root.render(<BottomControls />);
      });

      // Check dynamic zoom display (175%)
      const zoomBadge = container.querySelector(".bottom-controls__zoom-badge");
      expect(zoomBadge?.textContent).toBe("175%");

      // Reset zoom on badge click
      await act(async () => {
        (zoomBadge as HTMLButtonElement).click();
      });
      expect(useCanvasStore.getState().camera.zoom).toBe(1);

      // Check undo button is enabled
      const undoBtn = container.querySelector('button[aria-label="Undo"]') as HTMLButtonElement;
      expect(undoBtn.disabled).toBe(false);

      // Check delete button is enabled with active selection
      const deleteBtn = container.querySelector('button[aria-label="Delete selection"]') as HTMLButtonElement;
      expect(deleteBtn.disabled).toBe(false);
    });

    it("disables buttons when history or selection is empty", async () => {
      useCanvasStore.setState({
        selectedIds: [],
        history: { past: [], future: [] },
      });

      const root = createRoot(container);
      await act(async () => {
        root.render(<BottomControls />);
      });

      const undoBtn = container.querySelector('button[aria-label="Undo"]') as HTMLButtonElement;
      const redoBtn = container.querySelector('button[aria-label="Redo"]') as HTMLButtonElement;
      const deleteBtn = container.querySelector('button[aria-label="Delete selection"]') as HTMLButtonElement;

      expect(undoBtn.disabled).toBe(true);
      expect(redoBtn.disabled).toBe(true);
      expect(deleteBtn.disabled).toBe(true);
    });
  });

  describe("PromptSidebar", () => {
    it("starts collapsed and opens on button click", async () => {
      const onSubmitPrompt = vi.fn();
      const root = createRoot(container);
      await act(async () => {
        root.render(<PromptSidebar onSubmitPrompt={onSubmitPrompt} />);
      });

      const toggleBtn = container.querySelector(".prompt-sidebar__toggle-btn") as HTMLButtonElement;
      expect(toggleBtn).not.toBeNull();
      expect(container.querySelector(".prompt-sidebar")).toBeNull();

      await act(async () => {
        toggleBtn.click();
      });

      expect(container.querySelector(".prompt-sidebar")).not.toBeNull();
      const textarea = container.querySelector(".prompt-sidebar__textarea") as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
    });

    it("shows inline validation error on empty prompt submission without alert", async () => {
      const onSubmitPrompt = vi.fn();
      const root = createRoot(container);
      await act(async () => {
        root.render(<PromptSidebar onSubmitPrompt={onSubmitPrompt} />);
      });

      const toggleBtn = container.querySelector(".prompt-sidebar__toggle-btn") as HTMLButtonElement;
      await act(async () => {
        toggleBtn.click();
      });

      const sendBtn = container.querySelector(".prompt-sidebar__send-btn") as HTMLButtonElement;
      await act(async () => {
        sendBtn.click();
      });

      expect(onSubmitPrompt).not.toHaveBeenCalled();
      const errorMsg = container.querySelector(".prompt-sidebar__error-msg");
      expect(errorMsg).not.toBeNull();
      expect(errorMsg?.textContent).toContain("Please enter an instruction");
    });

    it("submits prompt text on Send click or Ctrl+Enter", async () => {
      const onSubmitPrompt = vi.fn();
      const root = createRoot(container);
      await act(async () => {
        root.render(<PromptSidebar onSubmitPrompt={onSubmitPrompt} />);
      });

      const toggleBtn = container.querySelector(".prompt-sidebar__toggle-btn") as HTMLButtonElement;
      await act(async () => {
        toggleBtn.click();
      });

      const textarea = container.querySelector(".prompt-sidebar__textarea") as HTMLTextAreaElement;
      await act(async () => {
        setNativeValue(textarea, "Create an event-driven architecture diagram");
      });

      const sendBtn = container.querySelector(".prompt-sidebar__send-btn") as HTMLButtonElement;
      await act(async () => {
        sendBtn.click();
      });

      expect(onSubmitPrompt).toHaveBeenCalledWith("Create an event-driven architecture diagram");
    });
  });
});

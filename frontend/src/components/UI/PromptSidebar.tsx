import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { useCanvasStore } from "../../state/canvasStore";
import "./PromptSidebar.css";

interface PromptSidebarProps {
  onSubmitPrompt: (prompt: string) => void;
}

export function PromptSidebar({ onSubmitPrompt }: PromptSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingRequests = useCanvasStore((s) => s.pendingRequests);
  const isAnalyzing = pendingRequests.length > 0;

  useEffect(() => {
    if (isOpen) {
      // Focus textarea when opened
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(() => {
    const trimmed = promptText.trim();
    if (!trimmed) {
      setValidationError("Please enter an instruction before sending.");
      textareaRef.current?.focus();
      return;
    }

    setValidationError(null);
    onSubmitPrompt(trimmed);
  }, [promptText, onSubmitPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Prevent event from bubbling up to canvas/window shortcuts
    e.stopPropagation();

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="prompt-sidebar-collapsed">
        <button
          type="button"
          className="prompt-sidebar__toggle-btn"
          onClick={() => setIsOpen(true)}
          title="Open AI Prompt Sidebar"
          aria-label="Open AI Prompt Sidebar"
        >
          <Sparkles size={16} className="prompt-sidebar__sparkle-icon" />
          <span>Prompt / Chat</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="prompt-sidebar"
      role="dialog"
      aria-label="AI Prompt Instruction"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="prompt-sidebar__header">
        <div className="prompt-sidebar__title-group">
          <div className="prompt-sidebar__icon-badge">
            <Sparkles size={15} />
          </div>
          <span className="prompt-sidebar__title">AI Instruction</span>
        </div>
        <button
          type="button"
          className="prompt-sidebar__close-btn"
          onClick={() => setIsOpen(false)}
          title="Close (Esc)"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>

      <div className="prompt-sidebar__body">
        <p className="prompt-sidebar__hint">
          Canvas context is automatically included with your prompt.
        </p>

        <div className="prompt-sidebar__input-wrapper">
          <textarea
            ref={textareaRef}
            className={`prompt-sidebar__textarea${validationError ? " prompt-sidebar__textarea--error" : ""}`}
            value={promptText}
            onChange={(e) => {
              setPromptText(e.target.value);
              if (validationError) setValidationError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type your instruction (e.g., 'Create a flowchart for order processing', 'Derive quadratic formula', 'Explain this diagram')..."
            rows={4}
          />
        </div>

        {validationError && (
          <div className="prompt-sidebar__error-msg" role="alert">
            {validationError}
          </div>
        )}
      </div>

      <div className="prompt-sidebar__footer">
        <span className="prompt-sidebar__shortcut-hint">
          Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to send
        </span>

        <button
          type="button"
          className="prompt-sidebar__send-btn"
          onClick={handleSubmit}
          disabled={isAnalyzing}
          title="Send instruction to AI (Ctrl+Enter)"
          aria-label="Send instruction to AI"
        >
          {isAnalyzing ? (
            <>
              <Loader2 size={14} className="prompt-sidebar__spinner" />
              <span>Analyzing…</span>
            </>
          ) : (
            <>
              <Send size={14} />
              <span>Send</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

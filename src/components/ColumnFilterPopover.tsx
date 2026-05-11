import React, { useState, useRef, useEffect } from "react";
import { Filter, X } from "lucide-react";

// ─── Tri-state: null = no filter, "include" = show only, "exclude" = hide ───

export type TriState = "include" | "exclude" | null;

export interface FilterOption {
  value: string;
  label: string;
}

interface ColumnFilterPopoverProps {
  options: FilterOption[];
  /** Map of value → tri-state */
  selections: Record<string, TriState>;
  onChange: (selections: Record<string, TriState>) => void;
  /** For text-based filters */
  textValue?: string;
  onTextChange?: (value: string) => void;
  mode: "text" | "options";
  dir?: "rtl" | "ltr";
}

const ColumnFilterPopover: React.FC<ColumnFilterPopoverProps> = ({
  options,
  selections,
  onChange,
  textValue,
  onTextChange,
  mode,
  dir,
}) => {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const hasActiveFilter =
    mode === "text"
      ? Boolean(textValue)
      : Object.values(selections).some((v) => v !== null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const cycleOption = (value: string) => {
    const current = selections[value] || null;
    let next: TriState;
    if (current === null) next = "include";
    else if (current === "include") next = "exclude";
    else next = null;
    onChange({ ...selections, [value]: next });
  };

  const clearAll = () => {
    if (mode === "text") {
      onTextChange?.("");
    } else {
      const cleared: Record<string, TriState> = {};
      for (const key of Object.keys(selections)) {
        cleared[key] = null;
      }
      onChange(cleared);
    }
  };

  return (
    <div className="relative inline-flex">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`p-0.5 rounded transition-colors ${
          hasActiveFilter
            ? "text-[#C4A35A] bg-amber-50"
            : "text-[#8B5E3C] opacity-40 hover:opacity-70"
        }`}
        title="Filtrer cette colonne"
      >
        <Filter className="w-3 h-3" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-white border border-[#D4C3A3] rounded-lg shadow-lg min-w-[160px] py-1"
          onClick={(e) => e.stopPropagation()}
        >
          {hasActiveFilter && (
            <button
              onClick={clearAll}
              className="w-full px-3 py-1 text-[9px] text-red-600 hover:bg-red-50 flex items-center gap-1 font-bold uppercase"
            >
              <X className="w-2.5 h-2.5" /> Effacer
            </button>
          )}

          {mode === "text" ? (
            <div className="px-2 py-1.5">
              <input
                type="text"
                value={textValue || ""}
                onChange={(e) => onTextChange?.(e.target.value)}
                placeholder="Filtrer…"
                dir={dir}
                autoFocus
                className="w-full text-xs px-2 py-1 border border-[#D4C3A3] rounded bg-white focus:outline-none focus:border-[#C4A35A]"
              />
            </div>
          ) : (
            <div className="max-h-[200px] overflow-y-auto">
              {options.map((opt) => {
                const state = selections[opt.value] || null;
                return (
                  <button
                    key={opt.value}
                    onClick={() => cycleOption(opt.value)}
                    className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-[#F6F1E6] flex items-center gap-2 transition-colors"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center text-[9px] font-bold shrink-0 ${
                        state === "include"
                          ? "bg-green-100 border-green-400 text-green-700"
                          : state === "exclude"
                          ? "bg-red-100 border-red-400 text-red-700"
                          : "border-[#D4C3A3] bg-white"
                      }`}
                    >
                      {state === "include" ? "✓" : state === "exclude" ? "✗" : ""}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="px-3 py-1 border-t border-[#D4C3A3]/40 mt-1">
            <p className="text-[8px] text-gray-400 italic">
              {mode === "options"
                ? "Clic: inclure → exclure → rien"
                : "Tapez pour filtrer"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColumnFilterPopover;

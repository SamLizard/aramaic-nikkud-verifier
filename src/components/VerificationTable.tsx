import React from "react";
import { FileUp, Layers, ArrowUpDown } from "lucide-react";
import type { WordEntry } from "../types";
import type { SortKey, Filters, TriState } from "../constants";
import {
  EMPTY_FILTERS,
  STATUS_FILTER_OPTIONS,
  EXACT_FILTER_OPTIONS,
  MANUAL_FILTER_OPTIONS,
  CORRECTION_FILTER_OPTIONS,
} from "../constants";
import ColumnFilterPopover from "./ColumnFilterPopover";
import TableRow from "./TableRow";

interface SortedRow {
  entry: WordEntry;
  originalIndex: number;
}

interface VerificationTableProps {
  results: WordEntry[];
  sortedResults: SortedRow[];
  selectedWordIdx: number | null;
  filters: Filters;
  onSort: (key: SortKey) => void;
  onFilterChange: (filters: Filters) => void;
  onSelectWord: (index: number) => void;
}

const VerificationTable: React.FC<VerificationTableProps> = ({
  results,
  sortedResults,
  selectedWordIdx,
  filters,
  onSort,
  onFilterChange,
  onSelectWord,
}) => {
  const hasAnyFilter =
    filters.word !== "" ||
    filters.dictionary !== "" ||
    filters.meaning !== "" ||
    Object.values(filters.status).some((v) => v !== null) ||
    Object.values(filters.manual).some((v) => v !== null) ||
    Object.values(filters.exact).some((v) => v !== null) ||
    Object.values(filters.correction).some((v) => v !== null);

  return (
    <div className="bg-white border border-[#D4C3A3] rounded-lg shadow-sm overflow-hidden flex flex-col h-[65vh]">
      <div className="bg-[#1F130B] px-4 py-2.5 text-[#FDFBF7] flex justify-between items-center shrink-0">
        <span className="flex items-center gap-2 font-serif text-sm">
          <Layers className="w-4 h-4 text-[#C4A35A]" /> Table de Vérification
        </span>
        <div className="flex items-center gap-3">
          {hasAnyFilter && (
            <button
              onClick={() => onFilterChange(EMPTY_FILTERS)}
              className="text-[9px] font-bold uppercase tracking-wide text-[#C4A35A] hover:text-white transition-colors"
            >
              Effacer filtres ×
            </button>
          )}
          <span className="text-[10px] opacity-40 uppercase tracking-widest">
            {sortedResults.length}
            {sortedResults.length !== results.length
              ? ` / ${results.length}`
              : ""}{" "}
            Mots
          </span>
        </div>
      </div>
      <div className="overflow-auto flex-grow">
        {results.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 opacity-15">
            <FileUp className="w-12 h-12" />
            <p className="font-serif text-base">Chargez un fichier JSON pour commencer</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 bg-[#F6F1E6] z-10">
              <tr className="border-b border-[#D4C3A3] text-[9px] font-bold text-[#8B5E3C] uppercase">
                <th className="p-2 w-10 text-center">#</th>
                <TableHeader
                  label="Mot (Nikkud)"
                  sortKey="word"
                  className="w-40"
                  onSort={onSort}
                  filterNode={
                    <ColumnFilterPopover
                      mode="text"
                      options={[]}
                      selections={{}}
                      onChange={() => {}}
                      textValue={filters.word}
                      onTextChange={(v) => onFilterChange({ ...filters, word: v })}
                      dir="rtl"
                    />
                  }
                />
                <TableHeader
                  label="Dictionnaire"
                  sortKey="dictionary"
                  className="w-36"
                  onSort={onSort}
                  filterNode={
                    <ColumnFilterPopover
                      mode="text"
                      options={[]}
                      selections={{}}
                      onChange={() => {}}
                      textValue={filters.dictionary}
                      onTextChange={(v) => onFilterChange({ ...filters, dictionary: v })}
                    />
                  }
                />
                <TableHeader
                  label="Sens français"
                  sortKey="meaning"
                  className=""
                  onSort={onSort}
                  filterNode={
                    <ColumnFilterPopover
                      mode="text"
                      options={[]}
                      selections={{}}
                      onChange={() => {}}
                      textValue={filters.meaning}
                      onTextChange={(v) => onFilterChange({ ...filters, meaning: v })}
                    />
                  }
                />
                <TableHeader
                  label="Statut"
                  sortKey="status"
                  className="w-20 text-center"
                  onSort={onSort}
                  filterNode={
                    <ColumnFilterPopover
                      mode="options"
                      options={STATUS_FILTER_OPTIONS}
                      selections={filters.status}
                      onChange={(s) => onFilterChange({ ...filters, status: s as Record<string, TriState> })}
                    />
                  }
                />
                <TableHeader
                  label="Manuel"
                  sortKey="manual"
                  className="w-28 text-center"
                  onSort={onSort}
                  filterNode={
                    <ColumnFilterPopover
                      mode="options"
                      options={MANUAL_FILTER_OPTIONS}
                      selections={filters.manual}
                      onChange={(s) => onFilterChange({ ...filters, manual: s as Record<string, TriState> })}
                    />
                  }
                />
                <TableHeader
                  label="Même exact ?"
                  sortKey="exact"
                  className="w-24 text-center"
                  onSort={onSort}
                  filterNode={
                    <ColumnFilterPopover
                      mode="options"
                      options={EXACT_FILTER_OPTIONS}
                      selections={filters.exact}
                      onChange={(s) => onFilterChange({ ...filters, exact: s as Record<string, TriState> })}
                    />
                  }
                />
                <TableHeader
                  label="Correction IA"
                  sortKey="correction"
                  className="w-40"
                  onSort={onSort}
                  filterNode={
                    <ColumnFilterPopover
                      mode="options"
                      options={CORRECTION_FILTER_OPTIONS}
                      selections={filters.correction}
                      onChange={(s) => onFilterChange({ ...filters, correction: s as Record<string, TriState> })}
                    />
                  }
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4C3A3]/20">
              {sortedResults.map(({ entry, originalIndex }) => (
                <TableRow
                  key={originalIndex}
                  entry={entry}
                  originalIndex={originalIndex}
                  isSelected={selectedWordIdx === originalIndex}
                  onSelect={onSelectWord}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── Sub-component for table headers with sort + filter ──────────────────────

interface TableHeaderProps {
  label: string;
  sortKey: SortKey;
  className: string;
  onSort: (key: SortKey) => void;
  filterNode: React.ReactNode;
}

const TableHeader: React.FC<TableHeaderProps> = ({
  label,
  sortKey,
  className,
  onSort,
  filterNode,
}) => (
  <th className={`p-2 ${className}`}>
    <div className="flex items-center gap-1">
      <button
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 flex-1 min-w-0"
      >
        <span className="truncate">{label}</span>
        <ArrowUpDown className="w-3 h-3 opacity-40 shrink-0" />
      </button>
      {filterNode}
    </div>
  </th>
);

export default VerificationTable;

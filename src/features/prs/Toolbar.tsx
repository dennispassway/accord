import type { RefObject } from "react";
import { mod } from "../../lib/platform";
import {
  ChevronIcon,
  CloseIcon,
  PersonIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  SortIcon,
} from "./icons";
import { PersonMenu } from "./PersonMenu";
import {
  type PersonFilter,
  type PersonOption,
  personFilterLabel,
} from "./personFilter";
import { SortMenu } from "./SortMenu";
import type { SortMode } from "./sort";
import "./toolbar.css";

interface ToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onRefresh: () => void;
  refreshing?: boolean;
  lastUpdatedLabel?: string;
  resultCount?: { hits: number; total: number };
  sortLabel?: string;
  onSortClick?: () => void;
  onOpenSettings?: () => void;
  /** Actieve sorteermodus; alleen nodig als het popover-menu getoond wordt. */
  sortMode?: SortMode;
  sortOpen?: boolean;
  onSelectSort?: (mode: SortMode) => void;
  onCloseSort?: () => void;
  personFilter: PersonFilter;
  people: PersonOption[];
  me: string;
  personOpen: boolean;
  onPersonClick: () => void;
  onChangePerson: (filter: PersonFilter) => void;
  onClosePerson: () => void;
}

/**
 * Sleepstrook (52px, `data-tauri-drag-region`) met het zoekveld, de
 * instellingen-, sorteer- en ververs-knop. Staat rechts van de sidebar, die
 * de ruimte voor de macOS-stoplichten vrijhoudt; interactieve elementen
 * krijgen bewust geen drag-region-attribuut zodat ze niet meeslepen.
 */
export function Toolbar({
  search,
  onSearchChange,
  searchInputRef,
  onRefresh,
  refreshing = false,
  lastUpdatedLabel,
  resultCount,
  sortLabel,
  onSortClick = () => {},
  onOpenSettings = () => {},
  sortMode,
  sortOpen = false,
  onSelectSort = () => {},
  onCloseSort = () => {},
  personFilter,
  people,
  me,
  personOpen,
  onPersonClick,
  onChangePerson,
  onClosePerson,
}: ToolbarProps) {
  return (
    <div className="toolbar" data-tauri-drag-region>
      <label className={search ? "toolbar-search active" : "toolbar-search"}>
        <SearchIcon className="toolbar-search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Zoek op titel, repo of nummer"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {resultCount ? (
          <span className="toolbar-search-result mono">
            {resultCount.hits} van {resultCount.total}
          </span>
        ) : null}
        {search ? (
          <button
            type="button"
            className="toolbar-search-clear"
            title="Leegmaken (esc)"
            aria-label="Zoekveld leegmaken"
            onClick={() => {
              onSearchChange("");
              searchInputRef.current?.blur();
            }}
          >
            <CloseIcon />
          </button>
        ) : (
          <span className="toolbar-search-kbd mono">{mod("F")}</span>
        )}
      </label>
      <div className="toolbar-spacer" data-tauri-drag-region />
      <button
        type="button"
        className="toolbar-icon-btn"
        title={`Instellingen (${mod(",")})`}
        aria-label="Instellingen"
        onClick={onOpenSettings}
      >
        <SettingsIcon />
      </button>
      <div className="toolbar-sort-wrap">
        <button
          type="button"
          className={
            personFilter.login == null
              ? "toolbar-sort"
              : "toolbar-sort toolbar-filter-active"
          }
          title={`Filter op persoon: ${personFilterLabel(personFilter, me)}`}
          aria-haspopup="menu"
          aria-expanded={personOpen}
          onClick={onPersonClick}
        >
          <PersonIcon className="toolbar-sort-icon" />
          <span className="toolbar-filter-label">
            {personFilterLabel(personFilter, me)}
          </span>
          <ChevronIcon className="toolbar-sort-chevron" />
        </button>
        {personOpen && (
          <PersonMenu
            // useRovingMenu onthoudt alleen een index: verdwijnt de gefocuste
            // persoon bij een refresh, dan valt de focus uit het menu.
            // Hermounten zet hem terug op de gekozen keuze. De rol hoort erin
            // zodat een rolwissel altijd naar de personenlijst springt, ook
            // als twee rollen dezelfde logins hebben.
            key={[
              personFilter.role,
              ...people.map((person) => person.login),
            ].join("\n")}
            filter={personFilter}
            people={people}
            me={me}
            onChange={onChangePerson}
            onClose={onClosePerson}
          />
        )}
      </div>
      <div className="toolbar-sort-wrap">
        <button
          type="button"
          className="toolbar-sort"
          title="Sorteren"
          onClick={onSortClick}
        >
          <SortIcon className="toolbar-sort-icon" />
          {sortLabel ?? "Sorteren"}
          <ChevronIcon className="toolbar-sort-chevron" />
        </button>
        {sortOpen && sortMode && (
          <SortMenu
            activeMode={sortMode}
            onSelect={onSelectSort}
            onClose={onCloseSort}
          />
        )}
      </div>
      {lastUpdatedLabel != null && (
        <span className="toolbar-last-updated mono">{lastUpdatedLabel}</span>
      )}
      <button
        type="button"
        className={
          refreshing ? "toolbar-icon-btn refreshing" : "toolbar-icon-btn"
        }
        title={`Ververs (${mod("R")})`}
        aria-label="Ververs"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <RefreshIcon className={refreshing ? "spinning" : undefined} />
      </button>
    </div>
  );
}

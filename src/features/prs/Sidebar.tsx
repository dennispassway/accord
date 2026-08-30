import { useState } from "react";
import type { RepoId } from "../../lib/github/domain";
import type { RepoGroup } from "../../lib/github/organize";
import { repoDotBg } from "./Avatar";
import { loadFavorites, saveFavorites } from "./cockpitPrefs";
import { GithubIcon, InboxIcon, MergeIcon } from "./icons";
import "./sidebar.css";

interface SidebarProps {
  groups: RepoGroup[];
  totalCount: number;
  selectedRepoId: RepoId | "all";
  onSelect: (repoId: RepoId | "all") => void;
  login: string;
  clis?: { claude: boolean; codex: boolean };
}

/** owner/name -> name (de owner blijft alleen zichtbaar in de tooltip). */
function repoNameOnly(repoId: RepoId): string {
  const slash = repoId.indexOf("/");
  return slash === -1 ? repoId : repoId.slice(slash + 1);
}

export function Sidebar({
  groups,
  totalCount,
  selectedRepoId,
  onSelect,
  login,
  clis,
}: SidebarProps) {
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);

  function toggleFavorite(repoId: RepoId) {
    const next = favorites.includes(repoId)
      ? favorites.filter((id) => id !== repoId)
      : [...favorites, repoId];
    setFavorites(next);
    saveFavorites(next);
  }

  /** Volgorde binnen elke sectie blijft die van groupByRepo. */
  const favoriteGroups = groups.filter((group) =>
    favorites.includes(group.repoId),
  );
  const otherGroups = groups.filter(
    (group) => !favorites.includes(group.repoId),
  );

  const renderGroup = (group: RepoGroup) => {
    const isFavorite = favorites.includes(group.repoId);
    return (
      <div className="sidebar-row" key={group.repoId}>
        <button
          type="button"
          className={
            selectedRepoId === group.repoId
              ? "sidebar-item selected"
              : "sidebar-item"
          }
          title={group.repoId}
          onClick={() => onSelect(group.repoId)}
        >
          <span
            className="sidebar-dot sidebar-dot-repo"
            style={{ background: repoDotBg(group.repoId) }}
          />
          <span className="sidebar-name">{repoNameOnly(group.repoId)}</span>
          <span className="sidebar-count mono">{group.prs.length}</span>
        </button>
        <button
          type="button"
          className={isFavorite ? "sidebar-star on" : "sidebar-star"}
          aria-label={
            isFavorite ? "Verwijder uit favorieten" : "Markeer als favoriet"
          }
          aria-pressed={isFavorite}
          onClick={() => toggleFavorite(group.repoId)}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>
    );
  };

  return (
    <nav className="sidebar">
      {/* Loopt door tot de vensterrand: deze strook houdt de macOS-stoplichten
          vrij en lijnt de eerste rij uit met de onderkant van de toolbar. */}
      <div className="sidebar-top" data-tauri-drag-region />
      <div className="sidebar-head" data-tauri-drag-region>
        <span className="sidebar-logo">
          <MergeIcon size={14} />
        </span>
        Accord
      </div>
      <div className="sidebar-rows">
        <button
          type="button"
          className={
            selectedRepoId === "all" ? "sidebar-item selected" : "sidebar-item"
          }
          onClick={() => onSelect("all")}
        >
          <span className="sidebar-item-icon">
            <InboxIcon size={14} />
          </span>
          <span className="sidebar-name sidebar-name-all">Alles</span>
          <span className="sidebar-count mono">{totalCount}</span>
        </button>
        {favoriteGroups.length > 0 && (
          <>
            <div className="sidebar-heading mono">Favorieten</div>
            {favoriteGroups.map(renderGroup)}
          </>
        )}
        <div className="sidebar-heading mono">Projecten</div>
        {otherGroups.map(renderGroup)}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-login">
          <GithubIcon />
          <span title={login}>{login}</span>
        </div>
        <div className="sidebar-clis mono">
          <span
            className={
              clis?.claude === false ? "sidebar-cli off" : "sidebar-cli"
            }
          >
            <span className="sidebar-cli-dot" />
            {clis?.claude === false ? "claude niet gevonden" : "claude"}
          </span>
          <span
            className={
              clis?.codex === false ? "sidebar-cli off" : "sidebar-cli"
            }
          >
            <span className="sidebar-cli-dot" />
            {clis?.codex === false ? "codex niet gevonden" : "codex"}
          </span>
        </div>
      </div>
    </nav>
  );
}

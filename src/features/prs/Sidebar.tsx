import type { RepoId } from "../../lib/github/domain";
import type { RepoGroup } from "../../lib/github/organize";
import { GithubIcon } from "./icons";
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
  return (
    <nav className="sidebar">
      {/* Loopt door tot de vensterrand: deze strook houdt de macOS-stoplichten
          vrij en lijnt de eerste rij uit met de onderkant van de toolbar. */}
      <div className="sidebar-top" data-tauri-drag-region />
      <div className="sidebar-rows">
        <button
          type="button"
          className={
            selectedRepoId === "all" ? "sidebar-item selected" : "sidebar-item"
          }
          onClick={() => onSelect("all")}
        >
          <span className="sidebar-dot sidebar-dot-all" />
          <span className="sidebar-name sidebar-name-all">Alles</span>
          <span className="sidebar-count mono">{totalCount}</span>
        </button>
        <div className="sidebar-heading mono">Projecten</div>
        {groups.map((group) => (
          <button
            type="button"
            key={group.repoId}
            className={
              selectedRepoId === group.repoId
                ? "sidebar-item selected"
                : "sidebar-item"
            }
            title={group.repoId}
            onClick={() => onSelect(group.repoId)}
          >
            <span className="sidebar-dot" />
            <span className="sidebar-name">{repoNameOnly(group.repoId)}</span>
            <span className="sidebar-count mono">{group.prs.length}</span>
          </button>
        ))}
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

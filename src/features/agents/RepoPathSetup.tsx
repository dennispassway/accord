import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { RepoId } from "../../lib/github/domain";
import { MapIcon } from "../prs/icons";
import "./agents.css";

interface RepoPathSetupProps {
  repoId: RepoId;
  onLinked: () => Promise<void>;
}

interface ScanResult {
  repoId: string;
  path: string;
}

/**
 * Verschijnt in het detailpaneel zodra een agent-actie een niet-gekoppelde
 * repo raakt: primair "Map zoeken…", daaronder een mono-invoer voor het pad.
 */
export function RepoPathSetup({ repoId, onLinked }: RepoPathSetupProps) {
  const [manualPath, setManualPath] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function scan() {
    setBusy(true);
    setMessage(null);
    try {
      const found = await invoke<ScanResult[]>("scan_projects", {
        roots: ["~/Projects", "~/Code"],
      });
      await onLinked();
      const hit = found.find((entry) => entry.repoId === repoId);
      setMessage(
        hit
          ? `Gekoppeld aan ${hit.path}`
          : `${found.length} repo's gevonden, maar ${repoId} zat er niet bij. Zet het pad handmatig.`,
      );
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await invoke("set_repo_path", { repoId, path: manualPath });
      await onLinked();
      setMessage(`Gekoppeld aan ${manualPath}`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="repo-path-setup">
      <div className="repo-path-setup-head">
        <MapIcon size={14} />
        <h3>Lokale map niet gekoppeld</h3>
      </div>
      <p className="repo-path-setup-body">
        De agent draait in een git-worktree van {repoId}. Kies de map waar de
        repo lokaal staat.
      </p>
      <button
        type="button"
        className="repo-path-scan"
        onClick={() => void scan()}
        disabled={busy}
      >
        Map zoeken…
      </button>
      <span className="repo-path-hint">of geef het pad handmatig</span>
      <div className="repo-path-manual">
        <input
          type="text"
          className="mono"
          placeholder="~/Projects/mijn-repo"
          value={manualPath}
          onChange={(event) => setManualPath(event.target.value)}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || manualPath.trim() === ""}
        >
          Koppelen
        </button>
      </div>
      {message != null && <p className="repo-path-message">{message}</p>}
    </div>
  );
}

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { type AgentModels, loadAgentModels } from "../../lib/agentModels";
import type { RepoId } from "../../lib/github/domain";
import { isMockApp, mockMode } from "../../lib/mock/mode";
import { mod } from "../../lib/platform";
import {
  claudeModels,
  codexModels,
  EFFORTS,
  REFRESH_OPTIONS,
  type Settings,
  TIMEOUT_OPTIONS,
  withCurrent,
} from "../../lib/settings";
import { THEMES } from "../../lib/theme";
import { RepoPathSetup } from "../agents/RepoPathSetup";
import { CloseIcon, SettingsIcon } from "../prs/icons";
import { nextLogoutClick } from "./logoutConfirm";
import "./settings.css";

/** Reset de "klik nogmaals"-staat als de tweede klik uitblijft. */
const LOGOUT_CONFIRM_TIMEOUT_MS = 3000;

const IS_MOCK = isMockApp(mockMode());

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdate: (updater: (current: Settings) => Settings) => void;
  login: string;
  onLogout: () => void;
  repoIds: RepoId[];
  repoPaths: Record<string, string>;
  onRepoLinked: () => Promise<void>;
}

function Segmented<T extends string | number>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (value: T) => void;
}) {
  return (
    <span className="settings-segmented">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={
            option === value
              ? "settings-segmented-option active"
              : "settings-segmented-option"
          }
          onClick={() => onChange(option)}
        >
          {labels?.[option] ?? option}
        </button>
      ))}
    </span>
  );
}

/**
 * Een select in plaats van de segmented control: de echte CLI-lijst telt zes of
 * meer namen en past niet in een rij van 350px. Een opgeslagen model dat de CLI
 * niet (meer) kent blijft kiesbaar, met een markering.
 */
function ModelSelect({
  known,
  value,
  onChange,
}: {
  known: string[];
  value: string;
  onChange: (model: string) => void;
}) {
  return (
    <select
      className="settings-select"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {withCurrent(known, value).map((model) => (
        <option key={model} value={model}>
          {known.includes(model) ? model : `${model} (onbekend)`}
        </option>
      ))}
    </select>
  );
}

/** owner/name -> name; alleen de repo-naam blijft zichtbaar in de rij. */
function repoNameOnly(repoId: RepoId): string {
  const slash = repoId.indexOf("/");
  return slash === -1 ? repoId : repoId.slice(slash + 1);
}

/**
 * Blad van 520px binnen het venster (design v2): Claude/Codex-instellingen,
 * reviewgedrag, lokale-mappenkoppeling en account/uitloggen. ⌘, opent,
 * Escape sluit (afgehandeld door Cockpit); een klik op de scrim sluit ook.
 */
export function SettingsSheet({
  open,
  onClose,
  settings,
  onUpdate,
  login,
  onLogout,
  repoIds,
  repoPaths,
  onRepoLinked,
}: SettingsSheetProps) {
  const [linkingRepo, setLinkingRepo] = useState<RepoId | null>(null);
  const [cliModels, setCliModels] = useState<AgentModels>({
    claude: [],
    codex: [],
  });
  const [unlinkErrors, setUnlinkErrors] = useState<Record<string, string>>({});
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const logoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearLogoutTimeout() {
    if (logoutTimeoutRef.current != null) {
      clearTimeout(logoutTimeoutRef.current);
      logoutTimeoutRef.current = null;
    }
  }

  function handleLogoutClick() {
    if (
      nextLogoutClick(confirmingLogout ? "confirming" : "idle") === "logout"
    ) {
      clearLogoutTimeout();
      setConfirmingLogout(false);
      onLogout();
      return;
    }
    setConfirmingLogout(true);
    clearLogoutTimeout();
    logoutTimeoutRef.current = setTimeout(() => {
      setConfirmingLogout(false);
    }, LOGOUT_CONFIRM_TIMEOUT_MS);
  }

  useEffect(() => {
    if (!open) {
      setLinkingRepo(null);
      setUnlinkErrors({});
      setConfirmingLogout(false);
      if (logoutTimeoutRef.current != null) {
        clearTimeout(logoutTimeoutRef.current);
        logoutTimeoutRef.current = null;
      }
    }
  }, [open]);

  // Opruimen bij unmount van de sheet zelf.
  useEffect(() => {
    return () => {
      if (logoutTimeoutRef.current != null)
        clearTimeout(logoutTimeoutRef.current);
    };
  }, []);

  async function unlink(repoId: RepoId) {
    setUnlinkErrors((current) => {
      const { [repoId]: _removed, ...rest } = current;
      return rest;
    });
    if (IS_MOCK) {
      await onRepoLinked();
      return;
    }
    try {
      await invoke("remove_repo_path", { repoId });
      await onRepoLinked();
    } catch (error) {
      setUnlinkErrors((current) => ({
        ...current,
        [repoId]: String(error),
      }));
    }
  }

  // Pas bij het openen ophalen; loadAgentModels cachet de uitkomst per sessie.
  useEffect(() => {
    if (open) void loadAgentModels().then(setCliModels);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="settings-scrim"
        aria-label="Sluit instellingen"
        onClick={onClose}
      />
      <div className="settings-sheet">
        <div className="settings-head">
          <SettingsIcon className="settings-head-icon" />
          <span className="settings-head-title">Instellingen</span>
          <button
            type="button"
            className="settings-close"
            title="Sluiten (esc)"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-title">Weergave</span>
            </div>
            <div className="settings-row">
              <span className="settings-row-label">
                <span className="settings-row-k">Thema</span>
              </span>
              <Segmented
                value={settings.theme}
                options={THEMES}
                labels={{ light: "Licht", dark: "Donker", system: "Systeem" }}
                onChange={(theme) => onUpdate((s) => ({ ...s, theme }))}
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-title">Claude</span>
              <span className="settings-section-note">claude CLI, lokaal</span>
            </div>
            <div className="settings-row">
              <span className="settings-row-label">
                <span className="settings-row-k">Model</span>
                <span className="settings-row-hint">gaat mee als --model</span>
              </span>
              <ModelSelect
                known={claudeModels(cliModels.claude)}
                value={settings.claude.model}
                onChange={(model) =>
                  onUpdate((s) => ({ ...s, claude: { ...s.claude, model } }))
                }
              />
            </div>
            <div className="settings-row">
              <span className="settings-row-label">
                <span className="settings-row-k">Effort</span>
                <span className="settings-row-hint">denkbudget per review</span>
              </span>
              <Segmented
                value={settings.claude.effort}
                options={EFFORTS}
                onChange={(effort) =>
                  onUpdate((s) => ({ ...s, claude: { ...s.claude, effort } }))
                }
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-title">Codex</span>
              <span className="settings-section-note">codex CLI, lokaal</span>
            </div>
            <div className="settings-row">
              <span className="settings-row-label">
                <span className="settings-row-k">Model</span>
                <span className="settings-row-hint">gaat mee als --model</span>
              </span>
              <ModelSelect
                known={codexModels(cliModels.codex)}
                value={settings.codex.model}
                onChange={(model) =>
                  onUpdate((s) => ({ ...s, codex: { ...s.codex, model } }))
                }
              />
            </div>
            <div className="settings-row">
              <span className="settings-row-label">
                <span className="settings-row-k">Effort</span>
                <span className="settings-row-hint">reasoning effort</span>
              </span>
              <Segmented
                value={settings.codex.effort}
                options={EFFORTS}
                onChange={(effort) =>
                  onUpdate((s) => ({ ...s, codex: { ...s.codex, effort } }))
                }
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-title">Reviewen</span>
            </div>
            <div className="settings-row">
              <span className="settings-row-label">
                <span className="settings-row-k">Primaire actie</span>
                <span className="settings-row-hint">
                  wat de agent-knop en toets R doen
                </span>
              </span>
              <Segmented
                value={settings.review.primaryMode}
                options={["commentsOnly", "withFixes"] as const}
                labels={{
                  commentsOnly: "alleen comments",
                  withFixes: "comments + fixes",
                }}
                onChange={(primaryMode) =>
                  onUpdate((s) => ({
                    ...s,
                    review: { ...s.review, primaryMode },
                  }))
                }
              />
            </div>
            <div className="settings-row">
              <span className="settings-row-label">
                <span className="settings-row-k">Time-out per run</span>
                <span className="settings-row-hint">
                  stop de agent automatisch
                </span>
              </span>
              <Segmented
                value={settings.review.timeoutMinutes}
                options={TIMEOUT_OPTIONS}
                labels={{
                  5: "5 min",
                  10: "10 min",
                  20: "20 min",
                  30: "30 min",
                }}
                onChange={(timeoutMinutes) =>
                  onUpdate((s) => ({
                    ...s,
                    review: { ...s.review, timeoutMinutes },
                  }))
                }
              />
            </div>
            <div className="settings-row">
              <span className="settings-row-label">
                <span className="settings-row-k">Verversen</span>
                <span className="settings-row-hint">
                  ophalen bij GitHub, {mod("R")} blijft werken
                </span>
              </span>
              <Segmented
                value={settings.review.refreshMinutes}
                options={REFRESH_OPTIONS}
                labels={{
                  1: "1 min",
                  5: "5 min",
                  15: "15 min",
                  0: "handmatig",
                }}
                onChange={(refreshMinutes) =>
                  onUpdate((s) => ({
                    ...s,
                    review: { ...s.review, refreshMinutes },
                  }))
                }
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-head">
              <span className="settings-section-title">Lokale mappen</span>
              <span className="settings-section-note">
                nodig voor de git-worktree van een agent
              </span>
            </div>
            {repoIds.map((repoId) => {
              const path = repoPaths[repoId];
              const linked = path != null && path !== "";
              return (
                <div key={repoId} className="settings-repo-row-wrap">
                  <div className="settings-repo-row">
                    <span className="settings-repo-name">
                      {repoNameOnly(repoId)}
                    </span>
                    {linked ? (
                      <span className="settings-repo-path mono">{path}</span>
                    ) : (
                      <span className="settings-repo-missing mono">
                        niet gekoppeld
                      </span>
                    )}
                    <button
                      type="button"
                      className="settings-repo-action"
                      onClick={() =>
                        setLinkingRepo((current) =>
                          current === repoId ? null : repoId,
                        )
                      }
                    >
                      {linked ? "Wijzig" : "Koppel"}
                    </button>
                    {linked && (
                      <button
                        type="button"
                        className="settings-repo-action"
                        onClick={() => void unlink(repoId)}
                      >
                        Ontkoppel
                      </button>
                    )}
                  </div>
                  {unlinkErrors[repoId] != null && (
                    <p className="settings-repo-missing">
                      Ontkoppelen mislukt: {unlinkErrors[repoId]}
                    </p>
                  )}
                  {linkingRepo === repoId && (
                    <RepoPathSetup
                      repoId={repoId}
                      onLinked={async () => {
                        await onRepoLinked();
                        setLinkingRepo(null);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="settings-account">
            <span className="settings-account-avatar">
              {login.slice(0, 1).toUpperCase()}
            </span>
            <span className="settings-account-login">{login}</span>
            <button
              type="button"
              className={
                confirmingLogout
                  ? "settings-account-logout confirming"
                  : "settings-account-logout"
              }
              onClick={handleLogoutClick}
            >
              {confirmingLogout
                ? "Klik nogmaals om uit te loggen"
                : "Uitloggen"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

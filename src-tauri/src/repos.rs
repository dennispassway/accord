use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoEntry {
    pub repo_id: String,
    pub path: String,
}

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("kon de config-map niet bepalen: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("kon de config-map niet maken: {e}"))?;
    Ok(dir.join("repo-paths.json"))
}

/// Zet een onleesbaar of corrupt bestand aan de kant in plaats van het te laten
/// blokkeren: een volgende run begint gewoon weer met een lege store.
fn quarantine_corrupt_file(path: &Path) {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let quarantined = path.with_file_name(format!("{name}.corrupt-{timestamp}"));
    let _ = fs::rename(path, quarantined);
}

fn read_store_at(path: &Path) -> Result<HashMap<String, String>, String> {
    match fs::read_to_string(path) {
        Ok(raw) if !raw.trim().is_empty() => match serde_json::from_str(&raw) {
            Ok(store) => Ok(store),
            Err(e) => {
                eprintln!("repo-paths.json is ongeldig ({e}), quarantaine en start leeg");
                quarantine_corrupt_file(path);
                Ok(HashMap::new())
            }
        },
        Ok(_) => Ok(HashMap::new()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(HashMap::new()),
        Err(e) => {
            eprintln!("kon repo-paths.json niet lezen ({e}), quarantaine en start leeg");
            quarantine_corrupt_file(path);
            Ok(HashMap::new())
        }
    }
}

fn read_store(app: &tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    read_store_at(&store_path(app)?)
}

/// Schrijft eerst naar een tempbestand in dezelfde map en hernoemt dat pas
/// naar de echte naam: een crash of gelijktijdige lezer ziet zo nooit een half
/// geschreven bestand.
fn write_store_at(path: &Path, store: &HashMap<String, String>) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(store)
        .map_err(|e| format!("kon repo-paths.json niet serialiseren: {e}"))?;
    let tmp_name = format!(
        "{}.tmp",
        path.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    );
    let tmp_path = path.with_file_name(tmp_name);
    fs::write(&tmp_path, raw).map_err(|e| format!("kon repo-paths.json niet schrijven: {e}"))?;
    fs::rename(&tmp_path, path).map_err(|e| format!("kon repo-paths.json niet vervangen: {e}"))
}

fn write_store(app: &tauri::AppHandle, store: &HashMap<String, String>) -> Result<(), String> {
    write_store_at(&store_path(app)?, store)
}

/// Leest de origin-url uit een .git/config zonder de git-CLI aan te roepen.
fn origin_url(git_config: &str) -> Option<String> {
    let mut in_origin = false;
    for line in git_config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_origin = trimmed == "[remote \"origin\"]";
            continue;
        }
        if in_origin {
            if let Some(rest) = trimmed.strip_prefix("url") {
                let value = rest.trim_start().strip_prefix('=')?.trim();
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

/// Zet een GitHub-remote-url om naar "owner/repo". Ondersteunt ssh- en https-vormen.
pub fn repo_id_from_url(url: &str) -> Option<String> {
    let rest = if let Some(rest) = url.strip_prefix("git@github.com:") {
        rest
    } else if let Some(rest) = url.strip_prefix("https://github.com/") {
        rest
    } else {
        url.strip_prefix("ssh://git@github.com/")?
    };
    let rest = rest.trim_end_matches('/').trim_end_matches(".git");
    let mut parts = rest.split('/');
    let owner = parts.next()?;
    let name = parts.next()?;
    if owner.is_empty() || name.is_empty() || parts.next().is_some() {
        return None;
    }
    Some(format!("{owner}/{name}"))
}

fn entry_for_dir(dir: &Path) -> Option<RepoEntry> {
    let git = dir.join(".git");
    if !git.exists() {
        return None;
    }
    // Bij een worktree of submodule is .git een bestand; dan staat de config elders
    // en slaan we de map over: de hoofdcheckout wordt los gevonden.
    let config = fs::read_to_string(git.join("config")).ok()?;
    let repo_id = repo_id_from_url(&origin_url(&config)?)?;
    Some(RepoEntry {
        repo_id,
        path: dir.to_string_lossy().to_string(),
    })
}

fn expand_home(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    PathBuf::from(path)
}

/// Scant elke root twee niveaus diep naar git-repo's met een GitHub-origin.
/// Gevonden paden worden opgeslagen zonder handmatig gezette paden te overschrijven.
/// Draait buiten de main thread: een grote projectmap zou de UI laten bevriezen.
#[tauri::command]
pub async fn scan_projects(
    app: tauri::AppHandle,
    roots: Vec<String>,
) -> Result<Vec<RepoEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_projects_blocking(app, roots))
        .await
        .map_err(|e| format!("scannen mislukte: {e}"))?
}

fn scan_projects_blocking(
    app: tauri::AppHandle,
    roots: Vec<String>,
) -> Result<Vec<RepoEntry>, String> {
    let mut found: Vec<RepoEntry> = Vec::new();

    for root in &roots {
        let root = expand_home(root);
        let Ok(level1) = fs::read_dir(&root) else {
            continue;
        };
        for entry in level1.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Some(found_entry) = entry_for_dir(&path) {
                found.push(found_entry);
                continue;
            }
            let Ok(level2) = fs::read_dir(&path) else {
                continue;
            };
            for nested in level2.flatten() {
                let nested_path = nested.path();
                if nested_path.is_dir() {
                    if let Some(found_entry) = entry_for_dir(&nested_path) {
                        found.push(found_entry);
                    }
                }
            }
        }
    }

    let mut store = read_store(&app)?;
    for entry in &found {
        store
            .entry(entry.repo_id.clone())
            .or_insert_with(|| entry.path.clone());
    }
    write_store(&app, &store)?;

    Ok(found)
}

#[tauri::command]
pub fn get_repo_paths(app: tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    read_store(&app)
}

#[tauri::command]
pub fn set_repo_path(app: tauri::AppHandle, repo_id: String, path: String) -> Result<(), String> {
    let expanded = expand_home(&path);
    if !expanded.join(".git").exists() {
        return Err(format!(
            "{} is geen git-repo (geen .git gevonden)",
            expanded.to_string_lossy()
        ));
    }
    let mut store = read_store(&app)?;
    store.insert(repo_id, expanded.to_string_lossy().to_string());
    write_store(&app, &store)
}

#[tauri::command]
pub fn remove_repo_path(app: tauri::AppHandle, repo_id: String) -> Result<(), String> {
    let mut store = read_store(&app)?;
    store.remove(&repo_id);
    write_store(&app, &store)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_origin_url_from_config() {
        let config = "[core]\n\trepositoryformatversion = 0\n[remote \"upstream\"]\n\turl = git@github.com:other/repo.git\n[remote \"origin\"]\n\turl = git@github.com:linku/webshop.git\n\tfetch = +refs/heads/*\n";
        assert_eq!(
            origin_url(config).as_deref(),
            Some("git@github.com:linku/webshop.git")
        );
    }

    #[test]
    fn returns_none_without_origin() {
        let config = "[remote \"upstream\"]\n\turl = git@github.com:other/repo.git\n";
        assert_eq!(origin_url(config), None);
    }

    #[test]
    fn maps_ssh_and_https_urls_to_repo_id() {
        assert_eq!(
            repo_id_from_url("git@github.com:linku/webshop.git").as_deref(),
            Some("linku/webshop")
        );
        assert_eq!(
            repo_id_from_url("https://github.com/linku/webshop").as_deref(),
            Some("linku/webshop")
        );
        assert_eq!(
            repo_id_from_url("https://github.com/linku/webshop.git").as_deref(),
            Some("linku/webshop")
        );
        assert_eq!(repo_id_from_url("https://gitlab.com/linku/webshop"), None);
    }

    #[test]
    fn write_then_read_round_trips_and_leaves_no_tmp_file_behind() {
        let dir = std::env::temp_dir().join(format!("pr-cockpit-test-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("tempdir");
        let path = dir.join("repo-paths.json");
        let mut store = HashMap::new();
        store.insert("linku/webshop".to_string(), "/tmp/webshop".to_string());
        write_store_at(&path, &store).expect("write");
        assert!(!path.with_file_name("repo-paths.json.tmp").exists());
        let read_back = read_store_at(&path).expect("read");
        assert_eq!(read_back, store);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn corrupt_store_is_quarantined_and_read_falls_back_to_empty() {
        let dir = std::env::temp_dir().join(format!(
            "pr-cockpit-test-corrupt-{}-{}",
            std::process::id(),
            line!()
        ));
        fs::create_dir_all(&dir).expect("tempdir");
        let path = dir.join("repo-paths.json");
        fs::write(&path, "dit is geen json").expect("write corrupt file");
        let store = read_store_at(&path).expect("read falls back");
        assert!(store.is_empty());
        assert!(!path.exists(), "corrupt bestand moet weg zijn geschoven");
        let quarantined: Vec<_> = fs::read_dir(&dir)
            .expect("read dir")
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".corrupt-"))
            .collect();
        assert_eq!(quarantined.len(), 1);
        fs::remove_dir_all(&dir).ok();
    }
}

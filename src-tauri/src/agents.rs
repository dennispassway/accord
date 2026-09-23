use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Extra zoekpaden: een GUI-app erft de PATH van launchd, niet die van je shell.
const EXTRA_BIN_DIRS: [&str; 3] = ["/opt/homebrew/bin", "/usr/local/bin", ".local/bin"];

/// Beide modelcommando's zijn lokaal en klaar binnen een halve seconde; dit is
/// een noodrem, geen wachttijd.
const MODEL_TIMEOUT: Duration = Duration::from_secs(5);

/// Git zonder noodrem wacht bij verlopen credentials eeuwig op een fetch; deze
/// timeout geldt voor elke git-aanroep in het runpad.
const GIT_TIMEOUT: Duration = Duration::from_secs(60);

/// Ruimte voor de agent om na TERM zelf af te ronden voordat KILL volgt.
const KILL_GRACE: Duration = Duration::from_secs(5);

/// Bij app-exit wachten we korter: het venster is toch al weg.
const EXIT_GRACE: Duration = Duration::from_secs(1);

/// Logregels gaan gebundeld naar de webview: één IPC-event per ~100 ms of per
/// 50 regels scheelt bij een spraakzame agent honderden re-renders.
const LOG_FLUSH: Duration = Duration::from_millis(100);
const LOG_BATCH: usize = 50;

/// Eén regel kan in theorie een heel bestand zijn; hard afkappen houdt zowel het
/// geheugen als de IPC-payload begrensd. Ruim genoeg voor claude's stream-json:
/// één JSONL-regel draagt daar een compleet event, inclusief review-teksten.
const MAX_LINE_BYTES: usize = 64 * 1024;

/// Markeerbestand in een worktree die we bewust laten staan (niet-gepushte
/// commits): het opruimen van zwerfresten slaat zo'n worktree over.
const KEEP_MARKER: &str = ".pr-cockpit-keep";

/// Het go/no-go-signaal van de agent voor de push: bestaat dit bestand na een
/// geslaagde run, dan pusht de app zijn commits naar de PR-head. Bewust NAAST de
/// worktree en niet erin, want de agents doen in de praktijk `git add -A` en
/// zouden een marker binnen de worktree meecommitten.
fn push_marker(run_id: &str) -> PathBuf {
    std::env::temp_dir()
        .join("pr-cockpit")
        .join(format!("{run_id}.push"))
}

/// Zelfde cap als de frontend hanteerde vóór Rust bron van waarheid werd; één
/// plek voor het getal, hergebruikt door `emit_log`.
const MAX_LOG_LINES: usize = 500;

/// Boven deze grootte geeft `read_run_log` alleen de staart terug: een agent
/// die uren doorlogt mag de webview niet met megabytes tekst laten vastlopen.
const MAX_LOG_FILE_BYTES: usize = 2 * 1024 * 1024;

/// Logbestanden ouder dan dit blijven achter een gecrashte of hard afgesloten
/// sessie; `cleanup_old_logs` ruimt ze op zodra een volgende run start.
const LOG_MAX_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);

/// Eén bestand per run, buiten de worktree (die wordt opgeruimd): de volledige
/// log overleeft zo de 500-regel-cap die alleen voor de live stream naar de
/// webview geldt.
fn log_file_path(run_id: &str) -> PathBuf {
    std::env::temp_dir()
        .join("pr-cockpit")
        .join("logs")
        .join(format!("{run_id}.log"))
}

/// `/tmp` is op Linux een gedeelde map: een andere gebruiker kan `pr-cockpit/logs`
/// al hebben klaargezet als symlink, of als map van een ander account. Bestaat
/// de map nog niet, dan zetten we hem neer met mode 0700 zodat alleen wij erin
/// kunnen; bestaat hij al maar is hij een symlink of van een ander uid, dan
/// weigeren we, want anders schrijven agent-output (mogelijk secrets) ergens
/// leesbaar voor andere gebruikers.
#[cfg(unix)]
fn ensure_private_logs_dir(dir: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::{DirBuilderExt, MetadataExt};

    // Geen libc-dependency nodig: getuid() is altijd gelinkt op unix, dus dit
    // volstaat zonder een nieuwe crate toe te voegen.
    extern "C" {
        fn getuid() -> u32;
    }

    match std::fs::symlink_metadata(dir) {
        Ok(meta) => {
            if meta.file_type().is_symlink() {
                return Err(std::io::Error::other("logmap is een symlink"));
            }
            let current_uid = unsafe { getuid() };
            if meta.uid() != current_uid {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "logmap behoort niet toe aan de huidige gebruiker",
                ));
            }
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(dir),
        Err(e) => Err(e),
    }
}

#[cfg(not(unix))]
fn ensure_private_logs_dir(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)
}

/// Best-effort: een IO-fout op de logfile mag de run zelf nooit laten falen,
/// dus alle fouten hier verdwijnen stil.
fn append_log_file(run_id: &str, lines: &[String]) {
    let path = log_file_path(run_id);
    let Some(dir) = path.parent() else { return };
    if ensure_private_logs_dir(dir).is_err() {
        return;
    }
    use std::io::Write;
    #[cfg_attr(not(unix), allow(unused_mut))]
    let mut open_options = std::fs::OpenOptions::new();
    open_options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        open_options.mode(0o600);
    }
    if let Ok(mut file) = open_options.open(&path) {
        for line in lines {
            let _ = writeln!(file, "{line}");
        }
    }
}

/// Ruimt logbestanden op die ouder zijn dan `LOG_MAX_AGE`. Ontbreekt de map of
/// faalt een losse `remove_file`, dan gaat dat stil door: dit is opruimwerk,
/// geen onderdeel van een run.
fn cleanup_old_logs() {
    let dir = std::env::temp_dir().join("pr-cockpit").join("logs");
    // Zelfde check als bij schrijven: is de map een symlink van een ander
    // account, dan zou read_dir hem volgen en verwijderen we daar bestanden.
    if ensure_private_logs_dir(&dir).is_err() {
        return;
    }
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    let Some(cutoff) = std::time::SystemTime::now().checked_sub(LOG_MAX_AGE) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        if modified < cutoff {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Puur om zonder bestanden te testen: geeft de volledige tekst terug als hij
/// binnen `max_bytes` past, anders de staart, met een newline-grens zodat er
/// nooit midden in een regel wordt afgekapt.
fn truncate_log(data: &[u8], max_bytes: usize) -> String {
    if data.len() <= max_bytes {
        return String::from_utf8_lossy(data).into_owned();
    }
    let cut = data.len() - max_bytes;
    let cut = data[cut..]
        .iter()
        .position(|&b| b == b'\n')
        .map(|i| cut + i + 1)
        .unwrap_or(cut);
    format!(
        "[log afgekapt tot de laatste {} MB]\n{}",
        max_bytes / (1024 * 1024),
        String::from_utf8_lossy(&data[cut..])
    )
}

fn read_run_log_blocking(run_id: &str) -> Result<String, String> {
    checked_run_id(run_id)?;
    let path = log_file_path(run_id);
    let data = std::fs::read(&path).map_err(|e| format!("kon het logbestand niet lezen: {e}"))?;
    Ok(truncate_log(&data, MAX_LOG_FILE_BYTES))
}

/// Volledige log van één run, van schijf: de 500-regel-cap in het geheugen is
/// alleen voor de live stream, dit commando levert wat er echt gebeurd is.
#[tauri::command]
pub async fn read_run_log(run_id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_run_log_blocking(&run_id))
        .await
        .map_err(|e| format!("kon het logbestand niet lezen: {e}"))?
}

/// Onbegrensd afgeronde runs bewaren laat de HashMap groeien; lopende runs
/// tellen nooit mee voor deze cap.
const MAX_FINISHED_RUNS: usize = 20;

/// Monotone teller voor `RunInfo::started_at`: alleen de volgorde tussen runs
/// telt, dus geen afhankelijkheid van de systeemklok.
static NEXT_STARTED_AT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn next_started_at() -> u64 {
    NEXT_STARTED_AT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
}

#[derive(Default)]
pub struct AgentRuns(Mutex<HashMap<String, RunInfo>>);

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RunStatus {
    Running,
    Done,
    Failed,
    Cancelled,
}

pub struct RunInfo {
    /// `None` zolang de run nog in de voorbereidingsfase zit (fetch, worktree);
    /// een cancel zet dan alleen de vlag.
    pid: Option<u32>,
    cancelled: bool,
    /// Claimt de cleanup onder de mutex: `stop_all_runs` (bij app-exit) en de
    /// wait-thread kunnen anders gelijktijdig dezelfde worktree opruimen. Wie
    /// hem als eerste op `true` zet, mag `cleanup_run` draaien.
    cleaned: bool,
    repo_path: PathBuf,
    worktree: PathBuf,
    repo_id: String,
    pr_number: u64,
    agent: String,
    mode: String,
    status: RunStatus,
    exit_code: Option<i32>,
    /// Monotone teller, niet de kloktijd: alleen de volgorde tussen runs
    /// telt, en dat scheelt een tijd-dependency in de tests.
    started_at: u64,
    /// Gebufferde regels voor `list_runs`, zodat een (her)mount van de
    /// frontend een lopende of net afgeronde run weer kan tonen.
    log: Vec<String>,
    /// Hierna gevuld met het resultaat van de push/cleanup-stap; blijft op de
    /// startwaarden zolang de run nog loopt.
    pushed_commits: u32,
    unpushed_commits: u32,
    kept_worktree: Option<String>,
}

impl RunInfo {
    fn pr_key(&self) -> String {
        format!("{}#{}", self.repo_id, self.pr_number)
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RunSnapshot {
    run_id: String,
    pr_key: String,
    agent: String,
    mode: String,
    status: RunStatus,
    lines: Vec<String>,
    exit_code: Option<i32>,
    started_at: u64,
    pushed_commits: u32,
    unpushed_commits: u32,
    kept_worktree: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentClis {
    claude: bool,
    codex: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentModels {
    claude: Vec<String>,
    codex: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LogEvent {
    run_id: String,
    lines: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DoneEvent {
    run_id: String,
    exit_code: i32,
    /// Een commentsOnly-run die netjes stopte maar geen review achterliet. De
    /// exitcode is dan 0 en zegt dus niets; zonder dit veld zou de UI hem als
    /// geslaagd tonen.
    review_missing: bool,
    /// U4: commits die de push wel/niet haalden, plus het pad van de worktree
    /// als die bewaard bleef (zie `commit_outcome` en `cleanup_run`).
    pushed_commits: u32,
    unpushed_commits: u32,
    kept_worktree: Option<String>,
}

fn find_binary(name: &str) -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    let home = std::env::var_os("HOME").map(PathBuf::from);
    for dir in EXTRA_BIN_DIRS {
        let base = if dir.starts_with('/') {
            PathBuf::from(dir)
        } else {
            match &home {
                Some(home) => home.join(dir),
                None => continue,
            }
        };
        let candidate = base.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// De agent roept zelf gh, git en node aan. Een uit Finder gestarte app erft de
/// launchd-PATH, waarin die tools ontbreken, dus vullen we hem hier aan.
fn child_path() -> String {
    let mut dirs: Vec<String> = std::env::var("PATH")
        .unwrap_or_default()
        .split(':')
        .filter(|dir| !dir.is_empty())
        .map(str::to_string)
        .collect();
    let home = std::env::var("HOME").unwrap_or_default();
    for dir in EXTRA_BIN_DIRS {
        let full = if dir.starts_with('/') {
            dir.to_string()
        } else if home.is_empty() {
            continue;
        } else {
            format!("{home}/{dir}")
        };
        if !dirs.contains(&full) {
            dirs.push(full);
        }
    }
    dirs.join(":")
}

/// Async: `find_binary` loopt de hele PATH af, wat op een trage of netwerk-
/// gekoppelde schijf kan hangen. Draait daarom buiten de main thread.
#[tauri::command]
pub async fn check_agent_clis() -> AgentClis {
    tauri::async_runtime::spawn_blocking(|| AgentClis {
        claude: find_binary("claude").is_some(),
        codex: find_binary("codex").is_some(),
    })
    .await
    .unwrap_or(AgentClis {
        claude: false,
        codex: false,
    })
}

/// De claude-CLI kent geen "list models"-commando; de enige machineleesbare bron
/// is de `--model`-regel uit de help, die een paar aliassen als voorbeeld noemt.
/// Alleen kale woorden tellen mee: dat filtert het voorbeeld van een volledige
/// modelnaam ('claude-fable-5') weg, en ook de losse apostrof in "model's" die
/// het quote-paren anders zou verstoren.
fn parse_claude_models(help: &str) -> Vec<String> {
    let mut lines = help
        .lines()
        .skip_while(|line| !line.trim_start().starts_with("--model "));
    let mut block = match lines.next() {
        Some(first) => first.to_string(),
        None => return Vec::new(),
    };
    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') || !line.starts_with(' ') {
            break;
        }
        block.push(' ');
        block.push_str(trimmed);
    }
    let mut models: Vec<String> = Vec::new();
    for quoted in block.split('\'').skip(1).step_by(2) {
        let bare = !quoted.is_empty()
            && quoted
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
        if bare && !models.iter().any(|m| m == quoted) {
            models.push(quoted.to_string());
        }
    }
    models
}

/// `codex debug models` rendert de volledige catalogus als JSON. Modellen met
/// visibility "hide" horen niet in een keuzelijst; `priority` is de volgorde
/// die de CLI zelf aanhoudt.
fn parse_codex_models(json: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let Some(models) = value.get("models").and_then(|m| m.as_array()) else {
        return Vec::new();
    };
    let mut listed: Vec<(u64, String)> = models
        .iter()
        .filter(|model| model.get("visibility").and_then(|v| v.as_str()) == Some("list"))
        .filter_map(|model| {
            let slug = model.get("slug")?.as_str()?.to_string();
            let priority = model
                .get("priority")
                .and_then(|p| p.as_u64())
                .unwrap_or(u64::MAX);
            Some((priority, slug))
        })
        .collect();
    listed.sort_by_key(|(priority, _)| *priority);
    listed.into_iter().map(|(_, slug)| slug).collect()
}

/// Draait een kort lokaal commando en geeft stdout terug. `None` bij een fout,
/// een exitcode != 0 of een time-out; het kind krijgt dan TERM, zodat een
/// hangende CLI de instellingen niet blokkeert.
fn run_capture(mut command: Command, timeout: Duration) -> Option<String> {
    let child = command
        .env("PATH", child_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let pid = child.id();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });
    match rx.recv_timeout(timeout) {
        Ok(Ok(output)) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).into_owned())
        }
        Ok(_) => None,
        Err(_) => {
            let _ = Command::new("kill")
                .arg("-TERM")
                .arg(pid.to_string())
                .status();
            None
        }
    }
}

fn cli_output(binary: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new(find_binary(binary)?);
    command.args(args);
    run_capture(command, MODEL_TIMEOUT)
}

/// Vraagt beide CLI's om hun modellen. Ontbreekt een CLI of is de uitvoer
/// onbruikbaar, dan komt er een lege lijst terug en valt de UI terug op haar
/// eigen fallback.
#[tauri::command]
pub async fn agent_models() -> AgentModels {
    tauri::async_runtime::spawn_blocking(|| AgentModels {
        claude: cli_output("claude", &["--help"])
            .map(|help| parse_claude_models(&help))
            .unwrap_or_default(),
        codex: cli_output("codex", &["debug", "models"])
            .map(|json| parse_codex_models(&json))
            .unwrap_or_default(),
    })
    .await
    .unwrap_or_default()
}

/// Een run-id komt uit de webview en belandt in een pad dat we later opruimen:
/// alleen een vlakke token toestaan, zodat ".." nooit uit de tijdelijke map kan breken.
fn checked_run_id(run_id: &str) -> Result<&str, String> {
    let valid = !run_id.is_empty()
        && run_id.len() <= 64
        && run_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-');
    if valid {
        Ok(run_id)
    } else {
        Err("ongeldig run-id".to_string())
    }
}

fn run_ref_for(run_id: &str) -> String {
    format!("refs/pr-cockpit/{run_id}")
}

/// Alle git in het runpad loopt hierlangs: `GIT_TERMINAL_PROMPT=0` zodat git
/// nooit om een wachtwoord vraagt (een GUI-app heeft geen terminal om op te
/// antwoorden) en een harde timeout zodat een hangende fetch de run niet
/// eeuwig op "reviewt" laat staan.
pub(crate) fn run_git(repo_path: &Path, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0");
    run_tool(command, &format!("git {}", args.join(" ")))
}

/// `gh` in de repo van de run, dus zonder owner en naam mee te geven: die leidt
/// gh zelf uit de remote af. De agent gebruikt dezelfde CLI, dus de login staat
/// er al. `child_path` moet erbij omdat een uit Finder gestarte app de
/// launchd-PATH erft, waar gh niet in staat.
fn run_gh(repo_path: &Path, args: &[&str], env: &[(&str, &str)]) -> Result<String, String> {
    let mut command = Command::new("gh");
    command
        .current_dir(repo_path)
        .args(args)
        .env("PATH", child_path());
    for (key, value) in env {
        command.env(key, value);
    }
    run_tool(command, &format!("gh {}", args.join(" ")))
}

/// Eén plek voor de harde timeout en het afbreken daarna, zodat git en gh zich
/// hetzelfde gedragen als er iets blijft hangen.
fn run_tool(mut command: Command, label: &str) -> Result<String, String> {
    let child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{label} kon niet starten: {e}"))?;
    let pid = child.id();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });
    match rx.recv_timeout(GIT_TIMEOUT) {
        Ok(Ok(output)) if output.status.success() => {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        Ok(Ok(output)) => Err(format!(
            "{label} faalde: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )),
        Ok(Err(e)) => Err(format!("{label} faalde: {e}")),
        Err(_) => {
            let _ = Command::new("kill")
                .arg("-TERM")
                .arg(pid.to_string())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            Err(format!(
                "{label} duurde langer dan {} seconden en is gestopt; controleer je netwerkverbinding of je git-credentials",
                GIT_TIMEOUT.as_secs()
            ))
        }
    }
}

fn with_runs<T>(app: &AppHandle, f: impl FnOnce(&mut HashMap<String, RunInfo>) -> T) -> Option<T> {
    let state = app.try_state::<AgentRuns>()?;
    let mut runs = state.0.lock().ok()?;
    Some(f(&mut runs))
}

/// Voegt regels toe en kapt de kop af zodra de cap overschreden wordt; los
/// van tauri om zonder AppHandle te kunnen testen.
fn push_capped(log: &mut Vec<String>, lines: &[String], cap: usize) {
    log.extend_from_slice(lines);
    let overflow = log.len().saturating_sub(cap);
    if overflow > 0 {
        log.drain(0..overflow);
    }
}

fn emit_log(app: &AppHandle, run_id: &str, lines: Vec<String>) {
    if lines.is_empty() {
        return;
    }
    append_log_file(run_id, &lines);
    with_runs(app, |runs| {
        if let Some(run) = runs.get_mut(run_id) {
            push_capped(&mut run.log, &lines, MAX_LOG_LINES);
        }
    });
    let _ = app.emit(
        "agent-log",
        LogEvent {
            run_id: run_id.to_string(),
            lines,
        },
    );
}

/// Snoeit afgeronde runs boven `MAX_FINISHED_RUNS`, oudste eerst; lopende
/// runs worden nooit gesnoeid.
fn prune_finished_runs(runs: &mut HashMap<String, RunInfo>) {
    let mut finished: Vec<(String, u64)> = runs
        .iter()
        .filter(|(_, run)| run.status != RunStatus::Running)
        .map(|(run_id, run)| (run_id.clone(), run.started_at))
        .collect();
    if finished.len() <= MAX_FINISHED_RUNS {
        return;
    }
    finished.sort_by_key(|(_, started_at)| *started_at);
    let overflow = finished.len() - MAX_FINISHED_RUNS;
    for (run_id, _) in finished.into_iter().take(overflow) {
        runs.remove(&run_id);
    }
}

/// Alle bekende runs (lopend of net afgerond) met hun gebufferde log; de bron
/// van waarheid voor een frontend die net gemount is en de events van vóór
/// die tijd heeft gemist. Gesorteerd oud naar nieuw, zodat een reload niet
/// zomaar een willekeurige oude run als "laatste" kan kiezen. Async + de
/// logbuffers klonen onder de mutex draait daarom buiten de main thread.
#[tauri::command]
pub async fn list_runs(app: AppHandle) -> Vec<RunSnapshot> {
    tauri::async_runtime::spawn_blocking(move || {
        with_runs(&app, |runs| {
            prune_finished_runs(runs);
            let mut snapshots: Vec<RunSnapshot> = runs
                .iter()
                .map(|(run_id, run)| RunSnapshot {
                    run_id: run_id.clone(),
                    pr_key: run.pr_key(),
                    agent: run.agent.clone(),
                    mode: run.mode.clone(),
                    status: run.status,
                    lines: run.log.clone(),
                    exit_code: run.exit_code,
                    started_at: run.started_at,
                    pushed_commits: run.pushed_commits,
                    unpushed_commits: run.unpushed_commits,
                    kept_worktree: run.kept_worktree.clone(),
                })
                .collect();
            snapshots.sort_by_key(|snapshot| snapshot.started_at);
            snapshots
        })
        .unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

/// Is de run weg uit de state, dan is er niemand meer die hem verwacht: dat
/// telt als afgebroken.
fn is_cancelled(app: &AppHandle, run_id: &str) -> bool {
    with_runs(app, |runs| runs.get(run_id).is_none_or(|run| run.cancelled)).unwrap_or(true)
}

fn signal_group(pgid: u32, signal: &str) -> bool {
    Command::new("kill")
        .arg(format!("-{signal}"))
        .arg(format!("-{pgid}"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// De agent start zelf git, gh en node; een TERM op alleen de directe child
/// laat die kleinkinderen doorlopen (en doorpushen). Daarom draait de agent in
/// een eigen procesgroep en gaat het signaal naar de hele groep.
fn term_group(pgid: u32) {
    signal_group(pgid, "TERM");
}

fn kill_group_if_alive(pgid: u32) {
    if signal_group(pgid, "0") {
        signal_group(pgid, "KILL");
    }
}

/// De onzichtbare regel waarmee Accord zijn eigen agent-reviews terugvindt op
/// GitHub. De prompt die hem laat plaatsen en de controle die hem terugzoekt
/// lezen allebei deze functie, zodat ze niet uit elkaar kunnen lopen: een
/// hernoemde mode of agent zou anders stil een review opleveren die Accord niet
/// meer herkent.
fn review_marker(agent: &str, mode: &str) -> String {
    format!("<!-- accord:{agent}:{mode} -->")
}

fn prompt_for_mode(
    agent: &str,
    mode: &str,
    pr_number: u64,
    head_ref: &str,
    base_ref: &str,
    push_marker: &Path,
) -> Result<String, String> {
    let marker = review_marker(agent, mode);
    // De agent pusht niet zelf: hij geeft groen licht en de app pusht met een
    // refspec die hij zelf bouwt. Zo kan een agent de bestemming niet meer
    // beïnvloeden en is force-pushen onmogelijk in plaats van afgesproken.
    let hand_off = format!(
        "Push zelf niets en gebruik geen git push. Lees vóór je iets draait gh pr checks {pr_number}: staan alle required checks daar groen op de head-sha van deze PR, draai dan alleen de tests die jouw eigen wijziging raakt, sla mutation- en coveragegates over (infection, mutation testing, coverage-drempels) en neem die groene checks als bewijs over in je PR-comment in plaats van de suite over te doen. Is ook maar één required check rood of pending, of zijn er geen checks, dan draai je zelf de volledige tests en de linter. Is alles groen en mogen je commits naar de PR, maak dan als laatste stap het bestand {} aan (leeg is goed); Accord pusht ze daarna naar {head_ref}. Faalt er iets, ga dan niet op de uitkomst af maar bepaal of jouw wijziging de oorzaak is: draai datzelfde falen opnieuw zonder jouw commits (git stash, of de basisbranch {base_ref} uitchecken in een los pad). Faalt het daar aantoonbaar ook en staat het los van wat je aanraakte, maak het bestand dan wel aan en benoem dat bestaande falen in je PR-comment. Veroorzaak je het falen zelf, kom je er niet uit, of kun je niet bewijzen dat het al bestond, maak dat bestand dan NIET aan: je commits blijven dan lokaal staan en jij legt in één PR-comment uit waarom.",
        push_marker.to_string_lossy()
    );
    // Gedeelde kern van beide lessen-modes. De anti-bloat-regels (cap op twee
    // lessen, CLAUDE.md als laatste optie, 2-3 zinnen, budget met one-in-one-out)
    // zijn er omdat ongebreidelde lessen-runs CLAUDE.md anders per PR met
    // alinea's laten dichtgroeien; alleen de bestemming van de commits verschilt
    // per mode.
    // Elke gelezen regel zit in elke volgende turn opnieuw in de context: in de
    // meting van 2026-09-17 groeide die van 41k naar 147k tokens, grotendeels
    // door hele bestanden die om drie gewijzigde regels opengingen.
    let diff_focus = "Open een heel bestand alleen als de diff zonder die context niet te beoordelen is; lees anders gerichte regelbereiken rond de gewijzigde regels.";
    let learnings_core = format!(
        "Destilleer de lessen uit pull request #{pr_number} in deze repo, zodat een volgende PR in één keer goed gaat. Lees eerst alle review-comments en threads (gh pr view {pr_number} --comments en gh api repos/{{owner}}/{{repo}}/pulls/{pr_number}/comments) en de fix-commits die na de eerste review kwamen met hun diffs, en bepaal per punt wat er in de oorspronkelijke code misging. Bewaar alleen generaliseerbare lessen: een regel die een toekomstige fout in deze repo voorkomt en die nog niet uit de code, de linter of de bestaande instructies volgt. Sla PR-specifieke feiten, eenmalige vergissingen en pure smaak over. Maximaal twee lessen per PR: vind je er meer, houd dan de twee met de grootste kans op herhaling en laat de rest weg. Verifieer elke les tegen de huidige code voordat je hem opschrijft. Kies per les de juiste plek en behandel CLAUDE.md als laatste optie: een meerstaps-werkwijze wordt een skill in .claude/skills/<naam>/SKILL.md met name en description in de frontmatter, een instructie die alleen bij bepaalde bestanden of paden geldt een regelbestand onder .claude/rules/, en alleen een korte tijdloze regel die bij elke taak in deze repo nodig is komt in CLAUDE.md (maak het bestand aan als het ontbreekt). Een les in CLAUDE.md is maximaal 2-3 zinnen zonder PR-nummers of casuïstiek; het verhaal erachter hoort in de commit-tekst. Check eerst of een bestaande regel of skill hetzelfde probleem al dekt en werk die dan bij in plaats van een duplicaat toe te voegen. Is CLAUDE.md na jouw wijziging groter dan 10 kilobyte (meet met wc -c CLAUDE.md), dan geldt one-in-one-out: er mag alleen iets bij als je tegelijk een bestaande regel schrapt of verplaatst naar een skill of regelbestand. Geen les gevonden: stop dan zonder iets te wijzigen."
    );
    let prompt = match mode {
        "withFixes" => format!(
            "Review pull request #{pr_number} in deze repo. Lees eerst de volledige diff (gh pr diff {pr_number}). {diff_focus} Lees ook de al geplaatste review-comments en open threads (gh api repos/{{owner}}/{{repo}}/pulls/{pr_number}/comments en gh pr view {pr_number} --comments), en vorm daarna pas je oordeel. Richt je op problemen die gedrag raken (bugs, security, dataverlies); stijl alleen als het echt schaadt. Fix wat je vindt met kleine, losse commits, en verwerk daarbij ook de terechte punten uit de open threads. Draai daarna de tests en linter van het project. {hand_off} Reageer per verwerkte thread in die thread zelf (gh api met in_reply_to) wat je hebt aangepast en resolve hem daarna via de GraphQL-mutatie resolveReviewThread (thread-ids haal je met gh api graphql uit reviewThreads op de PR); ben je het met een punt gemotiveerd oneens, leg dat uit in een reply en laat die thread open. Sluit af met één samenvattende review via gh pr review {pr_number} --comment; laat de review-body BEGINNEN met exact de regel `{marker}` (een onzichtbare marker, niet zichtbaar op GitHub, waarmee Accord deze review herkent als agent-review), gevolgd door per bevinding bestand:regel, wat er mis was en wat je hebt aangepast."
        ),
        "commentsOnly" => format!(
            "Review pull request #{pr_number} in deze repo. Lees eerst de volledige diff (gh pr diff {pr_number}). {diff_focus} Vorm daarna pas je bevindingen. Controleer elke bevinding tegen de code en meld alleen punten waar je zeker van bent, met bestand:regel erbij. Label elke bevinding: [belangrijk] voor bugs, security of dataverlies, [nit] voor stijl; maximaal 5 nits, en sla gegenereerde bestanden en lockfiles over. Plaats alles als één review met inline comments op de betreffende regels: post naar gh api repos/{{owner}}/{{repo}}/pulls/{pr_number}/reviews --input - een JSON-payload met event COMMENT, en als body: de regel `{marker}` (een onzichtbare marker, niet zichtbaar op GitHub, waarmee Accord deze review herkent als agent-review) gevolgd door een korte samenvatting, en per bevinding een entry in comments met path, line en side RIGHT (regelnummer in het nieuwe bestand, niet de diff-positie). Per inline comment: het probleem, waarom het uitmaakt en een concreet fix-voorstel. Geen blokkerende punten: zeg dat dan expliciet in één zin in de review-body. Wijzig geen bestanden en push geen code."
        ),
        "fixComments" => format!(
            "Los de openstaande review-comments op pull request #{pr_number} in deze repo op. Lees eerst alle open threads via gh api repos/{{owner}}/{{repo}}/pulls/{pr_number}/comments en gh pr view {pr_number} --comments, en bepaal per punt of het terecht is. Fix de terechte punten met kleine, losse commits; los een falend punt op in de code, nooit door een test te verzwakken, te skippen of te verwijderen. Draai daarna de tests en linter. {hand_off} Reageer daarna per verwerkte comment in zijn eigen thread (gh api met in_reply_to) wat je hebt aangepast en resolve die thread via de GraphQL-mutatie resolveReviewThread (thread-ids haal je met gh api graphql uit reviewThreads op de PR); ben je het ergens gemotiveerd oneens, leg dat uit in een reply zonder code te wijzigen en laat die thread open."
        ),
        "fixChecks" => format!(
            "De CI-checks op pull request #{pr_number} in deze repo falen. Bekijk de falende checks met gh pr checks {pr_number}, haal daar het run-id uit en lees de logs met gh run view <run-id> --log-failed (draai gh run view nooit zonder run-id, dat wordt interactief). Reproduceer de fout daarna lokaal voor je iets wijzigt. Is de oorzaak niet in code op te lossen (billing of spending limit, infra-storing, ontbrekende secrets of permissions, een flaky run), stop dan zonder iets te wijzigen en plaats één PR-comment via de gh CLI die de oorzaak uitlegt. Is de oorzaak wel fixbaar (falende tests, lint, types, build), fix dan de onderliggende oorzaak en niet het symptoom: verzwak, skip of verwijder nooit een test om groen te worden. Commit klein en los en draai de geraakte checks lokaal opnieuw. {hand_off}"
        ),
        "fixConflicts" => format!(
            "Pull request #{pr_number} in deze repo heeft merge-conflicten met de basisbranch {base_ref}. Haal de basisbranch op met git fetch origin {base_ref} en merge origin/{base_ref} in HEAD. Los de conflicten inhoudelijk op: lees van beide kanten wat de bedoeling was en behoud die, kies nooit blind één kant. Let ook op botsingen buiten de conflict-markers, zoals een hernoemde functie die de andere kant nog onder de oude naam aanroept. Draai na de merge de build en tests en commit pas bij groen. {hand_off}"
        ),
        "distillLearnings" => format!(
            "{learnings_core} Wel lessen: maak een verse branch vanaf origin/{base_ref} met een naam die met claude/ begint (andere namen worden geweigerd), commit per les apart, push met git push origin HEAD:claude/<naam> en open met gh pr create een PR naar {base_ref} die per les uitlegt wat er in PR #{pr_number} misging en welke regel dat voortaan voorkomt. Push nooit geforceerd en nooit direct naar {base_ref} of {head_ref}."
        ),
        "distillLearningsInline" => format!(
            "{learnings_core} Wel lessen: commit ze per les apart op de huidige branch (de PR-branch van #{pr_number}) en raak daarbij alleen documentatie- en instructiebestanden aan, geen productiecode. {hand_off} Plaats tot slot via gh pr comment {pr_number} één comment die per les kort benoemt wat is vastgelegd en waar."
        ),
        other => return Err(format!("onbekende mode: {other}")),
    };
    Ok(format!("{AUTONOMOUS_PREFIX}{prompt}"))
}

/// Voor élke mode, want er is geen gebruiker aan de andere kant: zonder deze
/// regel volgt de agent de instructies uit de globale CLAUDE.md (plan voorleggen
/// en op een 'go' wachten) en stopt hij met een vraag die niemand ziet.
const AUTONOMOUS_PREFIX: &str = "Dit is een autonome run zonder gebruiker aan de andere kant: niemand leest mee en niemand kan antwoorden. Vraag niets, leg geen plan ter goedkeuring voor, wacht nergens op een 'go' en eindig niet met een vraag; neem elke keuze zelf en voer hem uit. Kom je er niet uit of moet je stoppen, rond dan af met een PR-comment die uitlegt waarom. ";

/// Nederlandse effort-waarden uit de settings-UI naar de Engelse waarden die de
/// CLI's verwachten. Eén plek voor de mapping, dicht bij waar hij gebruikt wordt.
fn cli_effort(effort: &str) -> &'static str {
    match effort {
        "laag" => "low",
        "hoog" => "high",
        _ => "medium",
    }
}

fn agent_command(
    agent: &str,
    mode: &str,
    prompt: &str,
    binary: &Path,
    model: &str,
    effort: &str,
    git_common_dir: &Path,
) -> Result<Command, String> {
    let with_fixes = mode != "commentsOnly";
    let mut command = Command::new(binary);
    match agent {
        // Bij commentsOnly staat de toolset expliciet vast in plaats van op een
        // permission-mode te vertrouwen: de agent mag lezen en comments plaatsen,
        // maar niet mergen, sluiten, de PR bewerken of via gh api muteren.
        "claude" => {
            command.arg("--model").arg(model);
            command.arg("--effort").arg(cli_effort(effort));
            command.arg("-p").arg(prompt);
            // Zonder stream-json print `claude -p` pas na afloop; met deze
            // flags komt er per event één JSONL-regel die claude_stream.rs
            // naar leesbare logregels vertaalt. `--verbose` is verplicht bij
            // stream-json in print-mode.
            command.arg("--output-format").arg("stream-json");
            command.arg("--verbose");
            if with_fixes {
                // bypassPermissions en niet acceptEdits: die laatste accepteert
                // alleen file-edits, terwijl elke Bash-call (git, gh, de tests van
                // het project) dan om goedkeuring vraagt. In print-mode is er
                // niemand om te vragen, dus zo'n call wordt geweigerd en de run
                // strandt halverwege. De blast radius blijft de weggegooide
                // worktree; wat de agent naar buiten mag doen staat in de prompt.
                command.arg("--permission-mode").arg("bypassPermissions");
            } else {
                // "gh api repos/" is nodig voor inline review-comments (gh pr review
                // kan geen regel-comments); bewust geaccepteerd dat dit prefix-patroon
                // breder is dan comments alleen, mergen/sluiten via gh pr blijft dicht.
                // rg/grep/find staan erbij omdat een hook Grep/Glob kan omleiden naar
                // een shell-zoekopdracht; zonder die patronen liep elke zoekactie op
                // een permission-fout stuk. De rtk-varianten dekken diezelfde omleiding.
                command.arg("--allowedTools").arg(
                    "Read,Grep,Glob,Bash(gh pr view:*),Bash(gh pr diff:*),Bash(gh pr comment:*),Bash(gh pr review:*),Bash(gh api repos/:*),Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(git rev-parse:*),Bash(rg:*),Bash(grep:*),Bash(find:*),Bash(rtk rg:*),Bash(rtk grep:*),Bash(rtk find:*)",
                );
            }
        }
        // Codex kent geen read-only modus MET netwerk, en zonder netwerk kan het
        // helemaal geen comments plaatsen. Bij commentsOnly is de "niet pushen"-
        // garantie daarom prompt-niveau; schrijven in de worktree is onschadelijk
        // omdat die na de run wordt weggegooid.
        "codex" => {
            command.arg("exec");
            command
                .arg("--sandbox")
                .arg("workspace-write")
                .arg("-m")
                .arg(model)
                .arg("-c")
                .arg("sandbox_workspace_write.network_access=true")
                // Codex leest ~/.codex/config.toml, en de ChatGPT-app schrijft
                // daar een MCP-server in. Laadt die mee, dan schakelt codex naar
                // een uitvoerlaag die vanuit een headless run niet opstart: elke
                // shell-aanroep strandt op "timed out negotiating with the
                // code-mode host" en de agent wijkt uit naar die MCP-runtime, die
                // in een eigen sandbox zonder netwerk draait. Hij leest dan geen
                // diff en plaatst geen comments, maar eindigt wel met exit 0.
                // Accord heeft hier geen enkele MCP-server nodig, dus die hele
                // laag gaat uit.
                .arg("-c")
                .arg("mcp_servers={}")
                .arg("-c")
                .arg(format!("model_reasoning_effort=\"{}\"", cli_effort(effort)));
            if with_fixes {
                // De worktree in /tmp is schrijfbaar, maar zijn index, refs en
                // objects leven in de .git van de hoofdrepo. Zonder deze root
                // faalt elke `git commit` in de sandbox op index.lock en wijkt
                // codex uit naar een eigen GIT_DIR met commits die nergens
                // bestaan.
                command.arg("-c").arg(format!(
                    "sandbox_workspace_write.writable_roots=[\"{}\"]",
                    git_common_dir
                        .to_string_lossy()
                        .replace('\\', "\\\\")
                        .replace('"', "\\\"")
                ));
            }
            command.arg(prompt);
        }
        other => return Err(format!("onbekende agent: {other}")),
    }
    Ok(command)
}

fn count_commits(log: &str) -> usize {
    log.lines().filter(|line| !line.trim().is_empty()).count()
}

/// Commits die alleen in de worktree bestaan. De ref wordt eerst opnieuw
/// opgehaald (`refresh_pr`), want een push van de agent verandert de PR-head op
/// de remote, niet onze eigen ref: zonder die fetch zou elke gepushte commit
/// hier onterecht als "niet gepusht" tellen. Bij app-exit slaan we de fetch
/// over en is elke lokale commit reden om de worktree te bewaren.
///
/// Deze telling mag nooit beslissen over een push die de app zelf net deed:
/// GitHub werkt `refs/pull/<n>/head` asynchroon bij, dus vlak na een push wijst
/// die ref meestal nog naar de oude head. Een stale ref telt alleen te veel
/// (nooit te weinig), dus als tweede check blijft hij veilig, maar het bewijs
/// dat alles remote staat komt van de push zelf (zie `keep_reason`).
fn unpushed_commits(
    repo_path: &Path,
    worktree: &Path,
    run_ref: &str,
    refresh_pr: Option<u64>,
) -> Result<usize, String> {
    if let Some(pr_number) = refresh_pr {
        run_git(
            repo_path,
            &[
                "fetch",
                "origin",
                &format!("+refs/pull/{pr_number}/head:{run_ref}"),
            ],
        )?;
    }
    let log = run_git(worktree, &["log", "--oneline", &format!("{run_ref}..HEAD")])?;
    Ok(count_commits(&log))
}

fn log_cleanup_error(app: &AppHandle, run_id: &str, result: Result<String, String>) {
    if let Err(error) = result {
        emit_log(app, run_id, vec![format!("opruimen: {error}")]);
    }
}

fn remove_ref(app: &AppHandle, run_id: &str, repo_path: &Path) {
    log_cleanup_error(
        app,
        run_id,
        run_git(repo_path, &["update-ref", "-d", &run_ref_for(run_id)]),
    );
}

/// Los van tauri om zonder AppHandle te kunnen testen: `true` als déze
/// aanroeper de run mag opruimen (en `cleaned` meteen zet), `false` als hij
/// al geclaimd is of niet (meer) bestaat.
fn claim_cleanup_entry(run: Option<&mut RunInfo>) -> bool {
    match run {
        Some(run) if !run.cleaned => {
            run.cleaned = true;
            true
        }
        _ => false,
    }
}

/// Claimt de cleanup van een run onder de mutex: `stop_all_runs` (bij
/// app-exit) en de wait-thread kunnen anders gelijktijdig `cleanup_run` op
/// dezelfde worktree draaien. Geeft `true` als déze aanroeper mag opruimen.
fn claim_cleanup(app: &AppHandle, run_id: &str) -> bool {
    with_runs(app, |runs| claim_cleanup_entry(runs.get_mut(run_id))).unwrap_or(false)
}

/// Wat er met de commits van de run gebeurd is. `Pushed` betekent dat
/// `git push HEAD:<head_ref>` slaagde en de hele historie van HEAD dus op de
/// remote staat; `NotPushed` dekt geen marker, een gefaalde push en elk pad
/// waarin er helemaal niet gepusht werd (voorbereiding, cancel, app-exit).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum PushOutcome {
    Pushed,
    NotPushed,
}

/// Los van tauri om zonder AppHandle te kunnen testen: de uitkomst van de
/// push-stap plus de logregel erover. Zonder marker gebeurt er niets; een
/// gefaalde push blijft `NotPushed`, zodat de commits en de worktree blijven
/// staan (zie `cleanup_run`).
fn push_outcome(
    marked: bool,
    head_ref: &str,
    push: impl FnOnce() -> Result<String, String>,
) -> (PushOutcome, Option<String>) {
    if !marked {
        return (PushOutcome::NotPushed, None);
    }
    match push() {
        Ok(_) => (
            PushOutcome::Pushed,
            Some(format!("gepusht naar {head_ref}")),
        ),
        Err(error) => (
            PushOutcome::NotPushed,
            Some(format!("push naar {head_ref} faalde: {error}")),
        ),
    }
}

/// Verdeelt de lokale-commit-telling (gemeten vóór de push, dus ongevoelig voor
/// de asynchrone `refs/pull/<n>/head`-vertraging die `unpushed_commits`
/// beschrijft) over `pushed_commits`/`unpushed_commits` in het afloop-event: bij
/// een geslaagde push zijn ze allemaal meegegaan, anders staan ze allemaal nog
/// lokaal (ook als dat er 0 zijn).
fn commit_outcome(pushed: PushOutcome, commit_count: u32) -> (u32, u32) {
    match pushed {
        PushOutcome::Pushed => (commit_count, 0),
        PushOutcome::NotPushed => (0, commit_count),
    }
}

/// Aantal lokale commits t.o.v. de gefetchte PR-head, gemeten vóór een
/// eventuele push. `run_ref` verandert niet door de push zelf (alleen
/// `unpushed_commits` met `refresh_pr` haalt hem opnieuw op), dus deze telling
/// is na een geslaagde push exact het aantal meegepushte commits.
fn count_local_commits(worktree: &Path, run_ref: &str) -> u32 {
    run_git(worktree, &["log", "--oneline", &format!("{run_ref}..HEAD")])
        .map(|log| count_commits(&log) as u32)
        .unwrap_or(0)
}

/// De push die de agent zelf niet meer mag doen. De refspec bouwt de app uit de
/// PR-data, dus de bestemming staat vast: geen force, geen `+`-refspec, niets wat
/// een agent kan omleiden. Een niet-fast-forward laat git falen, en dan blijven
/// de commits en de worktree staan (zie `cleanup_run`).
fn push_if_marked(app: &AppHandle, run_id: &str, worktree: &Path, head_ref: &str) -> PushOutcome {
    let (outcome, line) = push_outcome(push_marker(run_id).exists(), head_ref, || {
        run_git(worktree, &["push", "origin", &format!("HEAD:{head_ref}")])
    });
    if let Some(line) = line {
        emit_log(app, run_id, vec![line]);
    }
    outcome
}

/// Los van tauri om zonder AppHandle te kunnen testen: mag deze run als
/// geslaagd gelden, plus de logregel erover.
///
/// `commentsOnly` levert niets op dat in de worktree achterblijft: de enige
/// uitkomst is de review op GitHub. De agent kan die niet kwijt zijn geraakt en
/// tóch met exit 0 eindigen (zijn eigen tooling valt weg, zijn sandbox heeft
/// geen netwerk), en dan staat er een run op "klaar" waar niemand iets van
/// terugziet. Vandaar dat exit 0 hier niet volstaat als bewijs.
///
/// Andere modes gaan er ongemoeid langs; die hebben hun eigen bewijs
/// (`push_outcome`) of laten commits achter. Een controle die zelf faalt
/// bewijst niets, dus die laat de run geslaagd en meldt alleen dat hij niet
/// kon draaien.
fn review_outcome(
    mode: &str,
    exit_code: i32,
    cancelled: bool,
    posted: impl FnOnce() -> Result<bool, String>,
) -> (bool, Option<String>) {
    if mode != "commentsOnly" || cancelled || exit_code != 0 {
        return (true, None);
    }
    match posted() {
        Ok(true) => (true, None),
        Ok(false) => (
            false,
            Some(
                "de agent stopte zonder fout, maar er staat geen review van deze run op de PR: er is niets geplaatst".to_string(),
            ),
        ),
        Err(error) => (
            true,
            Some(format!("kon niet controleren of de review geplaatst is: {error}")),
        ),
    }
}

/// Staat er een review met onze marker op de PR die ná `since` (unixtijd)
/// is ingediend? De tijdgrens moet erbij: zonder die grens zou de review van een
/// vórige run deze controle laten slagen, en dan gaat de gate nooit meer rood.
///
/// jq doet het filteren, zodat de marker als env-waarde meegaat en niet in een
/// filter geplakt hoeft te worden. Een review zonder `submitted_at` is een
/// concept en telt niet mee. `--paginate` print per pagina een eigen getal, dus
/// één pagina met een treffer is genoeg.
fn review_posted(
    repo_path: &Path,
    pr_number: u64,
    marker: &str,
    since: u64,
) -> Result<bool, String> {
    let endpoint = format!("repos/{{owner}}/{{repo}}/pulls/{pr_number}/reviews");
    let filter = "[.[] | select(.submitted_at != null)
         | select((.submitted_at | fromdateiso8601) >= (env.ACCORD_SINCE | tonumber))
         | select((.body // \"\") | contains(env.ACCORD_MARKER))] | length";
    let found = run_gh(
        repo_path,
        &["api", &endpoint, "--paginate", "--jq", filter],
        &[
            ("ACCORD_SINCE", &since.to_string()),
            ("ACCORD_MARKER", marker),
        ],
    )?;
    Ok(found
        .lines()
        .filter_map(|line| line.trim().parse::<u64>().ok())
        .any(|count| count > 0))
}

/// De klok van deze machine tegenover die van GitHub: een review die vlak na de
/// start binnenkomt mag niet buiten de grens vallen doordat de twee een paar
/// seconden schelen. Een run duurt minuten, dus een marge van een minuut kan
/// geen review van een vorige run binnenhalen.
const REVIEW_CLOCK_SLACK: u64 = 60;

fn review_cutoff() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().saturating_sub(REVIEW_CLOCK_SLACK))
        .unwrap_or(0)
}

/// Los van tauri om zonder AppHandle te kunnen testen: de reden om de worktree
/// te bewaren, of `None` als hij weg mag. Bij twijfel bewaren: kan de check niet
/// draaien, dan blijft alles staan.
///
/// Een geslaagde push van HEAD bewijst dat de hele historie van HEAD op de remote
/// staat, dus dan valt er niets te tellen. Dat is ook de enige juiste uitkomst:
/// GitHub werkt `refs/pull/<n>/head` asynchroon bij, dus de telling waar `count`
/// op leunt ziet direct na een push vaak nog de oude head en zou de net gepushte
/// commit onterecht als lokaal melden.
fn keep_reason(
    pushed: PushOutcome,
    count: impl FnOnce() -> Result<usize, String>,
) -> Option<String> {
    if pushed == PushOutcome::Pushed {
        return None;
    }
    match count() {
        Ok(0) => None,
        Ok(count) => Some(format!("{count} commit(s) staan alleen lokaal")),
        Err(error) => Some(format!(
            "kon niet-gepushte commits niet controleren: {error}"
        )),
    }
}

/// De agent commit bewust niet-gepushte werk (bijvoorbeeld bij rode tests); dat
/// weggooien is dataverlies. Blijft de worktree staan, dan markeren we hem
/// zodat het opruimen van zwerfresten hem later met rust laat.
///
/// Geeft het pad van de worktree terug als die bewaard bleef (`None` zodra hij
/// is opgeruimd), zodat de aanroeper dat als `kept_worktree` in het
/// afloop-event kan zetten in plaats van de keep-beslissing te herhalen.
fn cleanup_run(
    app: &AppHandle,
    run_id: &str,
    repo_path: &Path,
    worktree: &Path,
    refresh_pr: Option<u64>,
    pushed: PushOutcome,
) -> Option<PathBuf> {
    if !worktree.exists() {
        log_cleanup_error(app, run_id, run_git(repo_path, &["worktree", "prune"]));
        remove_ref(app, run_id, repo_path);
        return None;
    }
    let keep = keep_reason(pushed, || {
        unpushed_commits(repo_path, worktree, &run_ref_for(run_id), refresh_pr)
    });
    if let Some(reason) = keep {
        let _ = std::fs::write(worktree.join(KEEP_MARKER), b"");
        emit_log(
            app,
            run_id,
            vec![format!(
                "{reason}; de worktree blijft staan: {}",
                worktree.to_string_lossy()
            )],
        );
        return Some(worktree.to_path_buf());
    }
    log_cleanup_error(
        app,
        run_id,
        run_git(
            repo_path,
            &["worktree", "remove", "--force", &worktree.to_string_lossy()],
        ),
    );
    log_cleanup_error(app, run_id, run_git(repo_path, &["worktree", "prune"]));
    remove_ref(app, run_id, repo_path);
    if let Err(error) = std::fs::remove_dir_all(worktree) {
        if error.kind() != std::io::ErrorKind::NotFound {
            emit_log(
                app,
                run_id,
                vec![format!(
                    "opruimen: {} kon niet verwijderd worden: {error}",
                    worktree.to_string_lossy()
                )],
            );
        }
    }
    None
}

/// Run-id's uit `refs/pr-cockpit/*` die bij geen enkele lopende run horen. Een
/// vorige app-sessie die crashte of hard afgesloten werd laat die refs achter.
fn stray_run_ids(refs: &str, active: &HashSet<String>) -> Vec<String> {
    refs.lines()
        .filter_map(|line| line.trim().strip_prefix("refs/pr-cockpit/"))
        .filter(|id| checked_run_id(id).is_ok() && !active.contains(*id))
        .map(str::to_string)
        .collect()
}

/// `git worktree prune` alleen is niet genoeg zolang de directory nog bestaat:
/// git blijft hem dan als geldige worktree zien. Dus eerst weg met de map.
fn cleanup_strays(app: &AppHandle, repo_path: &Path) {
    cleanup_old_logs();
    let active: HashSet<String> =
        with_runs(app, |runs| runs.keys().cloned().collect()).unwrap_or_default();
    let Ok(refs) = run_git(
        repo_path,
        &["for-each-ref", "--format=%(refname)", "refs/pr-cockpit/"],
    ) else {
        return;
    };
    let base = std::env::temp_dir().join("pr-cockpit");
    for id in stray_run_ids(&refs, &active) {
        let worktree = base.join(&id);
        if worktree.join(KEEP_MARKER).exists() {
            continue;
        }
        let _ = run_git(
            repo_path,
            &["worktree", "remove", "--force", &worktree.to_string_lossy()],
        );
        let _ = std::fs::remove_dir_all(&worktree);
        let _ = run_git(repo_path, &["update-ref", "-d", &run_ref_for(&id)]);
    }
    let _ = run_git(repo_path, &["worktree", "prune"]);
}

/// Bij app-exit: alle lopende agents stoppen (procesgroep) en hun worktrees
/// opruimen, zodat er geen agent doorpusht zonder UI en er geen worktrees en
/// refs achterblijven in de repo van de gebruiker.
pub fn stop_all_runs(app: &AppHandle) {
    // Afgeronde runs blijven in de state voor `list_runs`; hun worktree is al
    // opgeruimd, dus die slaan we hier over.
    let runs: Vec<(String, RunInfo)> = with_runs(app, |runs| {
        runs.drain()
            .filter(|(_, r)| r.status == RunStatus::Running)
            .collect()
    })
    .unwrap_or_default();
    if runs.is_empty() {
        return;
    }
    for (_, info) in &runs {
        if let Some(pid) = info.pid {
            term_group(pid);
        }
    }
    std::thread::sleep(EXIT_GRACE);
    for (run_id, info) in runs {
        if let Some(pid) = info.pid {
            kill_group_if_alive(pid);
        }
        // De run is net uit de state gedraind, dus `cleaned` staat nog op
        // false: claim hem hier expliciet zodat een wait-thread die
        // ondertussen dezelfde run afrondt, zijn eigen cleanup overslaat.
        if !info.cleaned {
            let _ = cleanup_run(
                app,
                &run_id,
                &info.repo_path,
                &info.worktree,
                None,
                PushOutcome::NotPushed,
            );
        }
    }
}

/// Leest één regel en kapt hem af op `MAX_LINE_BYTES`; de staart van een te
/// lange regel gaat in stukken door de shredder, zodat één gigantische regel
/// het geheugen niet opblaast. `None` bij het einde van de stroom.
fn read_capped_line<R: BufRead>(reader: &mut R) -> Option<String> {
    let mut buf = Vec::new();
    let read = (&mut *reader)
        .take(MAX_LINE_BYTES as u64)
        .read_until(b'\n', &mut buf)
        .ok()?;
    if read == 0 {
        return None;
    }
    if buf.last() == Some(&b'\n') {
        buf.pop();
        if buf.last() == Some(&b'\r') {
            buf.pop();
        }
        return Some(String::from_utf8_lossy(&buf).into_owned());
    }
    let mut skipped = 0usize;
    loop {
        let mut rest = Vec::new();
        let n = (&mut *reader)
            .take(MAX_LINE_BYTES as u64)
            .read_until(b'\n', &mut rest)
            .ok()?;
        skipped += n;
        if n == 0 || rest.last() == Some(&b'\n') {
            break;
        }
    }
    let mut line = String::from_utf8_lossy(&buf).into_owned();
    if skipped > 0 {
        line.push_str(&format!(" [regel afgekapt, {skipped} tekens weggelaten]"));
    }
    Some(line)
}

/// Haalt de PR-branch op, zet er een losse worktree voor op en start de review-agent
/// daarin. Regels van stdout en stderr komen als `agent-log`-events terug, de afloop
/// als `agent-done`. De git-calls draaien buiten de main thread, anders bevriest de UI.
#[tauri::command]
pub async fn start_agent_review(
    app: tauri::AppHandle,
    run_id: String,
    repo_id: String,
    repo_path: String,
    pr_number: u64,
    head_ref: String,
    base_ref: String,
    agent: String,
    mode: String,
    model: String,
    effort: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        start_review_blocking(
            app, run_id, repo_id, repo_path, pr_number, head_ref, base_ref, agent, mode, model,
            effort,
        )
    })
    .await
    .map_err(|e| format!("kon de review niet starten: {e}"))?
}

fn start_review_blocking(
    app: tauri::AppHandle,
    run_id: String,
    repo_id: String,
    repo_path: String,
    pr_number: u64,
    head_ref: String,
    base_ref: String,
    agent: String,
    mode: String,
    model: String,
    effort: String,
) -> Result<(), String> {
    checked_run_id(&run_id)?;
    let marker = push_marker(&run_id);
    // Een marker van een vorige run met hetzelfde id zou meteen een push
    // opleveren; opruimen vóór de start is de enige plek waar dat zeker kan.
    let _ = std::fs::remove_file(&marker);
    let prompt = prompt_for_mode(&agent, &mode, pr_number, &head_ref, &base_ref, &marker)?;
    let repo_path = PathBuf::from(&repo_path);
    if !repo_path.is_absolute() {
        return Err("repo-pad moet absoluut zijn".to_string());
    }
    if !repo_path.join(".git").exists() {
        return Err(format!("{} is geen git-repo", repo_path.to_string_lossy()));
    }
    let binary = find_binary(&agent).ok_or_else(|| {
        format!("de {agent}-CLI is niet gevonden; installeer hem of zet hem in je PATH")
    })?;

    let worktree = std::env::temp_dir().join("pr-cockpit").join(&run_id);

    // Registreren vóór de fetch: anders is er een venster van tientallen
    // seconden waarin de UI de run al toont maar een cancel afketst op
    // "run loopt niet".
    with_runs(&app, |runs| {
        runs.insert(
            run_id.clone(),
            RunInfo {
                pid: None,
                cancelled: false,
                cleaned: false,
                repo_path: repo_path.clone(),
                worktree: worktree.clone(),
                repo_id: repo_id.clone(),
                pr_number,
                agent: agent.clone(),
                mode: mode.clone(),
                status: RunStatus::Running,
                exit_code: None,
                started_at: next_started_at(),
                log: Vec::new(),
                pushed_commits: 0,
                unpushed_commits: 0,
                kept_worktree: None,
            },
        )
    })
    .ok_or("runs-state is niet beschikbaar")?;

    // Resten van een vorige sessie die hard afgesloten werd; de zojuist
    // geregistreerde run is "actief" en blijft dus buiten schot.
    cleanup_strays(&app, &repo_path);

    // Een eigen ref per run: FETCH_HEAD is repo-globaal en zou tussen twee
    // gelijktijdige runs (of een fetch van de gebruiker zelf) de verkeerde PR
    // kunnen opleveren.
    let run_ref = run_ref_for(&run_id);
    let prepare = prepare_worktree(&repo_path, &worktree, &run_ref, pr_number);
    if let Err(error) = prepare {
        with_runs(&app, |runs| runs.remove(&run_id));
        let _ = cleanup_run(
            &app,
            &run_id,
            &repo_path,
            &worktree,
            None,
            PushOutcome::NotPushed,
        );
        return Err(error);
    }

    // Eerste checkpoint: een cancel tijdens de voorbereiding heeft alleen de
    // vlag kunnen zetten, hier breken we hem netjes af.
    if is_cancelled(&app, &run_id) {
        abort_prepared_run(&app, &run_id, &repo_path, &worktree);
        return Ok(());
    }

    // Absoluut pad, en via rev-parse zodat het ook klopt als de repo zelf een
    // worktree is (dan is .git een bestand, geen map).
    let git_common_dir = run_git(
        &repo_path,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )
    .map(|dir| PathBuf::from(dir.trim()))
    .unwrap_or_else(|_| repo_path.join(".git"));
    let mut command = match agent_command(
        &agent,
        &mode,
        &prompt,
        &binary,
        &model,
        &effort,
        &git_common_dir,
    ) {
        Ok(command) => command,
        Err(error) => {
            with_runs(&app, |runs| runs.remove(&run_id));
            let _ = cleanup_run(
                &app,
                &run_id,
                &repo_path,
                &worktree,
                None,
                PushOutcome::NotPushed,
            );
            return Err(error);
        }
    };
    command
        .current_dir(&worktree)
        .env("PATH", child_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Eigen procesgroep, zodat we straks de agent én alles wat hij start
        // in één keer kunnen stoppen.
        .process_group(0);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(e) => {
            with_runs(&app, |runs| runs.remove(&run_id));
            let _ = cleanup_run(
                &app,
                &run_id,
                &repo_path,
                &worktree,
                None,
                PushOutcome::NotPushed,
            );
            return Err(format!("{agent} kon niet starten: {e}"));
        }
    };

    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Beide streams voeden één kanaal; de flush-thread bundelt ze tot batches.
    // Claude's stdout is stream-json en wordt eerst leesbaar gemaakt; stderr
    // (en alles van codex) gaat rauw door.
    let parse_stdout = agent == "claude";
    let (tx, rx) = mpsc::channel::<String>();
    for (stream, parse) in [
        (
            stdout.map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
            parse_stdout,
        ),
        (
            stderr.map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
            false,
        ),
    ] {
        let Some(stream) = stream else { continue };
        let tx = tx.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stream);
            while let Some(line) = read_capped_line(&mut reader) {
                let lines = if parse {
                    crate::claude_stream::readable_stream_lines(&line)
                } else {
                    vec![line]
                };
                if lines.into_iter().any(|line| tx.send(line).is_err()) {
                    return;
                }
            }
        });
    }
    drop(tx);

    let app_for_log = app.clone();
    let run_id_for_log = run_id.clone();
    let log_thread = std::thread::spawn(move || {
        let mut batch: Vec<String> = Vec::new();
        loop {
            match rx.recv_timeout(LOG_FLUSH) {
                Ok(line) => {
                    batch.push(line);
                    if batch.len() >= LOG_BATCH {
                        emit_log(&app_for_log, &run_id_for_log, std::mem::take(&mut batch));
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    emit_log(&app_for_log, &run_id_for_log, std::mem::take(&mut batch));
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    emit_log(&app_for_log, &run_id_for_log, batch);
                    return;
                }
            }
        }
    });

    // Tweede checkpoint: een cancel die tussen het checkpoint hierboven en de
    // spawn viel, treft nu alsnog de zojuist gestarte procesgroep.
    let cancelled_meanwhile = with_runs(&app, |runs| match runs.get_mut(&run_id) {
        Some(run) => {
            run.pid = Some(pid);
            run.cancelled
        }
        None => true,
    })
    .unwrap_or(true);
    if cancelled_meanwhile {
        term_group(pid);
    }

    let app_for_wait = app.clone();
    // Vóór de wait vastleggen: de controle verderop zoekt reviews van ná dit
    // moment, en dat moment is de start van de agent, niet zijn einde.
    let review_since = review_cutoff();
    let review_mode = mode.clone();
    let review_marker = review_marker(&agent, &mode);
    std::thread::spawn(move || {
        let exit_code = match child.wait() {
            Ok(status) => status.code().unwrap_or(-1),
            Err(_) => -1,
        };
        // Eerst de log leegdraaien: anders komt agent-done vóór de laatste regels.
        let _ = log_thread.join();
        let cancelled = with_runs(&app_for_wait, |runs| {
            runs.get(&run_id).map(|run| run.cancelled).unwrap_or(true)
        })
        .unwrap_or(true);
        // Vóór de push: `run_ref` staat nog op de PR-head van vóór deze run,
        // dus dit is het aantal commits dat de agent hier lokaal maakte, ook
        // als de push zelf faalt of overgeslagen wordt.
        let commit_count = count_local_commits(&worktree, &run_ref);
        let pushed = if exit_code == 0 && !cancelled {
            push_if_marked(&app_for_wait, &run_id, &worktree, &head_ref)
        } else {
            PushOutcome::NotPushed
        };
        let (pushed_commits, unpushed_commit_count) = commit_outcome(pushed, commit_count);
        let _ = std::fs::remove_file(push_marker(&run_id));
        // Exit 0 is voor commentsOnly geen bewijs: die mode laat niets in de
        // worktree achter, dus de enige uitkomst staat op GitHub. Daar kijken we
        // dan ook, vóór cleanup_run, want daarna is de run uit beeld.
        let (review_ok, review_line) = review_outcome(&review_mode, exit_code, cancelled, || {
            review_posted(&repo_path, pr_number, &review_marker, review_since)
        });
        if let Some(line) = review_line {
            emit_log(&app_for_wait, &run_id, vec![line]);
        }
        // Een gelijktijdige stop_all_runs (app-exit) kan deze run net vóór ons
        // geclaimd en opgeruimd hebben; claim_cleanup zorgt dat precies één
        // van beiden cleanup_run daadwerkelijk draait. Draaide de andere kant
        // hem al op, dan is niet meer te achterhalen of hij bewaard bleef.
        let kept_worktree = if claim_cleanup(&app_for_wait, &run_id) {
            cleanup_run(
                &app_for_wait,
                &run_id,
                &repo_path,
                &worktree,
                Some(pr_number),
                pushed,
            )
        } else {
            None
        };
        // Blijft in de state staan (met eindstatus en log) zodat `list_runs`
        // een afgeronde run nog kan tonen na een (her)mount van de frontend.
        with_runs(&app_for_wait, |runs| {
            if let Some(run) = runs.get_mut(&run_id) {
                run.status = if run.cancelled {
                    RunStatus::Cancelled
                } else if exit_code == 0 && review_ok {
                    RunStatus::Done
                } else {
                    RunStatus::Failed
                };
                run.exit_code = Some(exit_code);
                run.pid = None;
                run.pushed_commits = pushed_commits;
                run.unpushed_commits = unpushed_commit_count;
                run.kept_worktree = kept_worktree
                    .as_ref()
                    .map(|p| p.to_string_lossy().into_owned());
            }
        });
        let _ = app_for_wait.emit(
            "agent-done",
            DoneEvent {
                run_id,
                exit_code,
                review_missing: !review_ok,
                pushed_commits,
                unpushed_commits: unpushed_commit_count,
                kept_worktree: kept_worktree.map(|p| p.to_string_lossy().into_owned()),
            },
        );
    });

    Ok(())
}

/// Haalt de PR-head op in een eigen ref en zet er een detached worktree voor op,
/// dus geen branch die door een achtergebleven worktree van een vorige run
/// vastgehouden kan worden. Fixes pushen kan met HEAD:<head_ref>.
fn prepare_worktree(
    repo_path: &Path,
    worktree: &Path,
    run_ref: &str,
    pr_number: u64,
) -> Result<(), String> {
    run_git(
        repo_path,
        &[
            "fetch",
            "origin",
            &format!("+refs/pull/{pr_number}/head:{run_ref}"),
        ],
    )?;
    let _ = run_git(repo_path, &["worktree", "prune"]);
    run_git(
        repo_path,
        &[
            "worktree",
            "add",
            "--detach",
            &worktree.to_string_lossy(),
            run_ref,
        ],
    )?;
    Ok(())
}

/// Een run die tijdens de voorbereiding gecanceld werd: opruimen en de frontend
/// via het gewone afloop-event laten weten dat hij klaar is.
fn abort_prepared_run(app: &AppHandle, run_id: &str, repo_path: &Path, worktree: &Path) {
    emit_log(
        app,
        run_id,
        vec!["run geannuleerd tijdens de voorbereiding".to_string()],
    );
    with_runs(app, |runs| {
        if let Some(run) = runs.get_mut(run_id) {
            run.status = RunStatus::Cancelled;
            run.pid = None;
        }
    });
    let _ = cleanup_run(
        app,
        run_id,
        repo_path,
        worktree,
        None,
        PushOutcome::NotPushed,
    );
    let _ = app.emit(
        "agent-done",
        DoneEvent {
            run_id: run_id.to_string(),
            exit_code: -1,
            review_missing: false,
            pushed_commits: 0,
            unpushed_commits: 0,
            kept_worktree: None,
        },
    );
}

/// Stopt een lopende run. Zit de run nog in de voorbereiding, dan blijft het bij
/// de vlag: de voorbereiding breekt zelf af op het eerstvolgende checkpoint.
/// Draait buiten de main thread: de mutex en de kill mogen de UI niet ophouden.
#[tauri::command]
pub async fn cancel_agent_review(app: AppHandle, run_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let claim: Result<Option<u32>, String> =
            with_runs(&app, |runs| match runs.get_mut(&run_id) {
                Some(run) if run.status == RunStatus::Running => {
                    run.cancelled = true;
                    Ok(run.pid)
                }
                Some(_) => Err(format!("run {run_id} loopt niet meer")),
                None => Err(format!("run {run_id} loopt niet")),
            })
            .unwrap_or_else(|| Err(format!("run {run_id} loopt niet")));
        match claim? {
            None => Ok(()),
            Some(pid) => {
                term_group(pid);
                std::thread::spawn(move || {
                    std::thread::sleep(KILL_GRACE);
                    kill_group_if_alive(pid);
                });
                Ok(())
            }
        }
    })
    .await
    .map_err(|e| format!("kon de agent niet stoppen: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_MARKER: &str = "/tmp/pr-cockpit/run-7.push";

    /// Schaduwt `super::prompt_for_mode` met een vast marker-pad, zodat de tests
    /// over de prompt-inhoud gaan en niet over het doorgeven van dat pad.
    fn prompt_for_mode(
        agent: &str,
        mode: &str,
        pr_number: u64,
        head_ref: &str,
        base_ref: &str,
    ) -> Result<String, String> {
        super::prompt_for_mode(
            agent,
            mode,
            pr_number,
            head_ref,
            base_ref,
            Path::new(TEST_MARKER),
        )
    }

    #[test]
    fn comments_only_prompt_forbids_pushing() {
        let prompt =
            prompt_for_mode("claude", "commentsOnly", 42, "feature/x", "main").expect("prompt");
        assert!(prompt.contains("#42"));
        assert!(prompt.contains("Wijzig geen bestanden"));
        assert!(!prompt.contains("git push"));
    }

    #[test]
    fn comments_only_prompt_posts_inline_comments_with_a_nit_cap() {
        let prompt =
            prompt_for_mode("claude", "commentsOnly", 42, "feature/x", "main").expect("prompt");
        assert!(prompt.contains("gh api repos/{owner}/{repo}/pulls/42/reviews"));
        assert!(prompt.contains("maximaal 5 nits"));
        assert!(prompt.contains("bestand:regel"));
    }

    #[test]
    /// De app pusht, niet de agent: elke fix-mode geeft groen licht via de marker
    /// en noemt zelf geen enkel push-commando meer.
    fn fix_modes_hand_the_push_to_the_app() {
        for mode in ["withFixes", "fixComments", "fixChecks", "fixConflicts"] {
            let prompt = prompt_for_mode("claude", mode, 42, "feature/x", "main").expect("prompt");
            assert!(prompt.contains(TEST_MARKER), "mode {mode}");
            assert!(
                prompt.contains("Accord pusht ze daarna naar feature/x"),
                "mode {mode}"
            );
            assert!(prompt.contains("gebruik geen git push"), "mode {mode}");
            assert!(!prompt.contains("git push origin"), "mode {mode}");
        }
    }

    #[test]
    /// Een falende test die er al stond blokkeert de push niet: anders blijven
    /// correcte fixes lokaal staan omdat de suite elders al rood was. De prijs
    /// is een bewijsplicht, en bij twijfel geen marker.
    fn fix_modes_allow_a_push_when_the_failure_predates_the_change() {
        for mode in ["withFixes", "fixComments", "fixChecks", "fixConflicts"] {
            let prompt = prompt_for_mode("claude", mode, 42, "feature/x", "main").expect("prompt");
            assert!(prompt.contains("zonder jouw commits"), "mode {mode}");
            assert!(
                prompt.contains("maak het bestand dan wel aan"),
                "mode {mode}"
            );
            assert!(
                prompt.contains("kun je niet bewijzen dat het al bestond"),
                "mode {mode}"
            );
        }
    }

    #[test]
    /// Beide review-modes lezen de diff en openen een heel bestand alleen als het
    /// niet anders kan: wat je één keer leest, betaal je in elke volgende turn.
    fn review_modes_keep_reading_on_the_diff() {
        for mode in ["withFixes", "commentsOnly"] {
            let prompt = prompt_for_mode("claude", mode, 42, "feature/x", "main").expect("prompt");
            assert!(prompt.contains("gh pr diff 42"), "mode {mode}");
            assert!(
                prompt.contains(
                    "Open een heel bestand alleen als de diff zonder die context niet te beoordelen is; lees anders gerichte regelbereiken rond de gewijzigde regels."
                ),
                "mode {mode}"
            );
        }
    }

    #[test]
    /// De suite overdoen die CI net groen draaide kostte in de meting van
    /// 2026-09-17 het leeuwendeel van de runtijd. De prompt kijkt daarom eerst
    /// naar de checks, en hangt de volledige suite aan een rode, pending of
    /// ontbrekende check.
    fn fix_modes_lean_on_green_ci_before_running_the_suite() {
        for mode in ["withFixes", "fixComments", "fixChecks", "fixConflicts"] {
            let prompt = prompt_for_mode("claude", mode, 42, "feature/x", "main").expect("prompt");
            assert!(prompt.contains("gh pr checks 42"), "mode {mode}");
            assert!(
                prompt.contains("alleen de tests die jouw eigen wijziging raakt"),
                "mode {mode}"
            );
            assert!(
                prompt.contains("mutation- en coveragegates over"),
                "mode {mode}"
            );
            assert!(
                prompt.contains(
                    "rood of pending, of zijn er geen checks, dan draai je zelf de volledige tests en de linter"
                ),
                "mode {mode}"
            );
        }
    }

    #[test]
    /// Deze mode opent zelf een PR en heeft de branch dus tijdens de run op origin
    /// nodig; hij blijft daarom zelf pushen, en alleen naar een claude/-branch.
    fn distill_learnings_still_pushes_itself_to_a_claude_branch() {
        let prompt =
            prompt_for_mode("claude", "distillLearnings", 42, "feature/x", "main").expect("prompt");
        assert!(prompt.contains("git push origin HEAD:claude/<naam>"));
        assert!(!prompt.contains(TEST_MARKER));
    }

    #[test]
    /// De inline-variant (auto-chain na een fix-run) landt op de PR-branch zelf
    /// via de hand-off: geen eigen branch, geen eigen PR.
    fn distill_learnings_inline_commits_on_the_pr_branch_and_hands_off() {
        let prompt = prompt_for_mode("claude", "distillLearningsInline", 42, "feature/x", "main")
            .expect("prompt");
        assert!(prompt.contains(TEST_MARKER));
        assert!(prompt.contains("Accord pusht ze daarna naar feature/x"));
        assert!(!prompt.contains("gh pr create"));
        assert!(!prompt.contains("git push origin"));
    }

    #[test]
    /// Zonder rem groeit CLAUDE.md met alinea's per PR dicht: beide lessen-modes
    /// cappen aantal en lengte, routeren CLAUDE.md als laatste optie en dwingen
    /// one-in-one-out af boven het budget.
    fn learnings_prompts_cap_claude_md_growth() {
        for mode in ["distillLearnings", "distillLearningsInline"] {
            let prompt = prompt_for_mode("claude", mode, 42, "feature/x", "main").expect("prompt");
            assert!(prompt.contains("Maximaal twee lessen"), "mode {mode}");
            assert!(prompt.contains("laatste optie"), "mode {mode}");
            assert!(prompt.contains("2-3 zinnen"), "mode {mode}");
            assert!(prompt.contains("wc -c"), "mode {mode}");
            assert!(prompt.contains("one-in-one-out"), "mode {mode}");
        }
    }

    #[test]
    /// Binnen de worktree zou `git add -A` van de agent de marker meecommitten.
    fn push_marker_lives_next_to_the_worktree_not_inside_it() {
        let worktree = std::env::temp_dir().join("pr-cockpit").join("run-7");
        assert!(!push_marker("run-7").starts_with(&worktree));
        assert_eq!(push_marker("run-7").parent(), worktree.parent());
    }

    #[test]
    fn comments_only_and_with_fixes_prompts_instrueren_de_verborgen_marker() {
        let comments_only =
            prompt_for_mode("claude", "commentsOnly", 42, "feature/x", "main").expect("prompt");
        assert!(comments_only.contains("<!-- accord:claude:commentsOnly -->"));

        let with_fixes =
            prompt_for_mode("codex", "withFixes", 42, "feature/x", "main").expect("prompt");
        assert!(with_fixes.contains("<!-- accord:codex:withFixes -->"));
    }

    #[test]
    /// Een fix-run die bestaande review-threads negeert laat de reviewer zijn
    /// punten dubbel maken: withFixes leest de open threads, verwerkt ze en
    /// sluit ze af (reply + resolve), net als fixComments.
    fn with_fixes_prompt_reads_replies_and_resolves_existing_threads() {
        let prompt =
            prompt_for_mode("claude", "withFixes", 42, "feature/x", "main").expect("prompt");
        assert!(prompt.contains("gh api repos/{owner}/{repo}/pulls/42/comments"));
        assert!(prompt.contains("in_reply_to"));
        assert!(prompt.contains("resolveReviewThread"));
    }

    #[test]
    /// Replyen zonder resolven laat de thread als openstaand werk achter;
    /// verwerkt betekent ook afgesloten.
    fn fix_comments_prompt_resolves_the_threads_it_handles() {
        let prompt =
            prompt_for_mode("claude", "fixComments", 42, "feature/x", "main").expect("prompt");
        assert!(prompt.contains("resolveReviewThread"));
        assert!(prompt.contains("laat die thread open"));
    }

    #[test]
    fn fix_checks_prompt_covers_logs_billing_and_stop_without_changes() {
        let prompt =
            prompt_for_mode("claude", "fixChecks", 42, "feature/x", "main").expect("prompt");
        assert!(prompt.contains("gh run view <run-id> --log-failed"));
        assert!(prompt.contains("billing"));
        assert!(prompt.contains("stop dan zonder iets te wijzigen"));
    }

    #[test]
    fn fix_checks_prompt_forbids_weakening_tests() {
        let prompt =
            prompt_for_mode("claude", "fixChecks", 42, "feature/x", "main").expect("prompt");
        assert!(prompt.contains("verzwak, skip of verwijder nooit een test"));
    }

    #[test]
    fn fix_conflicts_prompt_merges_the_base_and_verifies_before_handing_off() {
        let prompt =
            prompt_for_mode("claude", "fixConflicts", 42, "feature/x", "develop").expect("prompt");
        assert!(prompt.contains("origin/develop"));
        assert!(prompt.contains("build en tests"));
    }

    #[test]
    fn fix_comments_prompt_replies_in_thread() {
        let prompt =
            prompt_for_mode("claude", "fixComments", 42, "feature/x", "main").expect("prompt");
        assert!(prompt.contains("in_reply_to"));
        assert!(prompt.contains("nooit door een test te verzwakken"));
    }

    #[test]
    fn distill_learnings_prompt_targets_claude_md_and_skills_on_a_fresh_branch() {
        let prompt =
            prompt_for_mode("claude", "distillLearnings", 42, "feature/x", "main").expect("prompt");
        assert!(prompt.contains("gh api repos/{owner}/{repo}/pulls/42/comments"));
        assert!(prompt.contains("CLAUDE.md"));
        assert!(prompt.contains(".claude/skills"));
        assert!(prompt.contains("verse branch vanaf origin/main"));
        assert!(prompt.contains("gh pr create"));
    }

    #[test]
    fn distill_learnings_prompt_may_stop_empty_and_never_pushes_to_pr_branches() {
        let prompt =
            prompt_for_mode("claude", "distillLearnings", 42, "feature/x", "main").expect("prompt");
        assert!(prompt.contains("stop dan zonder iets te wijzigen"));
        assert!(prompt.contains("generaliseerbare lessen"));
        assert!(prompt.contains("Push nooit geforceerd en nooit direct naar main of feature/x"));
    }

    #[test]
    fn unknown_mode_is_rejected() {
        assert!(prompt_for_mode("claude", "gemini", 42, "feature/x", "main").is_err());
    }

    #[test]
    fn every_prompt_says_the_run_is_autonomous() {
        for mode in [
            "withFixes",
            "commentsOnly",
            "fixComments",
            "fixChecks",
            "fixConflicts",
            "distillLearnings",
            "distillLearningsInline",
        ] {
            let prompt = prompt_for_mode("claude", mode, 7, "feature", "main").expect("prompt");
            assert!(prompt.starts_with(AUTONOMOUS_PREFIX), "mode {mode}");
        }
    }

    #[test]
    fn claude_bypasses_permissions_for_fix_checks_and_gets_no_allowed_tools() {
        let command = agent_command(
            "claude",
            "fixChecks",
            "prompt",
            Path::new("/usr/bin/claude"),
            "sonnet",
            "midden",
            Path::new("/repo/.git"),
        )
        .expect("command");
        let args: Vec<String> = command
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert!(args.contains(&"bypassPermissions".to_string()));
        assert!(!args.contains(&"--allowedTools".to_string()));
    }

    #[test]
    fn claude_comments_only_gets_a_readonly_toolset() {
        let command = agent_command(
            "claude",
            "commentsOnly",
            "prompt",
            Path::new("/usr/bin/claude"),
            "sonnet",
            "midden",
            Path::new("/repo/.git"),
        )
        .expect("command");
        let args: Vec<String> = command
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert!(args.contains(&"--allowedTools".to_string()));
        assert!(!args.contains(&"--permission-mode".to_string()));
    }

    #[test]
    fn rejects_run_ids_that_could_escape_the_temp_dir() {
        assert!(checked_run_id("../../etc").is_err());
        assert!(checked_run_id("run/1").is_err());
        assert!(checked_run_id("").is_err());
        assert!(checked_run_id("3f2a9c10-4b1e-4a55-9f0d-8c7b6a5d4e3f").is_ok());
    }

    #[test]
    fn codex_gets_network_access_so_it_can_comment() {
        let command = agent_command(
            "codex",
            "commentsOnly",
            "prompt",
            Path::new("/usr/bin/codex"),
            "gpt-5",
            "midden",
            Path::new("/repo/.git"),
        )
        .expect("command");
        let args: Vec<String> = command
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert!(args.contains(&"sandbox_workspace_write.network_access=true".to_string()));
    }

    // Een git-worktree bewaart index, refs en objects in de .git van de
    // hoofdrepo; zonder schrijfrechten daarop faalt elke `git commit` in de
    // codex-sandbox op index.lock en wijkt codex uit naar een eigen GIT_DIR
    // in /tmp met "lokale commits" die nergens bestaan.
    #[test]
    fn codex_with_fixes_may_write_to_the_shared_git_dir() {
        let command = agent_command(
            "codex",
            "withFixes",
            "prompt",
            Path::new("/usr/bin/codex"),
            "gpt-5",
            "midden",
            Path::new("/repo/.git"),
        )
        .expect("command");
        let args: Vec<String> = command
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert!(
            args.contains(&r#"sandbox_workspace_write.writable_roots=["/repo/.git"]"#.to_string()),
            "writable_roots ontbreekt in: {args:?}"
        );
    }

    #[test]
    fn codex_comments_only_keeps_the_shared_git_dir_readonly() {
        let command = agent_command(
            "codex",
            "commentsOnly",
            "prompt",
            Path::new("/usr/bin/codex"),
            "gpt-5",
            "midden",
            Path::new("/repo/.git"),
        )
        .expect("command");
        let args: Vec<String> = command
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert!(
            !args.iter().any(|a| a.contains("writable_roots")),
            "commentsOnly hoort geen schrijfrechten op .git te krijgen: {args:?}"
        );
    }

    // Een globale ~/.codex/config.toml kan MCP-servers meebrengen die codex naar
    // een andere uitvoerlaag laten schakelen. Gebeurde dat, dan liep elke
    // shell-aanroep dood op "timed out negotiating with the code-mode host" en
    // week de agent uit naar een runtime zonder netwerk: review voorbereid, nooit
    // geplaatst, exit 0.
    #[test]
    fn codex_runs_without_the_mcp_servers_from_the_global_config() {
        let command = agent_command(
            "codex",
            "commentsOnly",
            "prompt",
            Path::new("/usr/bin/codex"),
            "gpt-5",
            "midden",
            Path::new("/repo/.git"),
        )
        .expect("command");
        let args: Vec<String> = command
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert!(
            args.contains(&"mcp_servers={}".to_string()),
            "codex hoort zonder MCP-servers te draaien: {args:?}"
        );
    }

    #[test]
    fn a_comments_only_run_without_a_review_counts_as_failed() {
        let (ok, line) = review_outcome("commentsOnly", 0, false, || Ok(false));
        assert!(!ok);
        assert!(
            line.expect("logregel").contains("geen review"),
            "de logregel hoort te zeggen dat er niets geplaatst is"
        );
    }

    #[test]
    fn a_comments_only_run_with_a_review_counts_as_done() {
        let (ok, line) = review_outcome("commentsOnly", 0, false, || Ok(true));
        assert!(ok);
        assert_eq!(line, None);
    }

    // De controle zelf is een tweede aanroep die om eigen redenen kan falen
    // (geen netwerk, gh niet ingelogd). Dat is geen bewijs dat er niets
    // geplaatst is, dus de run blijft geslaagd en de reden gaat naar het log.
    #[test]
    fn a_failing_check_does_not_fail_the_run() {
        let (ok, line) = review_outcome("commentsOnly", 0, false, || Err("gh: 401".to_string()));
        assert!(ok);
        assert!(line.expect("logregel").contains("gh: 401"));
    }

    #[test]
    fn other_modes_and_unfinished_runs_skip_the_check() {
        for (mode, exit_code, cancelled) in [
            ("withFixes", 0, false),
            ("fixComments", 0, false),
            ("distillLearnings", 0, false),
            ("commentsOnly", 1, false),
            ("commentsOnly", 0, true),
        ] {
            let (ok, line) = review_outcome(mode, exit_code, cancelled, || {
                panic!("de controle hoort hier niet te draaien: {mode} {exit_code} {cancelled}")
            });
            assert!(ok);
            assert_eq!(line, None);
        }
    }

    #[test]
    fn unknown_agent_is_rejected() {
        assert!(agent_command(
            "gemini",
            "commentsOnly",
            "p",
            Path::new("/bin/x"),
            "m",
            "midden",
            Path::new("/repo/.git")
        )
        .is_err());
    }

    /// Zoals `claude --help` het afdrukt: de beschrijving loopt over meerdere
    /// regels door en noemt ook een volledige modelnaam als voorbeeld.
    const CLAUDE_HELP: &str = concat!(
        "  --mcp-config <configs...>             Load MCP servers from JSON files or\n",
        "  --model <model>                       Model for the current session. Provide\n",
        "                                        an alias for the latest model (e.g.\n",
        "                                        'fable', 'opus', or 'sonnet') or a\n",
        "                                        model's full name (e.g.\n",
        "                                        'claude-fable-5').\n",
        "  -n, --name <name>                     Set a display name for this session\n",
    );

    #[test]
    fn claude_help_yields_the_model_aliases() {
        assert_eq!(
            parse_claude_models(CLAUDE_HELP),
            vec![
                "fable".to_string(),
                "opus".to_string(),
                "sonnet".to_string()
            ]
        );
    }

    #[test]
    fn claude_help_without_a_model_option_yields_nothing() {
        assert!(parse_claude_models("  -h, --help  Display help\n").is_empty());
    }

    #[test]
    fn codex_catalog_is_listed_on_priority_without_hidden_models() {
        let json = r#"{"models":[
            {"slug":"gpt-5.4","visibility":"list","priority":16},
            {"slug":"codex-auto-review","visibility":"hide","priority":3},
            {"slug":"gpt-5.6-sol","visibility":"list","priority":1},
            {"slug":"gpt-5.5","visibility":"list","priority":7}
        ]}"#;
        assert_eq!(
            parse_codex_models(json),
            vec![
                "gpt-5.6-sol".to_string(),
                "gpt-5.5".to_string(),
                "gpt-5.4".to_string()
            ]
        );
    }

    /// Handmatige check tegen de CLI's op deze machine: de fixtures hierboven
    /// bevriezen een uitvoerformaat dat buiten deze repo kan veranderen.
    /// Draaien met `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore = "vereist een lokaal geïnstalleerde claude- en codex-CLI"]
    fn reads_models_from_the_installed_clis() {
        let claude = cli_output("claude", &["--help"])
            .map(|help| parse_claude_models(&help))
            .unwrap_or_default();
        let codex = cli_output("codex", &["debug", "models"])
            .map(|json| parse_codex_models(&json))
            .unwrap_or_default();
        println!("claude: {claude:?}\ncodex: {codex:?}");
        assert!(!claude.is_empty(), "geen claude-aliassen uit de help");
        assert!(!codex.is_empty(), "geen codex-modellen uit de catalogus");
    }

    #[test]
    fn stray_refs_skip_the_runs_that_are_still_active() {
        let refs = concat!(
            "refs/pr-cockpit/aaa-1\n",
            "refs/pr-cockpit/bbb-2\n",
            "refs/pr-cockpit/ccc-3\n",
        );
        let active: HashSet<String> = ["bbb-2".to_string()].into_iter().collect();
        assert_eq!(
            stray_run_ids(refs, &active),
            vec!["aaa-1".to_string(), "ccc-3".to_string()]
        );
    }

    #[test]
    fn stray_refs_ignore_ids_that_could_escape_the_temp_dir() {
        let refs = "refs/pr-cockpit/../../etc\nrefs/heads/main\n";
        assert!(stray_run_ids(refs, &HashSet::new()).is_empty());
    }

    #[test]
    fn unpushed_commits_are_counted_per_line() {
        assert_eq!(count_commits(""), 0);
        assert_eq!(count_commits("   \n"), 0);
        assert_eq!(count_commits("4a91c2e fix\n9b0d1aa test\n"), 2);
    }

    #[test]
    /// GitHub werkt `refs/pull/<n>/head` asynchroon bij, dus direct na een
    /// geslaagde push telt die ref de net gepushte commit nog als lokaal. De
    /// push van HEAD bewijst dat de hele historie remote staat, dus die telling
    /// mag niet meer meewegen: de worktree mag weg en er komt geen valse melding.
    fn a_successful_push_clears_the_worktree_despite_a_stale_pr_ref() {
        let mut consulted = false;
        let reason = keep_reason(PushOutcome::Pushed, || {
            consulted = true;
            Ok(1)
        });
        assert_eq!(reason, None);
        assert!(
            !consulted,
            "na een geslaagde push mag de stale PR-ref niet meer beslissen"
        );
    }

    #[test]
    fn a_failed_push_keeps_the_local_commits_and_the_worktree() {
        let (outcome, line) = push_outcome(true, "feature/x", || Err("non-fast-forward".into()));
        assert_eq!(outcome, PushOutcome::NotPushed);
        assert_eq!(
            line.as_deref(),
            Some("push naar feature/x faalde: non-fast-forward")
        );
        assert_eq!(
            keep_reason(outcome, || Ok(1)).as_deref(),
            Some("1 commit(s) staan alleen lokaal")
        );
    }

    #[test]
    /// De agent commit bewust zonder te pushen (bijvoorbeeld bij rode tests):
    /// geen marker, geen push, en de worktree blijft dus staan.
    fn without_a_push_marker_local_commits_keep_the_worktree() {
        let (outcome, line) = push_outcome(false, "feature/x", || {
            panic!("zonder marker mag er niet gepusht worden")
        });
        assert_eq!(outcome, PushOutcome::NotPushed);
        assert_eq!(line, None);
        assert_eq!(
            keep_reason(outcome, || Ok(2)).as_deref(),
            Some("2 commit(s) staan alleen lokaal")
        );
    }

    #[test]
    fn a_failing_check_keeps_the_worktree() {
        let reason = keep_reason(PushOutcome::NotPushed, || Err("fetch faalde".into()));
        assert_eq!(
            reason.as_deref(),
            Some("kon niet-gepushte commits niet controleren: fetch faalde")
        );
    }

    #[test]
    fn commit_outcome_credits_a_successful_push_with_all_local_commits() {
        assert_eq!(commit_outcome(PushOutcome::Pushed, 3), (3, 0));
    }

    #[test]
    fn commit_outcome_leaves_local_commits_unpushed_without_a_push() {
        assert_eq!(commit_outcome(PushOutcome::NotPushed, 2), (0, 2));
        // Geen lokale commits: dan is er ook niets om als bewaard te melden.
        assert_eq!(commit_outcome(PushOutcome::NotPushed, 0), (0, 0));
    }

    #[test]
    fn truncate_log_keeps_short_logs_intact() {
        assert_eq!(
            truncate_log(b"regel een\nregel twee\n", 1024),
            "regel een\nregel twee\n"
        );
    }

    #[test]
    fn truncate_log_cuts_on_a_line_boundary_and_says_so() {
        let data = b"kop die weg moet\nmiddenregel\nstaart die blijft\n";
        let truncated = truncate_log(data, 20);
        assert!(truncated.starts_with("[log afgekapt tot de laatste 0 MB]\n"));
        assert!(truncated.ends_with("staart die blijft\n"));
        assert!(!truncated.contains("kop die weg moet"));
        // Geen halve regel: de afkap valt altijd net ná een newline.
        assert!(!truncated.contains("iddenregel\nstaart"));
    }

    #[cfg(unix)]
    #[test]
    fn ensure_private_logs_dir_creates_a_fresh_dir_as_owner_only() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};

        let dir = std::env::temp_dir().join("pr-cockpit-test-secure-logs-fresh");
        let _ = std::fs::remove_dir_all(&dir);

        ensure_private_logs_dir(&dir).expect("nieuwe map aanmaken");
        let mode = std::fs::metadata(&dir)
            .expect("metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o700);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn ensure_private_logs_dir_refuses_a_symlink() {
        let dir = std::env::temp_dir().join("pr-cockpit-test-secure-logs-symlink");
        let target = std::env::temp_dir().join("pr-cockpit-test-secure-logs-symlink-target");
        let _ = std::fs::remove_file(&dir);
        let _ = std::fs::remove_dir_all(&target);
        std::fs::create_dir_all(&target).expect("targetmap");
        std::os::unix::fs::symlink(&target, &dir).expect("symlink aanmaken");

        let result = ensure_private_logs_dir(&dir);
        assert!(result.is_err());

        std::fs::remove_file(&dir).ok();
        std::fs::remove_dir_all(&target).ok();
    }

    #[test]
    fn log_lines_are_read_whole_until_the_stream_ends() {
        let mut reader = std::io::Cursor::new("eerste\r\ntweede\nrest zonder newline");
        assert_eq!(read_capped_line(&mut reader).as_deref(), Some("eerste"));
        assert_eq!(read_capped_line(&mut reader).as_deref(), Some("tweede"));
        assert_eq!(
            read_capped_line(&mut reader).as_deref(),
            Some("rest zonder newline")
        );
        assert_eq!(read_capped_line(&mut reader), None);
    }

    #[test]
    fn an_endless_log_line_is_capped_and_the_next_line_survives() {
        let huge = "x".repeat(MAX_LINE_BYTES * 3);
        let mut reader = std::io::Cursor::new(format!("{huge}\nnormaal\n"));
        let capped = read_capped_line(&mut reader).expect("regel");
        assert!(capped.starts_with(&"x".repeat(MAX_LINE_BYTES)));
        assert!(capped.contains("regel afgekapt"));
        assert!(capped.len() < MAX_LINE_BYTES + 100);
        assert_eq!(read_capped_line(&mut reader).as_deref(), Some("normaal"));
    }

    #[test]
    fn unparseable_codex_output_yields_nothing() {
        assert!(parse_codex_models("Unknown subcommand: models").is_empty());
        assert!(parse_codex_models("{}").is_empty());
    }

    #[test]
    fn log_buffer_caps_at_the_configured_size() {
        let mut log: Vec<String> = Vec::new();
        push_capped(&mut log, &["a".to_string(), "b".to_string()], 3);
        assert_eq!(log, vec!["a".to_string(), "b".to_string()]);
        push_capped(&mut log, &["c".to_string(), "d".to_string()], 3);
        // De oudste regels vallen eraf, alleen de laatste `cap` blijven over.
        assert_eq!(log, vec!["b".to_string(), "c".to_string(), "d".to_string()]);
    }

    #[test]
    fn run_snapshot_serializes_camel_case_and_lowercase_status() {
        let snapshot = RunSnapshot {
            run_id: "abc".to_string(),
            pr_key: "linku/webshop#42".to_string(),
            agent: "claude".to_string(),
            mode: "withFixes".to_string(),
            status: RunStatus::Done,
            lines: vec!["klaar".to_string()],
            exit_code: Some(0),
            started_at: 7,
            pushed_commits: 2,
            unpushed_commits: 0,
            kept_worktree: None,
        };
        let json = serde_json::to_string(&snapshot).expect("serialize");
        assert!(json.contains("\"runId\":\"abc\""));
        assert!(json.contains("\"prKey\":\"linku/webshop#42\""));
        assert!(json.contains("\"status\":\"done\""));
        assert!(json.contains("\"startedAt\":7"));
        assert!(json.contains("\"exitCode\":0"));
        assert!(json.contains("\"pushedCommits\":2"));
        assert!(json.contains("\"unpushedCommits\":0"));
        assert!(json.contains("\"keptWorktree\":null"));
    }

    fn test_run_info(status: RunStatus, started_at: u64) -> RunInfo {
        RunInfo {
            pid: None,
            cancelled: false,
            cleaned: false,
            repo_path: PathBuf::from("/tmp/repo"),
            worktree: PathBuf::from("/tmp/worktree"),
            repo_id: "linku/webshop".to_string(),
            pr_number: 1,
            agent: "claude".to_string(),
            mode: "withFixes".to_string(),
            status,
            exit_code: None,
            started_at,
            log: Vec::new(),
            pushed_commits: 0,
            unpushed_commits: 0,
            kept_worktree: None,
        }
    }

    #[test]
    fn claim_cleanup_succeeds_exactly_once() {
        let mut run = test_run_info(RunStatus::Running, 0);
        assert!(claim_cleanup_entry(Some(&mut run)));
        assert!(run.cleaned);
        // Een tweede claim (bv. de andere kant van de race) vindt hem al geclaimd.
        assert!(!claim_cleanup_entry(Some(&mut run)));
    }

    #[test]
    fn claim_cleanup_skips_a_missing_run() {
        assert!(!claim_cleanup_entry(None));
    }

    #[test]
    fn prune_finished_runs_never_touches_running_runs() {
        let mut runs: HashMap<String, RunInfo> = HashMap::new();
        for i in 0..25u64 {
            runs.insert(format!("done-{i}"), test_run_info(RunStatus::Done, i));
        }
        // Oudste van allemaal, maar nog lopend: mag nooit gesnoeid worden.
        runs.insert(
            "still-running".to_string(),
            test_run_info(RunStatus::Running, 0),
        );

        prune_finished_runs(&mut runs);

        assert!(runs.contains_key("still-running"));
        assert_eq!(runs.len(), MAX_FINISHED_RUNS + 1);
        // De 5 oudste afgeronde runs (25 - cap van 20) zijn weg, de rest bleef staan.
        for i in 0..5 {
            assert!(!runs.contains_key(&format!("done-{i}")));
        }
        for i in 5..25 {
            assert!(runs.contains_key(&format!("done-{i}")));
        }
    }

    #[test]
    fn prune_finished_runs_is_a_noop_under_the_cap() {
        let mut runs: HashMap<String, RunInfo> = HashMap::new();
        for i in 0..5u64 {
            runs.insert(format!("done-{i}"), test_run_info(RunStatus::Done, i));
        }
        prune_finished_runs(&mut runs);
        assert_eq!(runs.len(), 5);
    }

    #[test]
    fn started_at_is_monotonically_increasing() {
        let first = next_started_at();
        let second = next_started_at();
        assert!(second > first);
    }
}

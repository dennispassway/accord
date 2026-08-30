use crate::agents::run_git;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Zelfde trust boundary als `start_agent_review` (agents.rs): het repo-pad komt
/// uit de webview, dus alleen een absoluut pad met een echte `.git` accepteren.
fn checked_repo_path(repo_path: &str) -> Result<PathBuf, String> {
    let repo_path = PathBuf::from(repo_path);
    if !repo_path.is_absolute() {
        return Err("repo-pad moet absoluut zijn".to_string());
    }
    if !repo_path.join(".git").exists() {
        return Err(format!("{} is geen git-repo", repo_path.to_string_lossy()));
    }
    Ok(repo_path)
}

/// Eigen submap onder de temp-dir in plaats van `pr-cockpit/<run_id>`: de
/// stray-sweep in agents.rs herkent strays uitsluitend via `refs/pr-cockpit/*`
/// (zie `stray_run_ids`), en deze rebase-worktrees maken nooit zo'n ref aan.
/// Ze zouden dus nooit als stray herkend worden, maar de aparte map voorkomt
/// elke twijfel daarover en houdt de twee opruimroutines onafhankelijk.
fn temp_worktree_path(branch: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let safe_branch: String = branch
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    std::env::temp_dir().join(format!("accord-stack-{safe_branch}-{nanos}"))
}

fn cleanup_worktree(repo_path: &Path, worktree: &Path) {
    let _ = run_git(
        repo_path,
        &["worktree", "remove", "--force", &worktree.to_string_lossy()],
    );
    let _ = fs::remove_dir_all(worktree);
    let _ = run_git(repo_path, &["worktree", "prune"]);
}

/// Sha's en refnamen komen uit de webview en belanden in git-argv; weiger alles
/// wat git als optie zou kunnen lezen (argument injection via een `-`-prefix).
fn checked_sha(value: &str, label: &str) -> Result<(), String> {
    let is_hex = value.chars().all(|c| c.is_ascii_hexdigit());
    if value.len() < 4 || value.len() > 64 || !is_hex {
        return Err(format!("{label} is geen geldige sha"));
    }
    Ok(())
}

fn checked_ref_name(value: &str, label: &str) -> Result<(), String> {
    let has_bad_char = value
        .chars()
        .any(|c| c.is_whitespace() || c.is_ascii_control());
    if value.is_empty() || value.starts_with('-') || has_bad_char {
        return Err(format!("{label} is geen geldige refnaam"));
    }
    Ok(())
}

fn resolve_branch_shas_impl(
    repo_path: &Path,
    branches: &[String],
) -> Result<HashMap<String, String>, String> {
    for branch in branches {
        checked_ref_name(branch, "branch")?;
    }
    run_git(repo_path, &["fetch", "origin"])?;
    let mut result = HashMap::new();
    for branch in branches {
        let sha = run_git(repo_path, &["rev-parse", &format!("origin/{branch}")])
            .map_err(|_| format!("onbekende branch: {branch}"))?;
        result.insert(branch.clone(), sha);
    }
    Ok(result)
}

fn rebase_stack_branch_impl(
    repo_path: &Path,
    branch: &str,
    old_base_sha: &str,
    expected_head_sha: &str,
    new_base: &str,
) -> Result<String, String> {
    checked_ref_name(branch, "branch")?;
    checked_ref_name(new_base, "new_base")?;
    checked_sha(old_base_sha, "old_base_sha")?;
    checked_sha(expected_head_sha, "expected_head_sha")?;
    run_git(repo_path, &["fetch", "origin"])?;
    // Bestaat new_base niet, dan is dit een setupfout en geen conflict: Err
    // vóór er een worktree bestaat, zodat origin sowieso onaangeroerd blijft.
    run_git(repo_path, &["rev-parse", &format!("origin/{new_base}")])
        .map_err(|_| format!("onbekende new_base branch: {new_base}"))?;

    let worktree = temp_worktree_path(branch);
    run_git(
        repo_path,
        &[
            "worktree",
            "add",
            "--detach",
            &worktree.to_string_lossy(),
            &format!("origin/{branch}"),
        ],
    )?;

    let rebase = run_git(
        &worktree,
        &["rebase", "--onto", &format!("origin/{new_base}"), old_base_sha],
    );
    if rebase.is_err() {
        let _ = run_git(&worktree, &["rebase", "--abort"]);
        cleanup_worktree(repo_path, &worktree);
        return Ok("conflict".to_string());
    }

    let lease = format!("--force-with-lease={branch}:{expected_head_sha}");
    let push = run_git(
        &worktree,
        &["push", &lease, "origin", &format!("HEAD:refs/heads/{branch}")],
    );
    cleanup_worktree(repo_path, &worktree);
    match push {
        Ok(_) => Ok("rebased".to_string()),
        Err(e) => Err(format!("push mislukte (waarschijnlijk een verlopen lease): {e}")),
    }
}

#[tauri::command]
pub async fn resolve_branch_shas(
    repo_path: String,
    branches: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo_path = checked_repo_path(&repo_path)?;
        resolve_branch_shas_impl(&repo_path, &branches)
    })
    .await
    .map_err(|e| format!("kon de branches niet ophalen: {e}"))?
}

#[tauri::command]
pub async fn rebase_stack_branch(
    repo_path: String,
    branch: String,
    old_base_sha: String,
    expected_head_sha: String,
    new_base: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo_path = checked_repo_path(&repo_path)?;
        rebase_stack_branch_impl(&repo_path, &branch, &old_base_sha, &expected_head_sha, &new_base)
    })
    .await
    .map_err(|e| format!("kon de rebase niet uitvoeren: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    /// Bare "origin" plus een clone ernaast, beide opgeruimd via Drop. `sh` geeft
    /// stdout terug en faalt hard (assert) bij een niet-nul exitcode, zodat een
    /// kapotte testset-up niet als een stille lege string doorsijpelt.
    struct TestRepo {
        origin: PathBuf,
        clone: PathBuf,
    }

    impl TestRepo {
        fn new(name: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let base = std::env::temp_dir().join(format!("accord-stacks-test-{name}-{nanos}"));
            let origin = base.join("origin.git");
            let clone = base.join("clone");
            fs::create_dir_all(&origin).unwrap();
            let out = Command::new("git")
                .arg("init")
                .arg("--bare")
                .arg(&origin)
                .output()
                .unwrap();
            assert!(out.status.success());
            let out = Command::new("git")
                .arg("clone")
                .arg(&origin)
                .arg(&clone)
                .output()
                .unwrap();
            assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
            let repo = TestRepo { origin, clone };
            repo.sh(&["config", "user.email", "test@example.com"]);
            repo.sh(&["config", "user.name", "Test"]);
            repo.sh(&["config", "advice.detachedHead", "false"]);
            repo
        }

        fn sh(&self, args: &[&str]) -> String {
            let out = Command::new("git")
                .arg("-C")
                .arg(&self.clone)
                .args(args)
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "git {:?} faalde: {}",
                args,
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }

        fn write_and_commit(&self, file: &str, content: &str, message: &str) -> String {
            fs::write(self.clone.join(file), content).unwrap();
            self.sh(&["add", file]);
            self.sh(&["commit", "-m", message]);
            self.sh(&["rev-parse", "HEAD"])
        }

        fn rev_list_count(&self, rev: &str) -> usize {
            self.sh(&["rev-list", "--count", rev]).parse().unwrap()
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(self.origin.parent().unwrap_or(&self.origin));
        }
    }

    #[test]
    fn resolve_branch_shas_returns_origin_heads() {
        let repo = TestRepo::new("resolve");
        repo.sh(&["checkout", "-b", "main"]);
        repo.write_and_commit("readme.txt", "base\n", "initial");
        repo.sh(&["push", "-u", "origin", "main"]);
        let expected = repo.sh(&["rev-parse", "origin/main"]);

        let result = resolve_branch_shas_impl(&repo.clone, &["main".to_string()]).unwrap();
        assert_eq!(result.get("main"), Some(&expected));
    }

    #[test]
    fn resolve_branch_shas_errors_on_unknown_branch() {
        let repo = TestRepo::new("resolve-unknown");
        repo.sh(&["checkout", "-b", "main"]);
        repo.write_and_commit("readme.txt", "base\n", "initial");
        repo.sh(&["push", "-u", "origin", "main"]);

        let result = resolve_branch_shas_impl(&repo.clone, &["nope".to_string()]);
        assert!(result.is_err());
    }

    #[test]
    fn rebase_stack_updates_chain_after_squash_merge_and_drops_duplicates() {
        let repo = TestRepo::new("chain");
        repo.sh(&["checkout", "-b", "main"]);
        repo.write_and_commit("readme.txt", "base\n", "initial");
        repo.sh(&["push", "-u", "origin", "main"]);

        repo.sh(&["checkout", "-b", "A"]);
        repo.write_and_commit("a.txt", "feature a\n", "feature A");
        repo.sh(&["push", "-u", "origin", "A"]);
        let old_a_sha = repo.sh(&["rev-parse", "A"]);

        repo.sh(&["checkout", "-b", "B"]);
        repo.write_and_commit("b.txt", "feature b\n", "feature B");
        repo.sh(&["push", "-u", "origin", "B"]);
        let old_b_sha = repo.sh(&["rev-parse", "B"]);

        repo.sh(&["checkout", "-b", "C"]);
        repo.write_and_commit("c.txt", "feature c\n", "feature C");
        repo.sh(&["push", "-u", "origin", "C"]);
        let old_c_sha = repo.sh(&["rev-parse", "C"]);

        // Simuleer een squash-merge van A in main en verwijder branch A.
        repo.sh(&["checkout", "main"]);
        repo.sh(&["merge", "--squash", "A"]);
        repo.sh(&["commit", "-m", "squash A"]);
        repo.sh(&["push", "origin", "main"]);
        repo.sh(&["push", "origin", "--delete", "A"]);

        let outcome = rebase_stack_branch_impl(&repo.clone, "B", &old_a_sha, &old_b_sha, "main");
        assert_eq!(outcome, Ok("rebased".to_string()));

        repo.sh(&["fetch", "origin"]);
        assert!(Command::new("git")
            .arg("-C")
            .arg(&repo.clone)
            .args(["merge-base", "--is-ancestor", "origin/main", "origin/B"])
            .status()
            .unwrap()
            .success());
        assert_eq!(
            repo.rev_list_count("origin/B"),
            repo.rev_list_count("origin/main") + 1
        );

        let outcome = rebase_stack_branch_impl(&repo.clone, "C", &old_b_sha, &old_c_sha, "B");
        assert_eq!(outcome, Ok("rebased".to_string()));

        repo.sh(&["fetch", "origin"]);
        assert!(Command::new("git")
            .arg("-C")
            .arg(&repo.clone)
            .args(["merge-base", "--is-ancestor", "origin/B", "origin/C"])
            .status()
            .unwrap()
            .success());
        assert_eq!(
            repo.rev_list_count("origin/C"),
            repo.rev_list_count("origin/B") + 1
        );
    }

    #[test]
    fn rebase_stack_returns_conflict_and_leaves_origin_and_worktrees_untouched() {
        let repo = TestRepo::new("conflict");
        repo.sh(&["checkout", "-b", "main"]);
        repo.write_and_commit("shared.txt", "base\n", "initial");
        repo.sh(&["push", "-u", "origin", "main"]);
        let old_main_sha = repo.sh(&["rev-parse", "main"]);

        repo.sh(&["checkout", "-b", "B"]);
        repo.write_and_commit("shared.txt", "base\nB change\n", "B changes shared line");
        repo.sh(&["push", "-u", "origin", "B"]);
        let old_b_sha = repo.sh(&["rev-parse", "B"]);

        repo.sh(&["checkout", "main"]);
        repo.write_and_commit("shared.txt", "base\nmain change\n", "main changes shared line");
        repo.sh(&["push", "origin", "main"]);

        let outcome = rebase_stack_branch_impl(&repo.clone, "B", &old_main_sha, &old_b_sha, "main");
        assert_eq!(outcome, Ok("conflict".to_string()));

        repo.sh(&["fetch", "origin"]);
        let origin_b_after = repo.sh(&["rev-parse", "origin/B"]);
        assert_eq!(origin_b_after, old_b_sha);

        let worktree_list = repo.sh(&["worktree", "list", "--porcelain"]);
        assert_eq!(worktree_list.matches("worktree ").count(), 1);

        let status = repo.sh(&["status", "--porcelain"]);
        assert_eq!(status, "");
    }

    #[test]
    fn rebase_stack_errors_when_new_base_is_unknown_and_leaves_origin_untouched() {
        let repo = TestRepo::new("unknown-base");
        repo.sh(&["checkout", "-b", "main"]);
        repo.write_and_commit("readme.txt", "base\n", "initial");
        repo.sh(&["push", "-u", "origin", "main"]);
        let old_main_sha = repo.sh(&["rev-parse", "main"]);

        repo.sh(&["checkout", "-b", "B"]);
        repo.write_and_commit("b.txt", "feature b\n", "feature B");
        repo.sh(&["push", "-u", "origin", "B"]);
        let old_b_sha = repo.sh(&["rev-parse", "B"]);

        let outcome =
            rebase_stack_branch_impl(&repo.clone, "B", &old_main_sha, &old_b_sha, "geen-bestaande-branch");
        assert!(outcome.is_err());

        repo.sh(&["fetch", "origin"]);
        let origin_b_after = repo.sh(&["rev-parse", "origin/B"]);
        assert_eq!(origin_b_after, old_b_sha);

        let worktree_list = repo.sh(&["worktree", "list", "--porcelain"]);
        assert_eq!(worktree_list.matches("worktree ").count(), 1);
    }

    #[test]
    fn rebase_stack_rejects_option_like_refs_and_non_sha_arguments() {
        // Validatie faalt vóór elke git-aanroep, dus een niet-bestaand pad volstaat.
        let repo = Path::new("/nonexistent");
        let sha = "a".repeat(40);

        let err = rebase_stack_branch_impl(repo, "--upload-pack=evil", &sha, &sha, "main");
        assert!(err.is_err_and(|e| e.contains("refnaam")));

        let err = rebase_stack_branch_impl(repo, "B", &sha, &sha, "-evil");
        assert!(err.is_err_and(|e| e.contains("refnaam")));

        let err = rebase_stack_branch_impl(repo, "B", "--force", &sha, "main");
        assert!(err.is_err_and(|e| e.contains("sha")));

        let err = rebase_stack_branch_impl(repo, "B", &sha, "niet-hex", "main");
        assert!(err.is_err_and(|e| e.contains("sha")));

        let err = resolve_branch_shas_impl(repo, &["--mirror".to_string()]);
        assert!(err.is_err_and(|e| e.contains("refnaam")));
    }

    #[test]
    fn rebase_stack_rejects_stale_lease_without_touching_origin() {
        let repo = TestRepo::new("lease");
        repo.sh(&["checkout", "-b", "main"]);
        repo.write_and_commit("readme.txt", "base\n", "initial");
        repo.sh(&["push", "-u", "origin", "main"]);

        repo.sh(&["checkout", "-b", "A"]);
        repo.write_and_commit("a.txt", "feature a\n", "feature A");
        repo.sh(&["push", "-u", "origin", "A"]);
        let old_a_sha = repo.sh(&["rev-parse", "A"]);

        repo.sh(&["checkout", "-b", "B"]);
        repo.write_and_commit("b.txt", "feature b\n", "feature B");
        repo.sh(&["push", "-u", "origin", "B"]);
        let old_b_sha = repo.sh(&["rev-parse", "B"]);

        // Main schuift door (los van B): de rebase van B onto main hierna is
        // een echte herschrijving (nieuwe sha), zodat de push niet als
        // "up-to-date" wegvalt en de lease-check ook echt geraakt wordt.
        repo.sh(&["checkout", "main"]);
        repo.sh(&["merge", "--squash", "A"]);
        repo.sh(&["commit", "-m", "squash A"]);
        repo.sh(&["push", "origin", "main"]);

        // expected_head_sha wijst hier bewust naar A's oude sha in plaats van
        // B's echte head: de lease moet dit als mismatch afwijzen.
        let outcome = rebase_stack_branch_impl(&repo.clone, "B", &old_a_sha, &old_a_sha, "main");
        assert!(outcome.is_err());

        repo.sh(&["fetch", "origin"]);
        let origin_b_after = repo.sh(&["rev-parse", "origin/B"]);
        assert_eq!(origin_b_after, old_b_sha);
    }
}

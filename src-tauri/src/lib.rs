mod agents;
mod auth;
mod claude_stream;
mod repos;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(agents::AgentRuns::default())
        .setup(|app| {
            tray::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::start_device_login,
            auth::poll_device_login,
            auth::get_token,
            auth::logout,
            repos::scan_projects,
            repos::get_repo_paths,
            repos::set_repo_path,
            repos::remove_repo_path,
            agents::check_agent_clis,
            agents::agent_models,
            agents::start_agent_review,
            agents::cancel_agent_review,
            agents::list_runs,
            tray::update_tray
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            // Afsluiten mag geen agents laten doorlopen: zonder UI pushen die
            // door en laten ze worktrees en refs achter in de repo van de
            // gebruiker. Dekt ook "Afsluiten" in de tray (app.exit(0)).
            if matches!(event, tauri::RunEvent::Exit) {
                agents::stop_all_runs(app);
            }
        });
}

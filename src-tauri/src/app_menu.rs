use tauri::menu::{Menu, MenuItem};
use tauri::{Emitter, Manager};

const CHECK_UPDATES_ID: &str = "check-updates";

/// Het standaardmenu van Tauri, met "Zoek naar updates…" in het app-menu direct
/// onder "Over Accord", zoals Mac-apps dat doen. Aanvullen in plaats van een
/// eigen menu bouwen houdt het Edit-menu (kopiëren/plakken) en Window-menu heel.
pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let menu = Menu::default(handle)?;
    let check = MenuItem::with_id(
        handle,
        CHECK_UPDATES_ID,
        "Zoek naar updates…",
        true,
        None::<&str>,
    )?;
    if let Some(app_submenu) = menu.items()?.first().and_then(|item| item.as_submenu()) {
        // Positie 0 is "Over Accord", daarna volgt de scheidingslijn.
        app_submenu.insert(&check, 1)?;
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() != CHECK_UPDATES_ID {
            return;
        }
        // Accord kan als tray-app verborgen zijn: toon het venster, anders valt
        // de toast of banner met de uitkomst buiten beeld.
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
        let _ = app.emit("menu-check-updates", ());
    });
    Ok(())
}

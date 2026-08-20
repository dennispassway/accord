use serde::Deserialize;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

/// ponytail: single named tray, no support for multiple tray icons.
const TRAY_ID: &str = "main-tray";
const MAX_PR_ITEMS: usize = 8;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayPrItem {
    pub key: String,
    pub label: String,
}

fn build_menu(app: &AppHandle, items: &[TrayPrItem]) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "Accord openen", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Ververs", true, None::<&str>)?;
    let sep_top = PredefinedMenuItem::separator(app)?;
    let pr_items = items
        .iter()
        .take(MAX_PR_ITEMS)
        .map(|item| {
            MenuItem::with_id(
                app,
                item.key.as_str(),
                item.label.as_str(),
                true,
                None::<&str>,
            )
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let sep_bottom = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Afsluiten", true, None::<&str>)?;

    let mut entries: Vec<&dyn IsMenuItem<tauri::Wry>> = vec![&open, &refresh, &sep_top];
    for pr_item in &pr_items {
        entries.push(pr_item);
    }
    entries.push(&sep_bottom);
    entries.push(&quit);

    Menu::with_items(app, &entries)
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "open" => show_main_window(app),
        "refresh" => {
            let _ = app.emit("tray-refresh", ());
        }
        "quit" => app.exit(0),
        key => {
            show_main_window(app);
            let _ = app.emit("tray-select-pr", key);
        }
    }
}

/// Bouwt de menubar-tray met het app-icoon en een leeg PR-menu. Wordt eenmalig
/// aangeroepen tijdens setup; `update_tray` ververst titel en menu-inhoud.
pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let menu = build_menu(app.handle(), &[])?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .on_menu_event(handle_menu_event);
    // macOS: alleen de pijl uit het logo als template-icoon (zwart + alpha),
    // zodat de menubar hem zelf wit of zwart kleurt naar het balkthema.
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .icon(tauri::image::Image::from_bytes(include_bytes!(
                "../icons/tray.png"
            ))?)
            .icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;

    if let Some(window) = app.get_webview_window("main") {
        let window_for_close = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // App blijft in de menubar draaien: verbergen in plaats van sluiten.
                api.prevent_close();
                let _ = window_for_close.hide();
            }
        });
    }

    Ok(())
}

/// Zet het aantal op de tray-titel (leeg bij 0) en herbouwt het menu met de
/// meegegeven PR-items (max 8, menu-id = key).
#[tauri::command]
pub fn update_tray(app: AppHandle, count: u32, items: Vec<TrayPrItem>) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "tray-icoon niet gevonden".to_string())?;
    let title = if count == 0 {
        String::new()
    } else {
        count.to_string()
    };
    tray.set_title(Some(title)).map_err(|e| e.to_string())?;

    let menu = build_menu(&app, &items).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    Ok(())
}

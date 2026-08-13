// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMABuf-renderer faalt op nogal wat Linux-setups (Wayland +
    // Intel iGPU) met "Could not create default EGL display:
    // EGL_BAD_PARAMETER. Aborting...", waarna de webview niets meer tekent.
    // Zet de bekende workaround zelf, tenzij de gebruiker hem al koos.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    accord_lib::run()
}

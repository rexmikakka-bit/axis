#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();
  // ESI login comes back as eveauth-visviva://auth-callback?code=… (the phone's callback, already
  // registered on the EVE application). On Windows the OS answers a link by LAUNCHING the app with
  // it as an argument; single-instance (first, as its docs require) hands that to the window already
  // open instead of a second copy, and its deep-link feature re-emits it as a deep-link event, which
  // src/desktop/esi-desktop.js listens for. A second launch with no link just raises the window.
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      use tauri::Manager;
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
      }
    }));
  }
  builder
    .plugin(tauri_plugin_deep_link::init())
    // Requests from Rust, where CORS does not apply: mutamarket.com sends no CORS headers, so a
    // webview fetch to it is refused. Scoped to its API in capabilities/default.json.
    .plugin(tauri_plugin_http::init())
    // Links out (MutaMarket listings) in the system browser: the webview refuses window.open.
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      // Point the eveauth-visviva scheme at THIS executable. An installer registers it at install
      // time; a dev build or a moved install would otherwise leave Windows launching a stale path.
      #[cfg(any(windows, target_os = "linux"))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        if let Err(e) = app.deep_link().register_all() {
          log::warn!("could not register the eveauth-visviva link handler: {e}");
        }
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

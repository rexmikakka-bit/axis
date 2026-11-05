#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Requests from Rust, where CORS does not apply: mutamarket.com sends no CORS headers, so a
    // webview fetch to it is refused. Scoped to its API in capabilities/default.json.
    .plugin(tauri_plugin_http::init())
    // Links out (MutaMarket listings) in the system browser: the webview refuses window.open.
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
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

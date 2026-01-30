mod commands;
mod crypto;
pub mod kiosk;

use commands::*;

use tauri::Manager; // Import Manager trait

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.maximize().unwrap();
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            decrypt_exam_file,
            encrypt_result_file,
            get_device_id,
            generate_credential_file,
            create_exam_result_file,
            enter_kiosk_mode,
            exit_kiosk_mode
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use serde::{Deserialize, Serialize};
use crate::crypto;
use std::io::Write;
use zip::write::{FileOptions, ZipWriter};
use zip::CompressionMethod;
use std::fs;
use dirs;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExamData {
    pub id: i32,
    pub title: String,
    pub description: Option<String>,
    pub course_id: Option<i32>,
    pub course_title: String,
    pub course_description: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub start_password: Option<String>,
    pub end_password: Option<String>,
    pub allowed_attempts: Option<i32>,
    pub time_limit: Option<i32>,
    pub duration_minutes: Option<i32>,
    pub allowed_students: Vec<AllowedStudent>,
    pub questions: Vec<Question>,
    pub config_password: String,
    // Exam settings
    pub sequential: Option<bool>,
    pub shuffle_options: Option<bool>,
    pub shuffle_questions: Option<bool>,
    pub enable_proctoring: Option<bool>,
    pub enable_review: Option<bool>,
    pub show_grade: Option<bool>,
    pub cheating_limit: Option<i32>,
    pub passing_grade: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AllowedStudent {
    pub nim: String,
    pub name: String,
    pub device_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Question {
    pub id: i32,
    pub question: String,
    pub type_: String,
    pub options: Option<Vec<serde_json::Value>>,
    pub correct_answer: Option<serde_json::Value>,
    pub point: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DecryptResult {
    pub message: String,
    pub data: Option<ExamData>,
}

#[tauri::command]
pub async fn decrypt_exam_file(
    file_base64: String,
    password: String,
) -> Result<DecryptResult, String> {
    let decrypted_data = crypto::decrypt_exam_file(&file_base64, &password)?;

    match serde_json::from_str::<ExamData>(&decrypted_data) {
        Ok(exam_data) => Ok(DecryptResult {
            message: "success".to_string(),
            data: Some(exam_data),
        }),
        Err(_) => Ok(DecryptResult {
            message: "Wrong Password".to_string(),
            data: None,
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptResult {
    pub encrypted_data: Vec<u8>,
    pub filename: String,
}

#[tauri::command]
pub async fn encrypt_result_file(
    data: String,
    password: String,
) -> Result<EncryptResult, String> {
    let result = crypto::encrypt_result_file(&data, &password)?;
    Ok(result)
}

#[tauri::command]
pub fn get_device_id() -> Result<String, String> {
    let uuid = uuid::Uuid::new_v4();
    Ok(uuid.to_string())
}

#[tauri::command]
pub async fn generate_credential_file(
    _data: String,
) -> Result<String, String> {
    // TODO: Implement credential file generation
    Ok("Credential file generated".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateExamResultFileRequest {
    pub username: String,
    pub exam: serde_json::Value,
    pub answer: serde_json::Value,
    pub questions: Vec<serde_json::Value>,
    pub proctoring_log: Option<Vec<serde_json::Value>>,
    pub submit_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateExamResultFileResponse {
    pub message: String,
    pub data: Option<Vec<u8>>,
    pub filename: String,
    pub file_path: String, // Full path to saved file
}

#[tauri::command]
pub async fn create_exam_result_file(
    data: String,
) -> Result<CreateExamResultFileResponse, String> {
    // Parse JSON data
    let json_data: CreateExamResultFileRequest = serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Get documents directory
    let documents_dir = dirs::document_dir()
        .ok_or("Failed to get documents directory")?;
    
    let honestest_dir = documents_dir.join("honestest");
    let temp_dir = honestest_dir.join("temp_exam_result");
    let results_dir = honestest_dir.join("exam_results");

    // Create directories if they don't exist
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    fs::create_dir_all(&results_dir)
        .map_err(|e| format!("Failed to create results directory: {}", e))?;

    // Generate filename
    let exam_title = json_data.exam.get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("exam");
    let course_title = json_data.exam.get("course_title")
        .and_then(|v| v.as_str())
        .unwrap_or("course");
    
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    let filename = format!(
        "{}_{}_result_{}.ta01r",
        course_title.replace("/", "_").replace("\\", "_"),
        exam_title.replace("/", "_").replace("\\", "_"),
        timestamp
    );

    // Write data.json to temp directory
    let data_json_path = temp_dir.join("data.json");
    fs::write(&data_json_path, &data)
        .map_err(|e| format!("Failed to write data.json: {}", e))?;

    // Create zip file
    // Note: zip crate 0.6 doesn't support AES encryption directly
    // For now, we'll create a regular zip file
    // TODO: Consider using 7z command line tool or different library for password encryption
    let zip_path = results_dir.join(&filename);
    let zip_file = fs::File::create(&zip_path)
        .map_err(|e| format!("Failed to create zip file: {}", e))?;

    let mut zip = ZipWriter::new(zip_file);
    
    // Create file options with compression
    let options = FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o755);

    // Add data.json to zip
    zip.start_file("data.json", options)
        .map_err(|e| format!("Failed to add file to zip: {}", e))?;
    zip.write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to zip: {}", e))?;

    // Finish zip
    zip.finish()
        .map_err(|e| format!("Failed to finish zip: {}", e))?;

    // Read the zip file
    let zip_data = fs::read(&zip_path)
        .map_err(|e| format!("Failed to read zip file: {}", e))?;

    // Clean up temp directory
    let _ = fs::remove_dir_all(&temp_dir);

    Ok(CreateExamResultFileResponse {
        message: "success".to_string(),
        data: Some(zip_data),
        filename: filename.clone(),
        file_path: zip_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn enter_kiosk_mode(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        // Use fullscreen to prevent dragging/shrinking the window
        // This removes the Title Bar, but ensures security
        // 1. Fullscreen and locked styling
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
        window.set_resizable(false).map_err(|e| e.to_string())?;
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
        window.set_decorations(false).map_err(|e| e.to_string())?; 
        window.set_focus().map_err(|e| e.to_string())?;

        // 2. Continuous Focus Enforcement Loop to steal focus back if Virtual Desktop switch somehow bypassed hooks
        crate::kiosk::set_kiosk_active(true);
        let focus_window = window.clone();
        std::thread::spawn(move || {
            while crate::kiosk::is_kiosk_active() {
                // Return to focus if moved
                let is_focused = focus_window.is_focused().unwrap_or(false);
                if !is_focused {
                    let _ = focus_window.set_focus();
                }
                
                // Sleep to avoid CPU pegging
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        });

        // 3. Block keyboard shortcuts - Must run on main thread for the hook to work properly
        let _ = app_handle.run_on_main_thread(move || {
            crate::kiosk::close_other_windows();
            if let Err(e) = crate::kiosk::start_keyboard_hook() {
                eprintln!("Failed to start keyboard hook: {}", e);
            }
            if let Err(e) = crate::kiosk::disable_touchpad_gestures() {
                eprintln!("Failed to disable touchpad gestures: {}", e);
            }
        });
        
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

#[tauri::command]
pub async fn exit_kiosk_mode(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        // Disengage the focus enforcer
        crate::kiosk::set_kiosk_active(false);

        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        window.set_decorations(true).map_err(|e| e.to_string())?;
        window.maximize().map_err(|e| e.to_string())?;
        window.set_resizable(true).map_err(|e| e.to_string())?;
        window.set_always_on_top(false).map_err(|e| e.to_string())?;
        
        // Unblock keyboard shortcuts
        let _ = app_handle.run_on_main_thread(move || {
            crate::kiosk::stop_keyboard_hook();
            if let Err(e) = crate::kiosk::enable_touchpad_gestures() {
                eprintln!("Failed to enable touchpad gestures: {}", e);
            }
        });

        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}


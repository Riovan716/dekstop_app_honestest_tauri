use aes::Aes256;
use ctr::cipher::{KeyIvInit, StreamCipher};
use sha2::{Sha256, Digest as ShaDigest};
use base64::{Engine as _, engine::general_purpose};
use crate::commands::EncryptResult;

type Aes256Ctr = ctr::Ctr64BE<Aes256>;

pub fn decrypt_exam_file(file_base64: &str, password: &str) -> Result<String, String> {
    // Remove data URL prefix if present
    let base64_data = if file_base64.contains(',') {
        file_base64.split(',').nth(1).unwrap_or(file_base64)
    } else {
        file_base64
    };

    // Decode base64
    let encrypted_bytes = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    // Derive key from password using SHA256 (first 32 bytes)
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let key_hash = hasher.finalize();
    let key: [u8; 32] = key_hash[..32].try_into()
        .map_err(|_| "Key derivation failed")?;

    // Derive IV from "ta01" using MD5 (16 bytes)
    let iv_hash = md5::compute(b"ta01");
    let iv: [u8; 16] = iv_hash.0;

    // Decrypt using AES-256-CTR
    let key = cipher::generic_array::GenericArray::from_slice(&key);
    let iv = cipher::generic_array::GenericArray::from_slice(&iv);
    let mut cipher = Aes256Ctr::new(key, iv);
    let mut decrypted_bytes = encrypted_bytes.clone();
    cipher.apply_keystream(&mut decrypted_bytes);

    // Convert to UTF-8 string
    String::from_utf8(decrypted_bytes)
        .map_err(|e| format!("UTF-8 decode error: {}", e))
}

pub fn encrypt_result_file(data: &str, password: &str) -> Result<EncryptResult, String> {
    // Derive key from password using SHA256 (first 32 bytes)
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let key_hash = hasher.finalize();
    let key: [u8; 32] = key_hash[..32].try_into()
        .map_err(|_| "Key derivation failed")?;

    // Derive IV from "ta01" using MD5 (16 bytes)
    let iv_hash = md5::compute(b"ta01");
    let iv: [u8; 16] = iv_hash.0;

    // Encrypt using AES-256-CTR
    let key = cipher::generic_array::GenericArray::from_slice(&key);
    let iv = cipher::generic_array::GenericArray::from_slice(&iv);
    let mut cipher = Aes256Ctr::new(key, iv);
    let mut encrypted_bytes = data.as_bytes().to_vec();
    cipher.apply_keystream(&mut encrypted_bytes);

    // Generate filename with timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let filename = format!("exam_result_{}.ta01r", timestamp);

    Ok(EncryptResult {
        encrypted_data: encrypted_bytes,
        filename,
    })
}


/**
 * File utility functions
 */

/**
 * Convert File to base64 string
 * @param {File} file - File to convert
 * @returns {Promise<string>} Base64 string with data URL prefix
 */
export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Convert Blob to File
 * @param {Blob} blob - Blob to convert
 * @param {string} filename - Filename for the File
 * @returns {File} File object
 */
export function blobToFile(blob, filename) {
  return new File([blob], filename, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

/**
 * Download file from URL
 * @param {string} url - URL to download from
 * @param {string} filename - Filename for downloaded file
 */
export async function downloadFile(url, filename) {
  const response = await fetch(url);
  const blob = await response.blob();
  const fileUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = fileUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(fileUrl);
}


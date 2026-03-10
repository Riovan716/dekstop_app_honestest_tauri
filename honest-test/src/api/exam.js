import { apiRequest, apiFetch } from './client.js';

/**
 * Get exam by ID
 * @param {number} id - Exam ID
 * @returns {Promise<Object>} Response with exam data
 */
export async function getExamById(id) {
  const response = await apiRequest(`/exam/${id}`);
  return response;
}

/**
 * Download exam config file (.ta12)
 * @param {number} id - Exam ID
 * @returns {Promise<Blob>} Exam config file as blob
 */
export async function downloadExamConfigFile(id) {
  const response = await apiFetch(`/exam/generate-file?id=${id}`, {
    method: 'GET',
    useAuth: false, // Endpoint ini tidak memerlukan auth berdasarkan dokumentasi
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to download exam file' }));
    throw new Error(error.error || `Request failed (${response.status})`);
  }

  // File .ta12 contains base64 string as text, so read as text first
  const text = await response.text();
  // Convert text to blob for File object
  return new Blob([text], { type: 'text/plain' });
}

/**
 * Submit exam result file (.ta12r)
 * @param {File} resultFile - Exam result file
 * @param {number} examId - Exam ID
 * @returns {Promise<Object>} Response data
 */
export async function submitExamResult(resultFile, examId) {
  console.log('Submitting exam result:', {
    filename: resultFile.name,
    size: resultFile.size,
    type: resultFile.type,
    examId,
  });

  const formData = new FormData();
  formData.append('result_file', resultFile);
  // Also append exam_id as form field for compatibility
  formData.append('exam_id', examId.toString());

  try {
    const response = await apiRequest(`/exam/submit?id=${examId}`, {
      method: 'POST',
      body: formData,
      isFormData: true,
      useAuth: false, // Submit endpoint might not require auth
    });

    console.log('Submit response:', response);
    return response;
  } catch (error) {
    console.error('Error in submitExamResult:', error);
    throw error;
  }
}

/**
 * Get all exams
 * @param {Object} params - Query parameters
 * @param {number} [params.course_id] - Filter by course ID
 * @param {string} [params.uploader] - Filter by uploader username
 * @param {string} [params.search] - Search term
 * @returns {Promise<Object>} Response with exams array
 */
export async function getAllExams(params = {}) {
  const queryParams = new URLSearchParams();
  if (params.course_id) queryParams.append('course_id', params.course_id.toString());
  if (params.uploader) queryParams.append('uploader', params.uploader);
  if (params.search) queryParams.append('search', params.search);

  const queryString = queryParams.toString();
  const path = `/exam${queryString ? `?${queryString}` : ''}`;

  const response = await apiRequest(path);
  return response;
}

/**
 * Check if NIM exists in allowed_students for a course
 * @param {string} nim - Student NIM
 * @param {number} courseId - Course ID
 * @returns {Promise<Object>} Response with exists boolean
 */
export async function checkNimInCourse(nim, courseId) {
  const queryParams = new URLSearchParams();
  queryParams.append('nim', nim);
  queryParams.append('course_id', courseId.toString());

  const response = await apiRequest(`/allowed-student/check?${queryParams.toString()}`, {
    method: 'GET',
    useAuth: false,
  });

  return response;
}

/**
 * Get number of attempts for a student in an exam
 * @param {number} examId - Exam ID
 * @param {string} nim - Student NIM
 * @returns {Promise<number>} Number of attempts
 */
export async function getStudentExamAttempts(examId, nim) {
  const queryParams = new URLSearchParams();
  queryParams.append('exam', examId.toString());
  queryParams.append('user_username', nim);

  const response = await apiRequest(`/exam-result?${queryParams.toString()}`, {
    method: 'GET',
    useAuth: false,
  });

  if (response.data && Array.isArray(response.data)) {
    return response.data.length;
  }
  return 0;
}

/**
 * Get exam attempts history for a student
 * @param {number} examId - Exam ID
 * @param {string} nim - Student NIM
 * @returns {Promise<Array>} Array of attempts
 */
export async function getStudentExamHistory(examId, nim) {
  const queryParams = new URLSearchParams();
  queryParams.append('exam', examId.toString());
  queryParams.append('user_username', nim);

  const response = await apiRequest(`/exam-result?${queryParams.toString()}`, {
    method: 'GET',
    useAuth: false,
  });

  return response.data || [];
}


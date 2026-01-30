import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { load } from '@tauri-apps/plugin-store';
import { checkNimInCourse } from '../api/exam.js';
import logo from '../assets/logo.png';
import exitIcon from '../assets/exit.png';
import batteryIcon from '../assets/baterai.png';
import './WaitingPage.css';

export default function WaitingPage() {
  const [examData, setExamData] = useState(null);
  const [showStartPasswordModal, setShowStartPasswordModal] = useState(false);
  const [startPassword, setStartPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadExamData();
  }, []);

  const loadExamData = async () => {
    try {
      const store = await load('store.json');
      const data = await store.get('exam-data');

      if (!data) {
        console.warn('No exam data found');
        navigate('/main');
        return;
      }

      console.log('Loaded exam data:', data);
      console.log('Course title:', data.course_title);
      console.log('Exam title:', data.title);
      console.log('Allowed attempts:', data.allowed_attempts);
      console.log('Time limit (seconds):', data.time_limit, 'Duration (minutes):', data.duration_minutes);
      console.log('Start date:', data.start_date);
      console.log('End date:', data.end_date);

      // Ensure data structure is correct
      // time_limit is in seconds, duration_minutes is in minutes
      let durationInMinutes = null;
      if (data.duration_minutes !== null && data.duration_minutes !== undefined) {
        durationInMinutes = data.duration_minutes;
      } else if (data.time_limit !== null && data.time_limit !== undefined) {
        // Convert seconds to minutes
        durationInMinutes = Math.floor(data.time_limit / 60);
      }

      const formattedData = {
        ...data,
        course_id: data.course_id || null,
        course_title: data.course_title || data.course?.title || '',
        course_description: data.course_description || data.course?.description || '',
        title: data.title || data.name || '',
        allowed_attempts: data.allowed_attempts ?? data.attempts_allowed ?? null,
        duration_minutes: durationInMinutes,
        time_limit: data.time_limit ?? null,
        start_date: data.start_date || '',
        end_date: data.end_date || '',
        start_password: data.start_password || null,
        allowed_students: data.allowed_students || [],
      };

      console.log('Formatted data:', formattedData);
      setExamData(formattedData);
    } catch (error) {
      console.error('Error loading exam data:', error);
      navigate('/main');
    }
  };

  const handleStartExam = () => {
    setShowStartPasswordModal(true);
  };

  const handleSubmitStartPassword = async () => {
    // Check if password is required
    if (examData && examData.start_password) {
      // Password is required
      if (!startPassword || startPassword.trim() === '') {
        setPasswordError('Please enter start password');
        return;
      }

      if (startPassword.trim() === examData.start_password) {
        // Password correct, check if NIM is in allowed_students
        await checkNimAndNavigate();
      } else {
        setPasswordError('Incorrect password');
      }
    } else {
      // No password required, check NIM and navigate
      await checkNimAndNavigate();
    }
  };

  const checkNimAndNavigate = async () => {
    try {
      // Check if current time is within start_date and end_date range
      const now = new Date();

      if (examData.start_date) {
        const startDate = new Date(examData.start_date);
        if (now < startDate) {
          setPasswordError(`Exam has not started yet. It will start on ${formatDate(examData.start_date)}.`);
          return;
        }
      }

      if (examData.end_date) {
        const endDate = new Date(examData.end_date);
        if (now >= endDate) {
          setPasswordError(`Exam has ended. It closed on ${formatDate(examData.end_date)}.`);
          return;
        }
      }

      // Load user data
      const store = await load('store.json');
      const nim = await store.get('user-nim');

      if (!nim) {
        setPasswordError('NIM not found. Please go back to welcome page.');
        return;
      }

      // Check if course_id exists in exam data
      if (!examData.course_id) {
        // If course_id not available, check in allowed_students list from exam data
        if (examData.allowed_students && Array.isArray(examData.allowed_students)) {
          const isAllowed = examData.allowed_students.some(
            (student) => student.nim === nim
          );

          if (!isAllowed) {
            setPasswordError('You are not permitted to take this exam. You have not yet enrolled in this course.');
            return;
          }
        } else {
          // If no allowed_students list, allow (for backward compatibility)
          console.warn('No course_id or allowed_students list found, allowing access');
        }
      } else {
        // Check via API
        try {
          const response = await checkNimInCourse(nim, examData.course_id);

          if (!response.exists) {
            setPasswordError('You are not permitted to take this exam. You have not yet enrolled in this course.');
            return;
          }
        } catch (error) {
          console.error('Error checking NIM:', error);
          // If API fails, check in allowed_students list from exam data as fallback
          if (examData.allowed_students && Array.isArray(examData.allowed_students)) {
            const isAllowed = examData.allowed_students.some(
              (student) => student.nim === nim
            );

            if (!isAllowed) {
              setPasswordError('You are not permitted to take this exam. You have not yet enrolled in this course.');
              return;
            }
          } else {
            // If API fails and no fallback, show error
            setPasswordError('Failed to verify enrollment. Please try again or contact administrator.');
            return;
          }
        }
      }

      // All checks passed, navigate to exam page
      navigate('/exam');
    } catch (error) {
      console.error('Error checking NIM:', error);
      setPasswordError('Failed to verify enrollment. Please try again.');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString || dateString === '' || dateString === 'null') return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return '-';
    }
  };

  const formatTimeLimit = (minutes) => {
    if (minutes === null || minutes === undefined || minutes === 0) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const secs = 0;

    if (hours > 0) {
      return `${hours} hours, ${mins} minutes, ${secs} seconds`;
    }
    return `${mins} minutes, ${secs} seconds`;
  };

  if (!examData) {
    return (
      <div className="waiting-page">
        <div className="loading-container">
          <p>Loading exam data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="waiting-page">
      <div className="waiting-content">
        <h1 className="main-title">Course : {examData.course_title || examData.course?.title || 'N/A'}</h1>

        <p className="description-text">
          {examData.course_description || examData.course?.description || examData.description || 'No description available for this course. Please contact your instructor for more details or if you believe this is an error.'}
        </p>

        <h2 className="sub-title">{examData.title || examData.name || 'N/A'}</h2>

        <div className="details-container">
          <div className="details-table">
            <div className="detail-row">
              <span className="detail-label">Attempts allowed</span>
              <span className="detail-separator">:</span>
              <span className="detail-value">
                {(examData.allowed_attempts !== undefined && examData.allowed_attempts !== null)
                  ? examData.allowed_attempts
                  : (examData.attempts_allowed !== undefined && examData.attempts_allowed !== null)
                    ? examData.attempts_allowed
                    : '-'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">This quiz started on</span>
              <span className="detail-separator">:</span>
              <span className="detail-value">{formatDate(examData.start_date)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">This quiz closed on</span>
              <span className="detail-separator">:</span>
              <span className="detail-value">{formatDate(examData.end_date)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Time Limit</span>
              <span className="detail-separator">:</span>
              <span className="detail-value">{formatTimeLimit(examData.duration_minutes)}</span>
            </div>
          </div>
        </div>

        <div className="action-container">
          <button className="btn-start-exam" onClick={handleStartExam}>
            Start Exam
          </button>
        </div>
      </div>

      <div className="page-footer">
        <div className="footer-logo">
          <img src={logo} alt="Logo" className="footer-logo-img" />
        </div>
        <div className="footer-right">
          <div className="status-badge">
            <img src={batteryIcon} alt="Battery" className="status-icon-img" />
            <span>100%</span>
          </div>
          <span className="current-time">{new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</span>
          <button className="btn-footer-exit" onClick={() => navigate('/main')}>
            <img src={exitIcon} alt="Exit" className="exit-icon-img" />
          </button>
        </div>
      </div>

      {showStartPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowStartPasswordModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => {
                setShowStartPasswordModal(false);
                setStartPassword('');
                setPasswordError('');
              }}
            >
              ×
            </button>
            <h2 className="modal-title">Enter Start Password</h2>
            <p className="modal-instruction">
              Enter the password to start the exam. Ask the teacher/exam supervisor for the password if you haven't got it.
            </p>
            <div className="modal-form">
              <label className="modal-label">Start Password</label>
              <input
                type="password"
                value={startPassword}
                onChange={(e) => {
                  setStartPassword(e.target.value);
                  setPasswordError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmitStartPassword();
                  }
                }}
                className="modal-input"
                placeholder="Enter password"
              />
              {passwordError && (
                <span className="modal-error">{passwordError}</span>
              )}
            </div>
            <div className="modal-buttons">
              <button
                className="btn-modal-start"
                onClick={handleSubmitStartPassword}
              >
                Start
              </button>
              <button
                className="btn-modal-cancel"
                onClick={() => {
                  setShowStartPasswordModal(false);
                  setStartPassword('');
                  setPasswordError('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


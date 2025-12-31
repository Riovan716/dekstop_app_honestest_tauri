import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { BaseDirectory, writeTextFile } from '@tauri-apps/plugin-fs';
import { load } from '@tauri-apps/plugin-store';
import { submitExamResult } from '../api/exam.js';
import logo from '../assets/logo.png';
import './ExamPage.css';

export default function ExamPage() {
  const [examData, setExamData] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [examStartTime, setExamStartTime] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);
  const [userData, setUserData] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadExamData();
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const store = await load('store.json');
      const nim = await store.get('user-nim');
      const name = await store.get('user-name');
      const deviceId = await store.get('device-id');
      
      const userDataObj = {
        nim: nim || '',
        name: name || '',
        deviceId: deviceId || '',
      };
      
      setUserData(userDataObj);
      return userDataObj;
    } catch (error) {
      console.error('Error loading user data:', error);
      const fallbackData = {
        nim: '',
        name: '',
        deviceId: '',
      };
      setUserData(fallbackData);
      return fallbackData;
    }
  };

  // Set exam start time when exam data is loaded
  useEffect(() => {
    if (examData && !examStartTime) {
      const startTime = new Date();
      setExamStartTime(startTime);
      console.log('Exam started at:', startTime);
    }
  }, [examData, examStartTime]);

  useEffect(() => {
    if (!examData || !examStartTime) {
      console.log('No exam data or start time yet');
      return;
    }

    // Calculate remaining time based on:
    // min(time_limit from start time, end_date - current time)
    const calculateRemainingTime = () => {
      const now = new Date();
      
      // Calculate time limit from start time (in seconds)
      let timeLimitSeconds = null;
      if (examData.time_limit !== null && examData.time_limit !== undefined) {
        timeLimitSeconds = examData.time_limit;
      } else if (examData.duration_minutes !== null && examData.duration_minutes !== undefined) {
        timeLimitSeconds = examData.duration_minutes * 60;
      }

      // Calculate time remaining from time_limit
      let remainingFromTimeLimit = null;
      if (timeLimitSeconds !== null) {
        const elapsedMs = now.getTime() - examStartTime.getTime();
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        remainingFromTimeLimit = Math.max(0, timeLimitSeconds - elapsedSeconds);
      }

      // Calculate time remaining from end_date
      let remainingFromEndDate = null;
      if (examData.end_date) {
        const endDate = new Date(examData.end_date);
        const diffMs = endDate.getTime() - now.getTime();
        remainingFromEndDate = Math.max(0, Math.floor(diffMs / 1000));
      }

      // Return minimum of both (whichever is smaller)
      if (remainingFromTimeLimit !== null && remainingFromEndDate !== null) {
        return Math.min(remainingFromTimeLimit, remainingFromEndDate);
      } else if (remainingFromTimeLimit !== null) {
        return remainingFromTimeLimit;
      } else if (remainingFromEndDate !== null) {
        return remainingFromEndDate;
      }

      return null;
    };

    // Initial calculation
    const initialRemaining = calculateRemainingTime();
    console.log('Initial remaining time:', initialRemaining, 'seconds');
    console.log('Time limit:', examData.time_limit, 'Duration minutes:', examData.duration_minutes);
    console.log('End date:', examData.end_date);
    
    if (initialRemaining !== null && initialRemaining > 0) {
      setTimeRemaining(initialRemaining);

      // Update timer every second
      const timer = setInterval(() => {
        const remaining = calculateRemainingTime();
        
        if (remaining === null || remaining <= 0) {
          setTimeRemaining(0);
          clearInterval(timer);
          return;
        }
        
        setTimeRemaining(remaining);
      }, 1000);

      return () => {
        console.log('Clearing timer');
        clearInterval(timer);
      };
    } else {
      console.log('No valid time limit or end_date found');
      setTimeRemaining(0);
    }
  }, [examData, examStartTime]);

  // Auto submit when time is up
  useEffect(() => {
    if (timeRemaining === 0 && examData && !isSubmitting) {
      console.log('Time is up, auto-submitting...');
      handleSubmit(true);
    }
  }, [timeRemaining, examData, isSubmitting]);

  const loadExamData = async () => {
    try {
      const store = await load('store.json');
      const data = await store.get('exam-data');
      
      if (!data) {
        console.warn('No exam data found in store');
        navigate('/main');
        return;
      }

      if (!data.questions || !Array.isArray(data.questions)) {
        console.error('Questions data not found');
        navigate('/main');
        return;
      }

      if (data.questions.length === 0) {
        console.warn('Questions array is empty');
        navigate('/main');
        return;
      }

      // Apply shuffle_questions if enabled
      let processedQuestions = [...data.questions];
      if (data.shuffle_questions) {
        // Fisher-Yates shuffle algorithm
        for (let i = processedQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [processedQuestions[i], processedQuestions[j]] = [processedQuestions[j], processedQuestions[i]];
        }
        console.log('Questions shuffled');
      }

      // Apply shuffle_options if enabled
      if (data.shuffle_options) {
        processedQuestions = processedQuestions.map((question) => {
          if (question.options && Array.isArray(question.options) && question.options.length > 0) {
            // Shuffle options array
            const shuffledOptions = [...question.options];
            for (let i = shuffledOptions.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
            }
            return {
              ...question,
              options: shuffledOptions
            };
          }
          return question;
        });
        console.log('Options shuffled');
      }

      // Ensure duration_minutes is set correctly (like in WaitingPage)
      let durationInMinutes = null;
      if (data.duration_minutes !== null && data.duration_minutes !== undefined) {
        durationInMinutes = data.duration_minutes;
      } else if (data.time_limit !== null && data.time_limit !== undefined) {
        // Convert seconds to minutes
        durationInMinutes = Math.floor(data.time_limit / 60);
      }

      // Update data with processed questions
      const processedData = {
        ...data,
        questions: processedQuestions,
        duration_minutes: durationInMinutes,
        time_limit: data.time_limit ?? null,
      };

      // Debug: Log first question structure
      if (processedData.questions.length > 0) {
        console.log('First question structure:', processedData.questions[0]);
        console.log('First question options:', processedData.questions[0].options);
      }

      console.log('Processed exam data:', {
        duration_minutes: processedData.duration_minutes,
        time_limit: processedData.time_limit,
        title: processedData.title
      });

      setExamData(processedData);
    } catch (error) {
      console.error('Error loading exam data:', error);
      navigate('/main');
    }
  };

  const handleAnswerChange = (questionId, answer) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  const handleClearOption = () => {
    const currentQuestion = examData.questions[currentQuestionIndex];
    if (currentQuestion) {
      setSelectedAnswers((prev) => {
        const newAnswers = { ...prev };
        delete newAnswers[currentQuestion.id];
        return newAnswers;
      });
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < examData.questions.length - 1) {
      // Check sequential setting
      if (examData.sequential) {
        const currentQuestion = examData.questions[currentQuestionIndex];
        const hasAnswer = selectedAnswers[currentQuestion.id] !== undefined;
        if (!hasAnswer) {
          alert('Anda harus menjawab soal ini terlebih dahulu sebelum melanjutkan ke soal berikutnya.');
          return;
        }
      }
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePreviousQuestion = () => {
    // Check sequential setting - prevent going back if sequential is enabled
    if (examData.sequential) {
      return; // Tidak bisa kembali jika sequential aktif
    }
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleQuestionClick = (index) => {
    // Check sequential setting - prevent jumping to unanswered questions
    if (examData.sequential && index > currentQuestionIndex) {
      // Check if all previous questions are answered
      for (let i = currentQuestionIndex; i < index; i++) {
        const question = examData.questions[i];
        if (!selectedAnswers[question.id]) {
          alert('Anda harus menjawab semua soal secara berurutan. Silakan jawab soal-soal sebelumnya terlebih dahulu.');
          return;
        }
      }
    }
    setCurrentQuestionIndex(index);
  };

  const handleSubmit = async (isAutoSubmit = false) => {
    if (!isAutoSubmit) {
      setShowConfirmModal(true);
      return;
    }

    await performSubmit();
  };

  const performSubmit = async () => {
    setIsSubmitting(true);
    setSubmitMessage(null);
    setShowConfirmModal(false);

    try {
      const userData = await loadUserData();
      
      if (!userData) {
        throw new Error('Failed to load user data');
      }
      
      // Prepare result data like referensi
      const submitId = crypto.randomUUID();
      const resultData = {
        username: userData.nim || '',
        device_id: userData.deviceId || '',
        exam: {
          id: examData.id,
          title: examData.title,
          course_title: examData.course_title,
          allowed_attempts: examData.allowed_attempts,
          cheating_limit: examData.cheating_limit || 0,
        },
        answer: selectedAnswers,
        questions: examData.questions,
        proctoringLog: [], // TODO: Add proctoring log if needed
        submit_id: submitId,
      };

      // Convert to JSON string
      const resultJson = JSON.stringify(resultData, null, 2);
      console.log('Result data:', resultData);

      // Create exam result file using Tauri command (like referensi)
      const temp = await invoke('create_exam_result_file', {
        data: resultJson,
      });

      if (temp.message !== 'success' || !temp.data) {
        throw new Error('Failed to create exam result file');
      }

      // Convert Vec<u8> to File object
      const uint8Array = new Uint8Array(temp.data);
      const resultFile = new File([uint8Array], temp.filename, {
        type: 'application/octet-stream',
        lastModified: Date.now()
      });

      // Try to submit to backend
      try {
        const response = await submitExamResult(resultFile, examData.id);
        
        // Store data for review page
        const store = await load('store.json');
        await store.set('exam-answers', selectedAnswers);
        if (response && response.data) {
          await store.set('exam-result', response.data);
        }
        await store.save();
        
        // If enable_review is active, navigate to review page
        if (examData.enable_review) {
          setIsSubmitting(false);
          navigate('/review');
          return;
        }
        
        // If show_grade is active and we have result data, show it in message
        let successMessage = `Exam submitted successfully!\n\nFile saved at:\n${temp.file_path || 'Documents/honestest/exam_results/'}`;
        if (examData.show_grade && response && response.data) {
          const totalScore = response.data.total_score || 0;
          const expectedScore = response.data.expected_score || 0;
          const percentage = expectedScore > 0 ? ((totalScore / expectedScore) * 100).toFixed(2) : 0;
          successMessage += `\n\nNilai: ${totalScore} / ${expectedScore} (${percentage}%)`;
        }
        
        setSubmitMessage({
          type: 'success',
          text: successMessage,
        });
        
        // Navigate back to main page after 3 seconds
        setTimeout(() => {
          navigate('/main');
        }, 3000);
      } catch (submitError) {
        console.error('Backend submission failed:', submitError);
        console.error('Error details:', {
          message: submitError?.message,
          stack: submitError?.stack,
          name: submitError?.name,
        });
        
        // Store data for review page even on error
        const store = await load('store.json');
        await store.set('exam-answers', selectedAnswers);
        await store.save();
        
        // If enable_review is active even on error, navigate to review page
        if (examData.enable_review) {
          setIsSubmitting(false);
          navigate('/review');
          return;
        }
        
        // File already saved in Documents/honestest/exam_results by create_exam_result_file
        const errorMessage = submitError?.message || 'Unknown error';
        setSubmitMessage({
          type: 'success',
          text: `Connection error: ${errorMessage}\n\nExam result file saved locally.\n\nFile location:\n${temp.file_path || 'Documents/honestest/exam_results/'}\n\nYou can submit it manually later.`,
        });
        
        // Navigate back to main page after 4 seconds
        setTimeout(() => {
          navigate('/main');
        }, 4000);
      }
    } catch (error) {
      console.error('Error submitting exam:', error);
      setSubmitMessage({
        type: 'error',
        text: error.message || 'Failed to submit exam. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '00:00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (!examData) {
    return (
      <div className="exam-page">
        <div className="loading-container">
          <p>Loading exam data...</p>
        </div>
      </div>
    );
  }

  if (!examData.questions || !Array.isArray(examData.questions) || examData.questions.length === 0) {
    return (
      <div className="exam-page">
        <div className="loading-container">
          <p>No questions found</p>
          <button onClick={() => navigate('/main')} className="btn-back-to-main">
            Back to Main
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = examData.questions[currentQuestionIndex];
  
  if (!currentQuestion) {
    return (
      <div className="exam-page">
        <div className="loading-container">
          <p>Question not found</p>
        </div>
      </div>
    );
  }

  // Debug logging
  console.log('Current question:', currentQuestion);
  console.log('Question type:', currentQuestion.type_);
  console.log('Options:', currentQuestion.options);
  console.log('Options is array?', Array.isArray(currentQuestion.options));
  console.log('Options length:', currentQuestion.options?.length);

  const hasAnswer = selectedAnswers[currentQuestion.id] !== undefined;
  const currentAnswer = selectedAnswers[currentQuestion.id];
  
  // Check if question has options (for multiple choice)
  const hasOptions = currentQuestion.options && 
                     Array.isArray(currentQuestion.options) && 
                     currentQuestion.options.length > 0;
  
  // Determine question type - handle both 'multiple' and 'multiple_choice'
  const questionType = currentQuestion.type_ || currentQuestion.type || (hasOptions ? 'multiple_choice' : 'essay');
  const isMultipleChoice = questionType === 'multiple' || questionType === 'multiple_choice';

  return (
    <div className="exam-page">
      <div className="exam-content">
        {/* Main Content Area - Left */}
        <div className="exam-main-content">
          <div className="question-container">
            <h2 className="question-text">
              {currentQuestionIndex + 1}. {currentQuestion.question || currentQuestion.content || 'No question text'}
            </h2>

            {(hasOptions || isMultipleChoice) && (
              <div className="options-container">
                {currentQuestion.options.map((option, index) => {
                  const optionLabel = String.fromCharCode(97 + index); // a, b, c, d
                  const isSelected = currentAnswer === option;
                  
                  return (
                    <label
                      key={index}
                      className={`option-item ${isSelected ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name={`question-${currentQuestion.id}`}
                        value={option}
                        checked={isSelected}
                        onChange={() => handleAnswerChange(currentQuestion.id, option)}
                        className="option-radio"
                      />
                      <span className="option-label">{optionLabel}.</span>
                      <span className="option-text">{option}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {!hasOptions && questionType === 'essay' && (
              <textarea
                value={currentAnswer || ''}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                className="essay-input"
                placeholder="Type your answer here..."
                rows={10}
              />
            )}

            {!hasOptions && questionType !== 'essay' && (
              <div className="no-options-message">
                <p>No options available for this question.</p>
                <p className="debug-info">Type: {currentQuestion.type_ || 'unknown'}</p>
              </div>
            )}

            <div className="question-navigation">
              <button
                onClick={handlePreviousQuestion}
                disabled={currentQuestionIndex === 0 || examData.sequential}
                className="btn-nav btn-back"
                title={examData.sequential ? 'Tidak bisa kembali ke soal sebelumnya (Sequential Mode)' : ''}
              >
                <span className="btn-icon">‹</span>
                Back
              </button>
              <button
                onClick={handleNextQuestion}
                disabled={currentQuestionIndex === examData.questions.length - 1}
                className="btn-nav btn-next"
              >
                Next
                <span className="btn-icon">›</span>
              </button>
              <button
                onClick={handleClearOption}
                className="btn-nav btn-clear"
              >
                <span className="btn-icon">⌫</span>
                Clear Option
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar - Right */}
        <div className="exam-sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-title">Question List</h3>
            <div className="question-list">
              {examData.questions.map((q, index) => {
                const isActive = currentQuestionIndex === index;
                const isAnswered = selectedAnswers[q.id] !== undefined;
                // In sequential mode, disable questions that haven't been reached yet
                const isDisabled = examData.sequential && index > currentQuestionIndex && !isAnswered;
                
                return (
                  <button
                    key={q.id || index}
                    onClick={() => handleQuestionClick(index)}
                    disabled={isDisabled}
                    className={`question-number-btn ${isActive ? 'active' : ''} ${isAnswered ? 'answered' : ''} ${isDisabled ? 'disabled' : ''}`}
                    title={isDisabled ? 'Jawab soal sebelumnya terlebih dahulu' : ''}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Remaining Time</h3>
            <div className="timer-display">
              {formatTime(timeRemaining)}
            </div>
          </div>

          <div className="sidebar-section">
            <button
              onClick={handleSubmit}
              className="btn-submit-exam"
              disabled={isSubmitting}
            >
              <span className="submit-icon">✈</span>
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="exam-footer">
        <div className="footer-logo">
          <img src={logo} alt="Logo" className="footer-logo-img" />
        </div>
        <div className="footer-info">
          <span>100%</span>
          <span>{new Date().toLocaleDateString('en-US', { 
            month: 'short', 
            day: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</span>
          <span className="fullscreen-icon">⛶</span>
        </div>
      </div>

      {/* Confirm Submit Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-header">
              <h2 className="confirm-title">Konfirmasi Submit</h2>
              <button
                className="modal-close"
                onClick={() => setShowConfirmModal(false)}
              >
                ×
              </button>
            </div>
            <div className="confirm-body">
              <div className="confirm-icon">⚠️</div>
              <p className="confirm-message">
                Apakah Anda yakin ingin mengirim jawaban ujian?
              </p>
              <p className="confirm-warning">
                Setelah submit, Anda tidak dapat mengubah jawaban lagi.
              </p>
              <div className="confirm-stats">
                <div className="stat-item">
                  <span className="stat-label">Total Soal:</span>
                  <span className="stat-value">{examData.questions.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Terjawab:</span>
                  <span className="stat-value">
                    {Object.keys(selectedAnswers).length} / {examData.questions.length}
                  </span>
                </div>
              </div>
            </div>
            <div className="confirm-footer">
              <button
                className="btn-cancel"
                onClick={() => setShowConfirmModal(false)}
              >
                Batal
              </button>
              <button
                className="btn-confirm-submit"
                onClick={performSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Mengirim...' : 'Ya, Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Message Modal */}
      {submitMessage && (
        <div className="modal-overlay" onClick={() => {
          if (submitMessage.type === 'success') {
            setSubmitMessage(null);
            navigate('/main');
          }
        }}>
          <div className="modal-content submit-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => {
                setSubmitMessage(null);
                if (submitMessage.type === 'success') {
                  navigate('/main');
                }
              }}
            >
              ×
            </button>
            <div className={`submit-message ${submitMessage.type}`}>
              <div className="submit-icon-large">
                {submitMessage.type === 'success' ? '✓' : '✗'}
              </div>
              <h2 className="submit-title">
                {submitMessage.type === 'success' ? 'Success!' : 'Error'}
              </h2>
              <p className="submit-text">{submitMessage.text}</p>
              {submitMessage.type === 'success' && (
                <p className="submit-note">You will be redirected to the main page...</p>
              )}
              <button
                className="btn-modal-ok"
                onClick={() => {
                  setSubmitMessage(null);
                  if (submitMessage.type === 'success') {
                    navigate('/main');
                  }
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { BaseDirectory, writeTextFile } from '@tauri-apps/plugin-fs';
import { load } from '@tauri-apps/plugin-store';
import Webcam from 'react-webcam';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

import { submitExamResult } from '../api/exam.js';
import logo from '../assets/logo.png';
import submitIcon from '../assets/submit.png';
import './ExamPage.css';

export default function ExamPage() {
  // --- Original State ---
  const [examData, setExamData] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [examStartTime, setExamStartTime] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);
  const [userData, setUserData] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // --- Proctoring State ---
  const webcamRef = useRef(null);
  const [faceLandmarker, setFaceLandmarker] = useState(null);
  // removed toast state: const [proctoringFeedback, setProctoringFeedback] = useState(null); 
  const [cheatingCount, setCheatingCount] = useState(0);
  const [isExamBlocked, setIsExamBlocked] = useState(false);
  const [resumePassword, setResumePassword] = useState('');

  // New Warning Modal State
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');

  // --- Proctoring Refs ---
  const lastCheatingTime = useRef(0);
  const lookAwayStartTime = useRef(null);
  const lookAwayCountWindow = useRef([]);
  const currentLookDirection = useRef('center');

  const navigate = useNavigate();

  // --- Effects ---

  // 1. Load Data (Restored)
  useEffect(() => {
    loadExamData();
    loadUserData();
  }, []);

  // 2. Load AI Model
  useEffect(() => {
    if (examData && examData.enable_proctoring) {
      const createFaceLandmarker = async () => {
        try {
          const filesetResolver = await FilesetResolver.forVisionTasks('./mediapipe/wasm');
          const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath: './face_landmarker.task',
              delegate: 'GPU'
            },
            outputFaceBlendshapes: true,
            runningMode: 'VIDEO',
            numFaces: 1
          });
          setFaceLandmarker(landmarker);
        } catch (e) {
          console.error("Failed to load FaceLandmarker:", e);
        }
      };
      createFaceLandmarker();
    }
  }, [examData]);

  // 3. AI Prediction Loop
  useEffect(() => {
    // Stop prediction if blocked OR if WARNING modal is open (so we don't spam warnings)
    if (!faceLandmarker || !examData?.enable_proctoring || isExamBlocked || showWarningModal) return;

    let animationFrameId;
    const predictWebcam = async () => {
      if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
        const now = Date.now();
        const startTimeMs = performance.now();
        const results = faceLandmarker.detectForVideo(webcamRef.current.video, startTimeMs);

        if (results.faceBlendshapes && results.faceBlendshapes.length > 0 && results.faceLandmarks) {
          detectCheating(results.faceBlendshapes[0], results.faceLandmarks[0], now);
        }
      }
      animationFrameId = requestAnimationFrame(predictWebcam);
    };

    predictWebcam();
    return () => cancelAnimationFrame(animationFrameId);
  }, [faceLandmarker, isExamBlocked, showWarningModal, examData]);

  // --- Proctoring Helper Functions ---

  const triggerCheating = (reason) => {
    const now = Date.now();

    if (now - lastCheatingTime.current > 2000) {
      setCheatingCount(prev => {
        const newCount = prev + 1;
        console.log(`Cheating detected: ${reason}. Total: ${newCount}`);

        // Limit Check
        if (examData.cheating_limit && newCount >= examData.cheating_limit) {
          setIsExamBlocked(true);
        } else {
          // Just a Warning logic
          setWarningMessage(reason);
          setShowWarningModal(true);
        }
        return newCount;
      });
      lastCheatingTime.current = now;
    }
  };

  const detectCheating = (faceBlendShapes, landmarks, now) => {
    const categories = faceBlendShapes.categories;

    // --- Detection Logic ---
    // 1. Head Turn
    const nose = landmarks[1];
    const rightEye = landmarks[33];
    const leftEye = landmarks[263];
    const distNoseToRight = Math.abs(nose.x - rightEye.x);
    const distNoseToLeft = Math.abs(nose.x - leftEye.x);

    let headTurn = 'center';
    if (distNoseToLeft < distNoseToRight * 0.5) {
      headTurn = 'left';
    } else if (distNoseToRight < distNoseToLeft * 0.5) {
      headTurn = 'right';
    }

    // 2. Head Pitch
    let headPitch = 'center';
    if (headTurn === 'center') {
      const midEyeY = (rightEye.y + leftEye.y) / 2;
      const upperLip = landmarks[13];
      const lowerLip = landmarks[14];
      const midMouthY = (upperLip.y + lowerLip.y) / 2;

      const distEyeNose = Math.abs(nose.y - midEyeY);
      const distNoseMouth = Math.abs(midMouthY - nose.y);

      if (distEyeNose < distNoseMouth * 0.7) {
        headPitch = 'up';
      } else if (distNoseMouth < distEyeNose * 0.45) {
        headPitch = 'down';
      }
    }

    // 3. Eye Gaze
    const isEyesRight = (categories[16].score > 0.75 || categories[13].score > 0.75);
    const isEyesLeft = (categories[15].score > 0.75 || categories[14].score > 0.75);
    const isEyesDown = (categories[11].score > 0.45 || categories[12].score > 0.45);
    const isEyesUp = (categories[17].score > 0.35 || categories[18].score > 0.35);

    // 4. Decision
    let detectedAction = null;
    if (headTurn === 'left') detectedAction = 'left';
    else if (headTurn === 'right') detectedAction = 'right';
    else {
      if (headPitch === 'up') {
        if (!isEyesDown) detectedAction = 'up';
      } else if (headPitch === 'down') {
        if (!isEyesUp) detectedAction = 'down';
      } else {
        if (isEyesUp) detectedAction = 'up';
        else if (isEyesDown) detectedAction = 'down';
      }

      if (!detectedAction) {
        if (isEyesLeft) detectedAction = 'left';
        else if (isEyesRight) detectedAction = 'right';
      }
    }

    // --- Rules ---
    if (detectedAction) {
      // Rule 1: Duration check removed as per request
      /*
      if (!lookAwayStartTime.current) {
        lookAwayStartTime.current = now;
      } else {
        const duration = now - lookAwayStartTime.current;
        if (duration > 3000) {
          triggerCheating("Melihat ke arah lain terlalu lama (> 3 detik)");
          lookAwayStartTime.current = null;
        }
      }
      */

      // Rule 2: 3x in 5s
      if (currentLookDirection.current !== detectedAction) {
        lookAwayCountWindow.current = lookAwayCountWindow.current.filter(t => now - t <= 5000);
        lookAwayCountWindow.current.push(now);

        if (lookAwayCountWindow.current.length >= 3) {
          triggerCheating("Gerakan mencurigakan berulang (3x dalam 5 detik)");
          lookAwayCountWindow.current = [];
        }
      }
    } else {
      lookAwayStartTime.current = null;
    }

    currentLookDirection.current = detectedAction;
  };

  const handleResumeExam = () => {
    const correctPassword = examData.end_password || 'admin123';
    if (resumePassword === correctPassword) {
      setIsExamBlocked(false);
      setResumePassword('');
      setCheatingCount(0); // Reset limit to give another full chance
      // Also clear warning if any open (though blocked modal usually supersedes it)
      setShowWarningModal(false);
    } else {
      alert('Incorrect Password');
    }
  };

  const handleCloseWarningModal = () => {
    setShowWarningModal(false);
    // Detection will resume automatically via effect dependency
  };


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
  // Save state whenever relevant data changes
  useEffect(() => {
    if (!examData || !examStartTime) return;

    const saveState = async () => {
      try {
        const store = await load('store.json');
        const nim = await store.get('user-nim');

        if (!nim) {
          console.warn('Cannot save state: No NIM found');
          return;
        }

        const stateKey = `exam_state_${examData.id}_${nim}`;

        // We save the processed questions to preserve order (if shuffled)
        const stateToSave = {
          questions: examData.questions,
          answers: selectedAnswers,
          currentIndex: currentQuestionIndex,
          startTime: examStartTime.toISOString(),
          lastSaved: new Date().toISOString()
        };

        await store.set(stateKey, stateToSave);
        await store.save();
        // console.log('Exam state saved for user:', nim);
      } catch (error) {
        console.error('Error saving exam state:', error);
      }
    };

    // Debounce save if needed, but for now direct save on effect is safer for low-frequency updates
    const timeoutId = setTimeout(saveState, 500);
    return () => clearTimeout(timeoutId);
  }, [examData, selectedAnswers, currentQuestionIndex, examStartTime]);

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

  const [hasAutoSubmitted, setHasAutoSubmitted] = useState(false);

  // Auto submit when time is up
  useEffect(() => {
    if (timeRemaining === 0 && examData && !isSubmitting && !hasAutoSubmitted) {
      console.log('Time is up, auto-submitting...');
      setHasAutoSubmitted(true);
      handleSubmit(true);
    }
  }, [timeRemaining, examData, isSubmitting, hasAutoSubmitted]);

  const loadExamData = async () => {
    try {
      const store = await load('store.json');
      const data = await store.get('exam-data');

      if (!data) {
        console.warn('No exam data found in store');
        navigate('/main');
        return;
      }

      const examId = data.id;
      const nim = await store.get('user-nim');

      let savedState = null;
      let stateKey = null;

      if (nim) {
        stateKey = `exam_state_${examId}_${nim}`;
        try {
          savedState = await store.get(stateKey);
        } catch (e) {
          console.log('No saved state found or error reading it');
        }
      } else {
        console.warn('No NIM found in store, skipping state restore');
      }

      let processedQuestions = [];
      let initialAnswers = {};
      let initialIndex = 0;
      let initialStartTime = null;

      if (savedState) {
        console.log('Restoring saved exam state found for ID:', examId, 'User:', nim);
        processedQuestions = savedState.questions;
        initialAnswers = savedState.answers || {};
        initialIndex = savedState.currentIndex || 0;
        if (savedState.startTime) {
          initialStartTime = new Date(savedState.startTime);
        }
      } else {
        console.log('No saved state for this user, initializing new exam session...');

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
        processedQuestions = [...data.questions];
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

        // New start time
        initialStartTime = new Date();
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
      }

      setExamData(processedData);
      setSelectedAnswers(initialAnswers);
      setCurrentQuestionIndex(initialIndex);

      if (initialStartTime) {
        setExamStartTime(initialStartTime);
        console.log('Exam start time set to:', initialStartTime);
      }

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
    // Check sequential setting - strictly prevent sidebar navigation
    if (examData.sequential) {
      if (index !== currentQuestionIndex) {
        // Should not happen if buttons are disabled, but good for security
        return;
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
        // Create 30s timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timed out (30s)')), 30000);
        });

        // Race between submit and timeout
        const response = await Promise.race([
          submitExamResult(resultFile, examData.id),
          timeoutPromise
        ]);

        // Store data for review page
        const store = await load('store.json');
        await store.set('exam-answers', selectedAnswers);
        if (response && response.data) {
          await store.set('exam-result', response.data);
        }

        // Clear the saved exam progress state on successful submit
        if (userData && userData.nim) {
          const stateKey = `exam_state_${examData.id}_${userData.nim}`;
          await store.delete(stateKey);
        }

        await store.save();

        // If show_grade is active and we have result data, show it in message
        // Note: Modal suppressed on success as per request
        /*
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
        */

        // Navigate immediately without modal
        if (examData.enable_review) {
          navigate('/review');
        } else {
          navigate('/main');
        }
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

        // File already saved in Documents/honestest/exam_results by create_exam_result_file
        let errorMessage = submitError?.message || 'Unknown error';
        const isTimeout = errorMessage.includes('timed out');

        // Handle misleading backend error message for attempt limit
        if (errorMessage.includes('exam dengan title ini sudah ada') || errorMessage.includes('TitleTaken')) {
          errorMessage = 'Batas percobaan ujian telah habis (Max Attempts Reached).';
        }

        setSubmitMessage({
          type: 'success',
          text: `Koneksi bermasalah: ${isTimeout ? 'Waktu habis (Request Timed Out)' : errorMessage}\n\nTAPI JANGAN KHAWATIR!\nData ujian Anda AMAN dan tersimpan di komputer ini.\n\nLokasi file:\n${temp.file_path || 'Documents/honestest/exam_results/'}\n\nSilahkan kirim file tersebut manual ke Admin/Dosen.`,
        });

        // Navigate after 6 seconds - give more time to read the Important message
        setTimeout(() => {
          if (examData.enable_review) {
            navigate('/review');
          } else {
            navigate('/main');
          }
        }, 6000);
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
      {/* Proctoring UI */}
      {examData && examData.enable_proctoring && (
        <div className="webcam-hidden">
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored={true}
            videoConstraints={{ frameRate: { ideal: 15, max: 25 } }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      {/* Warning Modal (Non-blocking, but interrupts) */}
      {showWarningModal && (
        <div className="modal-overlay" style={{ zIndex: 9998 }}>
          <div className="modal-content blocked-modal" style={{ maxWidth: '450px', border: '2px solid #f59e0b' }}>
            <div className="blocked-icon" style={{ fontSize: '40px' }}>⚠️</div>
            <h2 className="blocked-title" style={{ color: '#d97706' }}>Peringatan Proctoring</h2>
            <p style={{ fontSize: '16px', color: '#333', marginTop: '10px', fontWeight: '500' }}>
              {warningMessage}
            </p>
            <div style={{ marginTop: '20px', background: '#fffbeb', padding: '10px', borderRadius: '4px', border: '1px solid #fcd34d' }}>
              <p style={{ fontSize: '14px', color: '#b45309', margin: 0 }}>
                Pelanggaran: {cheatingCount} / {examData.cheating_limit}
              </p>
              <p style={{ fontSize: '12px', color: '#b45309', margin: '5px 0 0' }}>
                Jika mencapai batas limit, ujian akan dihentikan sementara.
              </p>
            </div>
            <button
              className="btn-resume"
              style={{ backgroundColor: '#d97706', marginTop: '20px' }}
              onClick={handleCloseWarningModal}
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}

      {isExamBlocked && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content blocked-modal">
            <div className="blocked-icon">🔒</div>
            <h2 className="blocked-title">Ujian Terhenti</h2>
            <p className="blocked-title" style={{ fontSize: '16px', color: '#666', marginTop: '10px' }}>
              Anda terdeteksi melakukan kecurangan melebihi batas yang ditentukan (Limit: {examData.cheating_limit}).
            </p>
            <p className="blocked-subtext">Silahkan hubungi pengawas untuk melanjutkan.</p>
            <input
              type="password"
              className="blocked-input"
              placeholder="Masukkan End Password"
              value={resumePassword}
              onChange={e => setResumePassword(e.target.value)}
            />
            <button className="btn-resume" onClick={handleResumeExam}>Lanjutkan Ujian</button>
          </div>
        </div>
      )}
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
                onClick={handleClearOption}
                className="btn-nav btn-clear"
              >
                <span className="btn-icon">⌫</span>
                Clear Option
              </button>
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

                // In sequential mode, disable all buttons except the current one
                // This prevents users from going back or skipping ahead via sidebar
                const isDisabled = examData.sequential && index !== currentQuestionIndex;

                return (
                  <button
                    key={q.id || index}
                    onClick={() => handleQuestionClick(index)}
                    disabled={isDisabled}
                    className={`question-number-btn ${isActive ? 'active' : ''} ${isAnswered ? 'answered' : ''} ${isDisabled ? 'disabled' : ''}`}
                    title={isDisabled ? (examData.sequential ? 'Navigasi terkunci (Sequential Mode)' : '') : ''}
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
              <img src={submitIcon} alt="Submit" className="submit-icon" />
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
            if (examData.enable_review) {
              navigate('/review');
            } else {
              navigate('/main');
            }
          }
        }}>
          <div className="modal-content submit-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => {
                setSubmitMessage(null);
                if (submitMessage.type === 'success') {
                  if (examData.enable_review) {
                    navigate('/review');
                  } else {
                    navigate('/main');
                  }
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
                <p className="submit-note">You will be redirected to the {examData.enable_review ? 'review' : 'main'} page...</p>
              )}
              <button
                className="btn-modal-ok"
                onClick={() => {
                  setSubmitMessage(null);
                  if (submitMessage.type === 'success') {
                    if (examData.enable_review) {
                      navigate('/review');
                    } else {
                      navigate('/main');
                    }
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

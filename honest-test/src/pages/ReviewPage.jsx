import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { load } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';
import logo from '../assets/logo.png';
import exitIcon from '../assets/exit.png';
import batteryIcon from '../assets/baterai.png';
import './ReviewPage.css';

export default function ReviewPage() {
  const [examData, setExamData] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [examResult, setExamResult] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);



  const navigate = useNavigate();

  useEffect(() => {
    loadReviewData();
  }, []);

  const loadReviewData = async () => {
    try {
      const store = await load('store.json');
      const examDataFromStore = await store.get('exam-data');
      const answersFromStore = await store.get('exam-answers');
      const resultFromStore = await store.get('exam-result');

      if (!examDataFromStore) {
        console.warn('No exam data found');
        navigate('/main');
        return;
      }

      setExamData(examDataFromStore);
      setSelectedAnswers(answersFromStore || {});
      setExamResult(resultFromStore || null);
    } catch (error) {
      console.error('Error loading review data:', error);
      navigate('/main');
    }
  };



  // Helper function to normalize true/false answers
  const normalizeAnswer = (ans) => {
    if (ans === undefined || ans === null) return null;
    const str = String(ans).toLowerCase().trim();
    // Handle "1" or 1 as true, "0" or 0 as false
    if (str === '1' || str === 'true') return 'True';
    if (str === '0' || str === 'false') return 'False';
    // Return as is if already normalized
    return String(ans);
  };

  // Calculate score for a question
  const getQuestionScore = (question) => {
    const answer = selectedAnswers[question.id];
    const correctAnswer = question.correct_answer;
    const questionType = question.type_ || question.type || (question.options ? 'multiple_choice' : 'essay');
    const isTrueFalse = questionType === 'true_false' || questionType === 'true/false';

    let isCorrect = false;
    if (answer !== undefined && correctAnswer !== undefined) {
      if (isTrueFalse) {
        const normalizedAnswer = normalizeAnswer(answer);
        const normalizedCorrect = normalizeAnswer(correctAnswer);
        isCorrect = normalizedAnswer === normalizedCorrect;
      } else {
        isCorrect = answer === correctAnswer;
      }
    }

    // Get point from question, default to 1
    const point = question.point !== undefined && question.point !== null ? question.point : 1;
    return {
      earned: isCorrect ? point : 0,
      total: point,
      isCorrect
    };
  };

  if (!examData) {
    return (
      <div className="review-page">
        <div className="loading-container">
          <p>Loading review data...</p>
        </div>
      </div>
    );
  }

  const currentQuestion = examData.questions[currentQuestionIndex];
  const questionScore = currentQuestion ? getQuestionScore(currentQuestion) : { earned: 0, total: 0, isCorrect: false };

  return (
    <div className="review-page">
      <div className="review-content">
        {/* Main Content Area - Left */}
        <div className="review-main-content">
          <div className="review-question-container">
            {currentQuestion && (
              <>
                <h2 className="review-question-text">
                  {currentQuestionIndex + 1}. {currentQuestion.question || currentQuestion.content || 'No question text'}
                </h2>

                <div className="review-options-container">
                  {currentQuestion.options && Array.isArray(currentQuestion.options) && currentQuestion.options.length > 0 ? (
                    currentQuestion.options.map((option, index) => {
                      const optionLabel = String.fromCharCode(97 + index); // a, b, c, d
                      const answer = selectedAnswers[currentQuestion.id];
                      const questionType = currentQuestion.type_ || currentQuestion.type || 'multiple_choice';
                      const isTrueFalse = questionType === 'true_false' || questionType === 'true/false';

                      // Check if this option is selected
                      let isSelected = false;
                      if (answer !== undefined && answer !== null) {
                        if (isTrueFalse) {
                          // For true/false, normalize both for comparison
                          const normalizedAnswer = normalizeAnswer(answer);
                          const normalizedOption = normalizeAnswer(option);
                          isSelected = normalizedAnswer === normalizedOption;
                        } else {
                          // Direct comparison for other types
                          isSelected = String(answer) === String(option);
                        }
                      }

                      // Check if this option is the correct answer
                      let isCorrectOption = false;
                      if (currentQuestion.correct_answer !== undefined && currentQuestion.correct_answer !== null) {
                        if (isTrueFalse) {
                          // For true/false, normalize both for comparison
                          const normalizedOption = normalizeAnswer(option);
                          const normalizedCorrect = normalizeAnswer(currentQuestion.correct_answer);
                          isCorrectOption = normalizedOption === normalizedCorrect;
                        } else {
                          // Direct comparison for other types
                          isCorrectOption = String(option) === String(currentQuestion.correct_answer);
                        }
                      }

                      // Hijau jika dipilih dan benar, merah jika dipilih dan salah
                      const isCorrect = isSelected && isCorrectOption;
                      const isIncorrect = isSelected && !isCorrectOption;

                      return (
                        <div
                          key={index}
                          className={`review-option-item ${isCorrect ? 'correct-selected' : isIncorrect ? 'incorrect-selected' : ''}`}
                        >
                          <span className="option-label">{optionLabel}.</span>
                          <span className="option-text">{isTrueFalse ? normalizeAnswer(option) : option}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="review-essay-container">
                      {selectedAnswers[currentQuestion.id] ? (
                        <>
                          <p className="essay-label">Jawaban Anda:</p>
                          <p className="essay-answer gray">
                            {currentQuestion.type_ === 'true_false' || currentQuestion.type_ === 'true/false'
                              ? normalizeAnswer(selectedAnswers[currentQuestion.id])
                              : selectedAnswers[currentQuestion.id]}
                          </p>
                          {currentQuestion.correct_answer && (
                            <>
                              <p className="essay-label">Jawaban Benar:</p>
                              <p className="essay-answer correct">
                                {currentQuestion.type_ === 'true_false' || currentQuestion.type_ === 'true/false'
                                  ? normalizeAnswer(currentQuestion.correct_answer)
                                  : currentQuestion.correct_answer}
                              </p>
                            </>
                          )}
                        </>
                      ) : (
                        <p className="essay-answer unanswered">Tidak dijawab</p>
                      )}
                    </div>
                  )}
                </div>

                {examData.show_grade && (
                  (() => {
                    const qType = currentQuestion.type_ || currentQuestion.type || (currentQuestion.options ? 'multiple_choice' : 'essay');
                    const isEssay = qType === 'essay';
                    return !isEssay ? (
                      <div className="review-point-display">
                        <span className="point-label">Point :</span>
                        <span className="point-value">{questionScore.earned} of {questionScore.total}</span>
                      </div>
                    ) : null;
                  })()
                )}
              </>
            )}
          </div>
        </div>

        {/* Sidebar - Right */}
        <div className="review-sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-title">Question List</h3>
            <div className="question-list">
              {examData.questions.map((q, index) => {
                const answer = selectedAnswers[q.id];
                const isActive = currentQuestionIndex === index;
                const isAnswered = answer !== undefined;

                return (
                  <button
                    key={q.id || index}
                    onClick={() => setCurrentQuestionIndex(index)}
                    className={`question-number-btn ${isActive ? 'active' : ''} ${isAnswered ? 'answered' : 'unanswered'}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {examData.show_grade && (() => {
            const earned = examData.questions.reduce((acc, q) => {
              const qType = q.type_ || q.type || (q.options ? 'multiple_choice' : 'essay');
              if (qType === 'essay') return acc;
              return acc + getQuestionScore(q).earned;
            }, 0);

            const total = examData.questions.reduce((acc, q) => {
              const qType = q.type_ || q.type || (q.options ? 'multiple_choice' : 'essay');
              if (qType === 'essay') return acc;
              return acc + (q.point || 1);
            }, 0);

            const percentage = total > 0 ? (earned / total) * 100 : 0;
            const passingGrade = examData.passing_grade || 0;
            const isPassed = passingGrade > 0 ? percentage >= passingGrade : null;

            return (
              <div className="sidebar-section">
                <h3 className="sidebar-title">Grade</h3>
                <div className="grade-display">
                  <div className="grade-value-large">
                    {earned.toFixed(2)} / {total.toFixed(2)}
                  </div>
                  <div className="grade-status" style={{
                    marginTop: '12px',
                    padding: '8px',
                    borderRadius: '6px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    width: '100%',
                    backgroundColor: isPassed ? '#d1fae5' : isPassed === false ? '#fee2e2' : '#e0f2fe',
                    color: isPassed ? '#059669' : isPassed === false ? '#dc2626' : '#0284c7'
                  }}>
                    {isPassed === true ? 'PASSED' : isPassed === false ? 'FAILED' : 'COMPLETED'} ({percentage.toFixed(2)}%)
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="sidebar-section">
            <button
              className="btn-done-review"
              onClick={() => navigate('/waiting')}
            >
              Done Review
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
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
          <button className="btn-footer-exit" onClick={() => navigate('/waiting')}>
            <img src={exitIcon} alt="Exit" className="exit-icon-img" />
          </button>
        </div>
      </div>


    </div>
  );
}

import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { load } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';

// Lazy Load Pages
const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const MainPage = lazy(() => import('./pages/MainPage'));
const WaitingPage = lazy(() => import('./pages/WaitingPage'));
const ExamPage = lazy(() => import('./pages/ExamPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const CheckReadiness = lazy(() => import('./pages/CheckReadiness'));

import ExitModal from './components/ExitModal';

// Loading Component
const LoadingScreen = () => (
  <div className="flex items-center justify-center h-screen bg-gray-50">
    <div className="text-xl font-semibold text-gray-600">Loading...</div>
  </div>
);

function AppContent() {
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [examTitle, setExamTitle] = useState('');
  const isExitingRef = useRef(false);
  const location = useLocation();
  const locationRef = useRef(location);

  // Keep location ref updated so the event listener can read current path
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // Load exit password only if we are in the exam
  const loadExitPassword = async () => {
    // Only require password if we are strictly on the secure pages
    if (!['/exam', '/waiting', '/review'].includes(location.pathname)) {
      setExitPassword('');
      setExamTitle('');
      return;
    }

    try {
      const store = await load('store.json');
      const data = await store.get('exam-data');

      if (data && data.end_password) {
        setExitPassword(data.end_password);
        setExamTitle(data.title || data.course_title || '');
        console.log('Loaded exit password for exam:', data.title);
      } else {
        setExitPassword('');
        setExamTitle('');
      }
    } catch (e) {
      console.warn('Failed to load exit password:', e);
      setExitPassword('');
    }
  };

  useEffect(() => {
    if (showExitModal) {
      loadExitPassword();
    }
  }, [showExitModal]);

  useEffect(() => {
    let unlisten = null;

    const setupListener = async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onCloseRequested(async (event) => {
          if (isExitingRef.current) return;

          // Only prevent exit and show modal if we are on the protected pages
          if (['/exam', '/waiting', '/review'].includes(locationRef.current.pathname)) {
            event.preventDefault();
            setShowExitModal(true);
          }
          // Otherwise allow default (close)
        });
      } catch (err) {
        console.warn('Failed to setup close listener:', err);
      }
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Prevent Alt+Tab (Focus Loss) Logic
  useEffect(() => {
    const handleFocusLoss = async () => {
      // Only enforce focus if we are on the protected pages
      if (['/exam', '/waiting', '/review'].includes(location.pathname)) {
        console.warn('Focus lost! Attempting to refocus...');
        try {
          const appWindow = getCurrentWindow();
          await appWindow.setFocus();
          // Optional: You could also flag this as a "cheating attempt" here
        } catch (e) {
          console.error('Failed to regain focus:', e);
        }
      }
    };

    window.addEventListener('blur', handleFocusLoss);

    return () => {
      window.removeEventListener('blur', handleFocusLoss);
    };
  }, [location]);



  // Enforce Kiosk Mode (Fullscreen + Locked) for Exam Page
  useEffect(() => {
    const updateKioskLevel = async () => {
      try {
        if (['/exam', '/waiting', '/review'].includes(location.pathname)) {
          await invoke('enter_kiosk_mode');
          console.log('Entered Kiosk Mode');
        } else {
          try {
            await invoke('exit_kiosk_mode');
            console.log('Exited Kiosk Mode');
          } catch (e) {
            // Ignore if not in kiosk mode or window not found
          }
        }
      } catch (err) {
        console.error('Failed to toggle kiosk mode:', err);
      }
    };

    updateKioskLevel();
  }, [location]);

  const handleConfirmExit = async () => {
    try {
      isExitingRef.current = true;
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (err) {
      console.error('Failed to exit:', err);
      isExitingRef.current = false;
    }
  };

  return (
    <>
      <ExitModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onConfirm={handleConfirmExit}
        requiredPassword={exitPassword}
        examTitle={examTitle}
      />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/main" element={<MainPage />} />
          <Route path="/waiting" element={<WaitingPage />} />
          <Route path="/exam" element={<ExamPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/check-readiness" element={<CheckReadiness />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;

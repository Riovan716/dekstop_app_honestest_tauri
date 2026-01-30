import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { load } from '@tauri-apps/plugin-store';
import { downloadExamConfigFile, getStudentExamAttempts } from '../api/exam.js';
import { fileToBase64, blobToFile } from '../utils/fileUtils.js';
import logo from '../assets/logo.png';
import getIcon from '../assets/get.png';
import readinessIcon from '../assets/readlines.png';
import clearIcon from '../assets/clear.png';
import exitIcon from '../assets/exit.png';
import './MainPage.css';

export default function MainPage() {
  const [examConfigFile, setExamConfigFile] = useState(null);
  const [nim, setNim] = useState('');
  const [name, setName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [configPassword, setConfigPassword] = useState('');
  const [passwordErrMessage, setPasswordErrMessage] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [examId, setExamId] = useState('');
  const [showDownloadOption, setShowDownloadOption] = useState(false);
  const navigate = useNavigate();

  const getUserData = async () => {
    try {
      const store = await load('store.json');
      const tempNim = await store.get('user-nim');
      const tempName = await store.get('user-name');
      const tempDeviceID = await store.get('device-id');

      if (!tempNim || !tempName || !tempDeviceID) {
        navigate('/');
        return;
      }

      setNim(tempNim || '');
      setName(tempName || '');
      setDeviceId(tempDeviceID || '');
    } catch (error) {
      console.error('Error getting user data:', error);
      navigate('/');
    }
  };

  const handleDownloadFromBackend = async () => {
    if (!examId) {
      setPasswordErrMessage('Please enter exam ID');
      return;
    }

    try {
      setPasswordErrMessage('');
      const blob = await downloadExamConfigFile(parseInt(examId));
      const file = blobToFile(blob, `exam_${examId}.ta12`);
      setExamConfigFile(file);
      setShowPasswordDialog(true);
    } catch (error) {
      setPasswordErrMessage(error.message || 'Failed to download exam file');
      console.error('Error downloading exam file:', error);
    }
  };

  const handleFileSelect = async () => {
    try {
      const selected = await openDialog({
        filters: [
          {
            name: 'Exam Config',
            extensions: ['ta12'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        const fileText = await readFile(selected, { encoding: 'utf-8' });
        const file = new File([fileText], selected.split(/[/\\]/).pop() || 'exam.ta12', {
          type: 'text/plain',
        });

        setExamConfigFile(file);
        setShowPasswordDialog(true);
      }
    } catch (error) {
      console.error('Error selecting file:', error);
    }
  };

  const handleDecrypt = async () => {
    if (!examConfigFile) return;

    setPasswordErrMessage('');
    try {
      let base64Data;
      if (examConfigFile.type === 'text/plain' || examConfigFile.name.endsWith('.ta12')) {
        base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const text = reader.result;
            const cleaned = text.trim().replace(/\s/g, '');
            if (!cleaned) {
              reject(new Error('File is empty'));
              return;
            }
            resolve(cleaned);
          };
          reader.onerror = (error) => reject(new Error(`Failed to read file: ${error}`));
          reader.readAsText(examConfigFile, 'UTF-8');
        });
      } else {
        base64Data = await fileToBase64(examConfigFile);
        if (base64Data.includes(',')) {
          base64Data = base64Data.split(',')[1];
        }
      }

      if (!base64Data || base64Data.length === 0) {
        setPasswordErrMessage('File is empty or invalid');
        return;
      }

      if (!configPassword || configPassword.trim().length === 0) {
        setPasswordErrMessage('Please enter config password');
        return;
      }

      const result = await invoke('decrypt_exam_file', {
        fileBase64: base64Data,
        password: configPassword.trim(),
      });

      if (result.data) {
        console.log('Decrypted exam data:', result.data);

        // Check allowed attempts
        if (result.data.allowed_attempts) {
          try {
            const attempts = await getStudentExamAttempts(result.data.id, nim);
            if (attempts >= result.data.allowed_attempts) {
              setPasswordErrMessage(`You have reached the maximum number of attempts (${result.data.allowed_attempts}) for this exam.`);
              return;
            }
          } catch (error) {
            console.error('Error checking attempts:', error);
            setPasswordErrMessage('Failed to verify attempt limit. Please check your connection.');
            return;
          }
        }

        const store = await load('store.json');
        await store.set('exam-data', result.data);
        await store.save();
        // Navigate to waiting page after successful decrypt
        navigate('/waiting');
      } else {
        setPasswordErrMessage(result.message || 'Wrong password');
      }
    } catch (error) {
      setPasswordErrMessage('Failed to decrypt file');
      console.error('Error decrypting file:', error);
    }
  };

  const handleClearAppData = async () => {
    if (window.confirm('Are you sure you want to clear all app data? This will log you out.')) {
      try {
        const store = await load('store.json');
        await store.clear();
        await store.save();
        navigate('/');
      } catch (error) {
        console.error('Error clearing app data:', error);
      }
    }
  };

  const handleExitApp = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      console.error('Error exiting app:', error);
    }
  };

  useEffect(() => {
    getUserData();
  }, []);

  return (
    <div className="main-page">
      <div className="main-content">
        <div className="logo-container">
          <img src={logo} alt="HONESTEST Logo" className="logo" />
        </div>

        <div className="form-card">
          <div className="form-group">
            <label>NIM</label>
            <input
              type="text"
              value={nim}
              readOnly
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              readOnly
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Device Id</label>
            <input
              type="text"
              value={deviceId}
              readOnly
              className="form-input device-id"
            />
          </div>

          <div className="form-group">
            <label>Exam Config</label>
            <input
              type="text"
              value={examConfigFile ? examConfigFile.name : ''}
              readOnly
              className="form-input exam-config-input"
              placeholder="Choose File"
            />
          </div>

          <div className="action-buttons">
            <button
              onClick={handleFileSelect}
              className="btn-main-action btn-open-config"
            >
              Open Exam Config
            </button>

            <button
              className="btn-main-action btn-get-credential"
              onClick={() => {
                // This can be implemented later for credential file generation
                alert('Get Credential File feature coming soon');
              }}
            >
              <img src={getIcon} alt="Get Credential" className="btn-icon-img" />
              Get Credential File
            </button>
          </div>
        </div>
      </div>

      <div className="footer-buttons">
        <button className="footer-btn" onClick={() => navigate('/check-readiness')}>
          <img src={readinessIcon} alt="Readiness" className="footer-icon-img" />
          Check Readiness
        </button>
        <button className="footer-btn" onClick={handleClearAppData}>
          <img src={clearIcon} alt="Clear Data" className="footer-icon-img" />
          Clear App Data
        </button>
        <button className="footer-btn" onClick={handleExitApp}>
          <img src={exitIcon} alt="Exit" className="footer-icon-img" />
          Exit App
        </button>
      </div>

      {showPasswordDialog && (
        <div className="modal-overlay" onClick={() => setShowPasswordDialog(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => {
                setShowPasswordDialog(false);
                setConfigPassword('');
                setPasswordErrMessage('');
              }}
            >
              ×
            </button>
            <h2 className="modal-title">Insert Config Password</h2>
            <p className="modal-instruction">
              To get the config password, ask your lecturer or exam supervisor.
            </p>
            <div className="modal-form">
              <label className="modal-label">Config Password</label>
              <input
                type="password"
                value={configPassword}
                onChange={(e) => {
                  setConfigPassword(e.target.value);
                  setPasswordErrMessage('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleDecrypt();
                  }
                }}
                className="modal-input"
                placeholder="Enter config password"
              />
              {passwordErrMessage && (
                <span className="modal-error">{passwordErrMessage}</span>
              )}
            </div>
            <div className="modal-buttons">
              <button
                className="btn-modal-start"
                onClick={handleDecrypt}
              >
                Start
              </button>
              <button
                className="btn-modal-cancel"
                onClick={() => {
                  setShowPasswordDialog(false);
                  setConfigPassword('');
                  setPasswordErrMessage('');
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

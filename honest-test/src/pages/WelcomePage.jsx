import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import logo from '../assets/logo.png';
import './WelcomePage.css';

export default function WelcomePage() {
  const [pageState, setPageState] = useState(1);
  const [nim, setNim] = useState('');
  const [name, setName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [nimErrMsg, setNimErrMsg] = useState('');
  const [nameErrMsg, setNameErrMsg] = useState('');
  const navigate = useNavigate();

  const handleSaveUserData = async () => {
    try {
      const store = await load('store.json');
      await store.set('user-nim', nim.toUpperCase());
      await store.set('user-name', name.toUpperCase());
      await store.set('device-id', deviceId);
      await store.save();
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  };

  const getUserData = async () => {
    try {
      const store = await load('store.json');
      const tempNim = await store.get('user-nim');
      const tempName = await store.get('user-name');
      const tempDeviceID = await store.get('device-id');

      // Always start from welcome page, don't auto-navigate
      if (!tempDeviceID) {
        const newDeviceId = await invoke('get_device_id');
        setDeviceId(newDeviceId);
      } else {
        setDeviceId(tempDeviceID);
      }
    } catch (error) {
      console.error('Error getting user data:', error);
      const newDeviceId = await invoke('get_device_id');
      setDeviceId(newDeviceId);
    }
  };

  const handleCopyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(deviceId);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    getUserData();
  }, []);

  return (
    <div className="welcome-page">
      <div className="welcome-content">
        {pageState === 1 && (
          <div className="welcome-screen">
            <div className="logo-container">
              <img src={logo} alt="HONESTEST Logo" className="logo" />
            </div>
            <h1 className="welcome-title">Welcome to HonesTest App</h1>
            <button
              className="btn-next"
              onClick={() => setPageState(2)}
            >
              <span className="btn-arrow">→</span>
              Next
            </button>
          </div>
        )}

        {pageState === 2 && (
          <div className="insert-data-screen">
            <div className="logo-container">
              <img src={logo} alt="HONESTEST Logo" className="logo" />
            </div>
            <h1 className="data-title">Who are you?</h1>
            <div className="form-container">
              <div className="form-group">
                <label>NIM</label>
                <input
                  type="text"
                  value={nim}
                  onChange={(e) => setNim(e.target.value)}
                  className="form-input"
                  placeholder="Enter your NIM"
                />
                {nimErrMsg && <span className="error-message">{nimErrMsg}</span>}
              </div>

              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-input"
                  placeholder="Enter your name"
                />
                {nameErrMsg && <span className="error-message">{nameErrMsg}</span>}
              </div>
            </div>

            <div className="button-group">
              <button
                className="btn-back"
                onClick={() => setPageState(1)}
              >
                <span className="btn-arrow">←</span>
                Back
              </button>
              <button
                className="btn-next"
                onClick={() => {
                  setNimErrMsg('');
                  setNameErrMsg('');
                  if (nim !== '' && name !== '') {
                    handleSaveUserData();
                    setPageState(3);
                  } else {
                    if (nim === '') setNimErrMsg('Please fill this field.');
                    if (name === '') setNameErrMsg('Please fill this field.');
                  }
                }}
              >
                <span className="btn-arrow">→</span>
                Next
              </button>
            </div>
          </div>
        )}

        {pageState === 3 && (
          <div className="insert-data-screen">
            <div className="logo-container">
              <img src={logo} alt="HONESTEST Logo" className="logo" />
            </div>
            <h1 className="data-title">Your Device ID</h1>
            <div className="device-id-container">
              <input
                type="text"
                value={deviceId}
                readOnly
                className="device-id-input"
              />
              <button
                className="copy-button"
                onClick={handleCopyDeviceId}
                title="Copy Device ID"
              >
                📋
              </button>
            </div>
            <div className="button-group">
              <button
                className="btn-back"
                onClick={() => setPageState(2)}
              >
                <span className="btn-arrow">←</span>
                Back
              </button>
              <button
                className="btn-next"
                onClick={() => navigate('/main')}
              >
                <span className="btn-arrow">→</span>
                Finish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import './ExitModal.css';

export default function ExitModal({ isOpen, onClose, onConfirm, requiredPassword = '12345', examTitle = '' }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        // Check against the required password prop
        if (password === requiredPassword) {
            // Allow default '12345' as a master key fallback if necessary, or strictly enforce:
            // if (password === requiredPassword) {
            onConfirm();
        } else {
            setError('Password salah! Minta password keluar ke pengawas.');
        }
    };

    return (
        <div className="exit-modal-overlay">
            <div className="exit-modal-content">
                <h2 className="exit-modal-title">Keluar Aplikasi</h2>
                {examTitle && <p className="exit-modal-exam-name">Ujian: {examTitle}</p>}
                <p className="exit-modal-desc">Masukkan password untuk keluar dari aplikasi.</p>

                <div className="exit-modal-form">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            setError('');
                        }}
                        placeholder="Password Keluar"
                        className="exit-modal-input"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    />
                    {error && <span className="exit-modal-error">{error}</span>}
                </div>

                <div className="exit-modal-buttons">
                    <button onClick={onClose} className="btn-cancel">Batal</button>
                    <button onClick={handleSubmit} className="btn-confirm">Keluar</button>
                </div>
            </div>
        </div>
    );
}

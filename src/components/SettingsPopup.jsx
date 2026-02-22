import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function SettingsPopup({
    isOpen,
    onClose,
    currency,
    setCurrency,
    language,
    setLanguage
}) {
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    if (!isOpen) return null;

    const currencies = [
        { code: 'USD', symbol: '$', name: 'US Dollar' },
        { code: 'EUR', symbol: '€', name: 'Euro' },
        { code: 'CAD', symbol: '$', name: 'Canadian Dollar' },
    ];

    const languages = [
        'English',
        'Español',
        'Dutch',
        'French',
        'Chinese',
        'Japanese'
    ];

    return createPortal(
        <div className="settings-popup-overlay" onClick={onClose}>
            <div className="settings-popup-content" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>Settings</h2>
                    <button className="settings-close-btn" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className="settings-body">
                    {/* Max Slippage */}
                    <div className="settings-item">
                        <div className="settings-item-info">
                            <div className="settings-item-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="19" y1="5" x2="5" y2="19"></line>
                                    <circle cx="6.5" cy="6.5" r="2.5"></circle>
                                    <circle cx="17.5" cy="17.5" r="2.5"></circle>
                                </svg>
                            </div>
                            <div className="settings-item-label">
                                <h3>Max Slippage</h3>
                                <p>Applies to select routes only.</p>
                            </div>
                        </div>
                        <div className="slippage-input-wrapper">
                            <input
                                type="text"
                                defaultValue="1.5"
                                className="slippage-input"
                                readOnly
                            />
                            <span className="unit">%</span>
                        </div>
                    </div>

                    {/* Currency */}
                    <div className="settings-item">
                        <div className="settings-item-info">
                            <div className="settings-item-icon currency-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="1" x2="12" y2="23"></line>
                                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                </svg>
                            </div>
                            <div className="settings-item-label">
                                <h3>Currency</h3>
                            </div>
                        </div>
                        <div className="settings-select-wrapper">
                            <select
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                className="settings-select"
                            >
                                {currencies.map(c => (
                                    <option key={c.code} value={c.code}>
                                        {c.code}
                                    </option>
                                ))}
                            </select>
                            <span className="select-arrow">▾</span>
                        </div>
                    </div>

                    {/* Language */}
                    <div className="settings-item">
                        <div className="settings-item-info">
                            <div className="settings-item-icon language-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="2" y1="12" x2="22" y2="12"></line>
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                                </svg>
                            </div>
                            <div className="settings-item-label">
                                <h3>Language</h3>
                            </div>
                        </div>
                        <div className="settings-select-wrapper">
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="settings-select"
                            >
                                {languages.map(lang => (
                                    <option key={lang} value={lang}>{lang}</option>
                                ))}
                            </select>
                            <span className="select-arrow">▾</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

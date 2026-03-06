import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const CustomSelect = ({ value, onChange, options, label }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={`custom-select-container ${isOpen ? 'open' : ''}`} ref={containerRef}>
            <div className="custom-select-trigger" onClick={() => setIsOpen(!isOpen)}>
                <span>{value}</span>
                <span className="arrow">▼</span>
            </div>
            {isOpen && (
                <div className="custom-select-options">
                    {options.map((opt) => (
                        <div
                            key={typeof opt === 'string' ? opt : opt.code}
                            className={`custom-select-option ${value === (typeof opt === 'string' ? opt : opt.code) ? 'selected' : ''}`}
                            onClick={() => {
                                onChange({ target: { value: typeof opt === 'string' ? opt : opt.code } });
                                setIsOpen(false);
                            }}
                        >
                            {typeof opt === 'string' ? opt : opt.code}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

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
                            <CustomSelect
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                options={currencies}
                            />
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
                            <CustomSelect
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                options={languages}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

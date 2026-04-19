import React, { useEffect, useState, useCallback } from 'react';

export default function LearnPopup({ isOpen, onClose }) {
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        if (isOpen) setIsClosing(false);
    }, [isOpen]);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
            setIsClosing(false);
        }, 200);
    }, [onClose]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) handleClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, handleClose]);

    if (!isOpen) return null;

    return (
        <div 
            className={`learn-popup-overlay ofa-animate-fade-in ${isClosing ? 'ofa-animate-fade-out' : ''}`} 
            style={{ zIndex: 9999 }}
            onClick={handleClose}
        >
            <div 
                className={`learn-popup-content ${isClosing ? 'ofa-animate-pop-out' : 'ofa-animate-pop-in'}`} 
                onClick={(e) => e.stopPropagation()}
            >
                <button className="learn-close-btn" onClick={handleClose}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>

                <div className="learn-header">
                    <div className="learn-icon-badge">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                        </svg>
                    </div>
                    <h2>How to Bridge to Arc Testnet</h2>
                </div>

                <div className="learn-body">
                    <div className="learn-step">
                        <div className="learn-step-header">
                            <div className="step-number">1</div>
                            <h3>Connect Your Wallet</h3>
                        </div>
                        <div className="step-description">
                            <p>Click the <strong>Connect Wallet</strong> button in the top right corner. Ensure your wallet is set to a supported source network like Ethereum or Arbitrum.</p>
                        </div>
                    </div>
                    <div className="step-divider"></div>

                    <div className="learn-step">
                        <div className="learn-step-header">
                            <div className="step-number">2</div>
                            <h3>Select Networks & Assets</h3>
                        </div>
                        <div className="step-description">
                            <p>Choose the <strong>Source</strong> chain you are bridging from and select <strong>Arc Testnet</strong> as your destination. Pick the token you wish to bridge (e.g., USDC).</p>
                        </div>
                    </div>
                    <div className="step-divider"></div>

                    <div className="learn-step">
                        <div className="learn-step-header">
                            <div className="step-number">3</div>
                            <h3>Enter Amount & Confirm</h3>
                        </div>
                        <div className="step-description">
                            <p>Enter the amount you want to bridge. Review the estimated fees and receive amount. Click <strong>Bridge</strong> to trigger the transaction in your wallet.</p>
                        </div>
                    </div>
                    <div className="step-divider"></div>

                    <div className="learn-step">
                        <div className="learn-step-header">
                            <div className="step-number">4</div>
                            <h3>Wait for Confirmation</h3>
                        </div>
                        <div className="step-description">
                            <p>Bridging transactions usually take a few minutes. You can track your progress in the <strong>Activity</strong> tab or via the transaction toast notification.</p>
                        </div>
                    </div>
                </div>

                <div className="learn-footer">
                    <button className="learn-cta-btn" onClick={onClose}>Got it</button>
                </div>
            </div>
        </div>
    );
}

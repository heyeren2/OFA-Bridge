import React, { useState, useEffect } from 'react';
import Turnstile from 'react-turnstile';
import { ShieldCheck, Lock, ShieldAlert } from 'lucide-react';
import './SecurityGate.css';

const SecurityGate = ({ children }) => {
    const [isVerified, setIsVerified] = useState(() => {
        // Optional: Persist verification for the session
        return sessionStorage.getItem('ofa_verified') === 'true';
    });
    const [error, setError] = useState(null);

    // Uses the Site Key from your .env file
    const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

    const handleVerify = (token) => {
        if (token) {
            console.log('Verification successful');
            setIsVerified(true);
            sessionStorage.setItem('ofa_verified', 'true');
        }
    };

    const handleError = () => {
        setError('Verification failed. Please refresh or try again.');
    };

    if (isVerified) {
        return <>{children}</>;
    }

    return (
        <div className="security-gate-overlay">
            <div className="security-gate-content ofa-animate-pop-in">
                <div className="security-gate-header">
                    <div className="security-icon-wrap">
                        <ShieldCheck size={40} className="shield-icon" />
                    </div>
                    <h2>Security Verification</h2>
                    <p>Please complete the verification below to access OFA Bridge.</p>
                </div>

                <div className="verification-box">
                    <div className="lock-indicator">
                        <Lock size={14} />
                        <span>Protected by Cloudflare Turnstile</span>
                    </div>
                    
                    <div className="turnstile-container">
                        <Turnstile
                            sitekey={SITE_KEY}
                            onVerify={handleVerify}
                            onError={handleError}
                            theme="dark"
                        />
                    </div>

                    {error && (
                        <div className="verification-error">
                            <ShieldAlert size={16} />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <div className="security-gate-footer">
                    <p>This check helps us prevent malicious bot activity and ensure a fast experience for all users.</p>
                </div>
            </div>
        </div>
    );
};

export default SecurityGate;

import React, { useState, useEffect } from 'react';
import Turnstile from 'react-turnstile';
import { ShieldCheck, Lock, ShieldAlert } from 'lucide-react';
import './SecurityGate.css';

const SecurityGate = ({ children }) => {
    const [isVerified, setIsVerified] = useState(() => {
        // Automatically verify if running on localhost
        if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            return true;
        }
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
            <div className="security-gate-content">
                <header className="security-gate-header">
                    <h1>ofabridge.xyz</h1>
                    <h2>Performing security verification</h2>
                    <p>
                        This website uses a security service to protect against malicious bots. 
                        This page is displayed while the website verifies you are not a bot.
                    </p>
                </header>

                <div className="verification-box">
                    <div className="turnstile-container">
                        <Turnstile
                            sitekey={SITE_KEY}
                            onVerify={handleVerify}
                            onError={handleError}
                            theme="dark"
                            appearance="always" // Forces the checkbox to show
                        />
                    </div>

                    {error && (
                        <div className="verification-error">
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <footer className="security-gate-footer">
                    <div className="footer-line"></div>
                    <div className="ray-id">Ray ID: <code>{Math.random().toString(16).slice(2, 18)}</code></div>
                    <div className="footer-links">
                        <span>Performance and Security by <a href="https://www.cloudflare.com/5xx-error-landing" target="_blank" rel="noreferrer">Cloudflare</a></span>
                        <span className="divider">|</span>
                        <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Privacy</a>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default SecurityGate;

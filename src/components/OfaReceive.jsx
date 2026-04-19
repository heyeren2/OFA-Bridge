import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { useAccount } from 'wagmi';
import './OfaReceive.css';

export default function OfaReceive({ isOpen, onClose, onConfirm, initialValue }) {
    const { address: connectedAddress } = useAccount();
    const [address, setAddress] = useState(initialValue || '');
    const [isValid, setIsValid] = useState(false);
    const [showWarning, setShowWarning] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setAddress(initialValue || '');
            setIsClosing(false);
        }
    }, [isOpen, initialValue]);

    useEffect(() => {
        const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(address);
        const isDomain = address.includes('.') && address.length > 3;
        const valid = isEvmAddress || isDomain;
        setIsValid(valid);

        if (address && connectedAddress && valid) {
            setShowWarning(address.toLowerCase() !== connectedAddress.toLowerCase());
        } else {
            setShowWarning(false);
        }
    }, [address, connectedAddress]);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
            setIsClosing(false);
        }, 200); // Match CSS animation duration
    }, [onClose]);

    if (!isOpen) return null;

    const handleDone = () => {
        if (isValid) {
            onConfirm(address);
            handleClose();
        }
    };

    return createPortal(
        <div 
            className={`ofa-receive-modal-overlay ofa-animate-fade-in ${isClosing ? 'ofa-animate-fade-out' : ''}`} 
            style={{ zIndex: 9999 }}
            onClick={handleClose}
        >
            <div 
                className={`ofa-receive-modal-content ${isClosing ? 'ofa-animate-pop-out' : 'ofa-animate-pop-in'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="ofa-receive-modal-header">
                    <button className="ofa-receive-back-btn" onClick={handleClose}>
                        <X size={24} />
                    </button>
                    <h2 className="ofa-receive-modal-title">Recipient Address</h2>
                    <div style={{ width: 24 }}></div>
                    {/* Add spacer to help center the title since back button is absolute-positioned in CSS sometimes, 
                        or use flex-header as I did before. */}
                </div>

                <div className="ofa-receive-input-container">
                    <input
                        type="text"
                        className="ofa-receive-address-input"
                        placeholder="Enter 0x address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        autoFocus
                    />
                </div>

                {showWarning && (
                    <div className="ofa-receive-warning-box">
                        <AlertTriangle size={18} className="ofa-receive-warning-icon" />
                        <div className="ofa-receive-warning-text">
                            This address is different from your connected wallet. Please double check before swapping.
                        </div>
                    </div>
                )}

                <div className="ofa-receive-modal-footer">
                    <button
                        className={`ofa-receive-done-btn ${isValid ? 'ofa-receive-done-btn--active' : ''}`}
                        onClick={handleDone}
                        disabled={!isValid}
                    >
                        Save Recipient
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

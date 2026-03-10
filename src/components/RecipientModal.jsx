import React, { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useAccount } from 'wagmi';
import './RecipientModal.css';

export default function RecipientModal({ isOpen, onClose, onConfirm, initialValue }) {
    const { address: connectedAddress } = useAccount();
    const [address, setAddress] = useState(initialValue || '');
    const [isValid, setIsValid] = useState(false);
    const [showWarning, setShowWarning] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setAddress(initialValue || '');
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

    if (!isOpen) return null;

    const handleDone = () => {
        if (isValid) {
            onConfirm(address);
            onClose();
        }
    };

    return (
        <div className="recipient-modal-overlay" style={{ zIndex: 9999 }}>
            <div className="recipient-modal-content">
                <div className="recipient-modal-header">
                    <button className="back-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                    <h2 className="modal-title">Send to wallet</h2>
                    <div style={{ width: 24 }}></div>
                </div>

                <div className="recipient-input-container">
                    <input
                        type="text"
                        className="recipient-address-input"
                        placeholder="Enter address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        autoFocus
                    />
                </div>

                {showWarning && (
                    <div className="recipient-warning-box">
                        <AlertTriangle size={18} className="warning-icon" />
                        <div className="warning-text">
                            This isn't the connected wallet address. Please ensure that the address provided is accurate.
                        </div>
                    </div>
                )}

                <div className="recipient-modal-footer">
                    <button
                        className={`done-btn ${isValid ? 'done-btn--active' : ''}`}
                        onClick={handleDone}
                        disabled={!isValid}
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

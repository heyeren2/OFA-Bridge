import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, 
    Check, 
    ArrowRight, 
    Clock, 
    Loader2, 
    ExternalLink,
    ChevronRight,
    Circle,
    CheckCircle2,
    Settings
} from 'lucide-react';

/**
 * OfaModal - Specialized transaction modal for OfaSwap
 * 
 * Props:
 * - isOpen: boolean
 * - onClose: function
 * - step: 'approving' | 'swapping' | 'success' | 'error'
 * - fromAmount: string (e.g. "10000.00")
 * - fromToken: { symbol, icon }
 * - toAmount: string (e.g. "3805.00")
 * - toToken: { symbol, icon }
 * - txHash: string
 * - explorerUrl: string
 * - recipientAddress: string
 * - error: string
 * - stats: { gasFee: string, estTime: string, slippage: string, rate: string }
 */
export default function OfaModal({
    isOpen,
    onClose,
    onRetry,
    step = 'approving',
    fromAmount,
    fromToken,
    toAmount,
    toToken,
    txHash,
    explorerUrl,
    recipientAddress,
    error,
    stats = { gasFee: '< $0.01', estTime: '~2s', slippage: '1.0%', rate: '1 CAT = 0.3805 DARC' }
}) {
    const [isClosing, setIsClosing] = useState(false);

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

    const isSuccess = step === 'success';

    return createPortal(
        <div className={`ofa-modal-overlay ofa-animate-fade-in ${isClosing ? 'ofa-animate-fade-out' : ''}`} onClick={handleClose}>
            <div className={`ofa-modal-container ${isClosing ? 'ofa-animate-pop-out' : 'ofa-animate-pop-in'}`} onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="ofa-modal-header">
                    <h2>Transaction Details</h2>
                    <button className="ofa-modal-close" onClick={handleClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="ofa-modal-body">
                    {isSuccess ? (
                        <SuccessView 
                            fromAmount={fromAmount}
                            fromToken={fromToken}
                            toAmount={toAmount}
                            toToken={toToken}
                            explorerUrl={explorerUrl}
                            txHash={txHash}
                            onClose={handleClose}
                        />
                    ) : (
                        <ProcessingView 
                            step={step}
                            fromAmount={fromAmount}
                            fromToken={fromToken}
                            toAmount={toAmount}
                            toToken={toToken}
                            stats={stats}
                            error={error}
                            onRetry={onRetry}
                        />
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

function ProcessingView({ step, fromAmount, fromToken, toAmount, toToken, stats, error, onRetry }) {
    const isCancelled = error?.toLowerCase().includes('reject') || error?.toLowerCase().includes('denied');
    
    return (
        <div className="ofa-processing-view">
            {/* 1. COMPACT TOKEN ROW */}
            <div className="ofa-modal-card route-card-v2">
                <div className="route-row-v2">
                    <div className="token-group">
                        <div className="token-icon-v2">
                            <img src={fromToken?.icon} alt="" />
                            <img src="/icons/Arc.png" className="network-badge-v2" alt="" />
                        </div>
                        <div className="token-label-v2">
                            <span className="network-name">Arc</span>
                            <span className="token-amount">{fromAmount} {fromToken?.symbol}</span>
                        </div>
                    </div>
                    
                    <div className="route-connector-v2">
                        <ArrowRight size={16} />
                    </div>

                    <div className="token-group">
                        <div className="token-icon-v2">
                            <img src={toToken?.icon} alt="" />
                            <img src="/icons/Arc.png" className="network-badge-v2" alt="" />
                        </div>
                        <div className="token-label-v2">
                            <span className="network-name">Arc</span>
                            <span className="token-amount">{toAmount} {toToken?.symbol}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. STEPS CARD */}
            <div className="ofa-modal-card steps-card-v2">
                <div className="steps-line-connector"></div>
                
                <div className={`step-item-v2 ${step === 'approving' ? 'active' : (step === 'swapping' || step === 'success') ? 'completed' : 'upcoming'}`}>
                    <div className="step-indicator-v2">
                        {step === 'approving' ? (
                            isCancelled ? (
                                <div className="indicator-x-red">
                                    <X size={12} strokeWidth={4} />
                                </div>
                            ) : (
                                <div className="spinning-vanilla-line" />
                            )
                        ) : (step === 'swapping' || step === 'success') ? (
                            <div className="checkmark-vanilla">
                                <Check size={12} strokeWidth={4} />
                            </div>
                        ) : (
                            <div className="step-circle-upcoming" />
                        )}
                    </div>
                    <div className="step-title-group">
                        <span className="step-main-text">Approve {fromToken?.symbol} for swap</span>
                        <span className="step-subtitle">Approve in wallet</span>
                    </div>
                    <div className={`step-status-v2 ${step === 'approving' ? (isCancelled ? 'cancelled' : 'pending') : (step === 'swapping' || step === 'success') ? 'done' : 'upcoming'}`}>
                        {step === 'approving' ? (isCancelled ? 'CANCELLED' : 'PENDING') : (step === 'swapping' || step === 'success') ? 'DONE' : ''}
                    </div>
                </div>

                <div className={`step-item-v2 ${step === 'swapping' ? 'active' : step === 'success' ? 'completed' : 'upcoming'}`}>
                    <div className="step-indicator-v2">
                        {step === 'swapping' ? (
                            isCancelled ? (
                                <div className="indicator-x-red">
                                    <X size={12} strokeWidth={4} />
                                </div>
                            ) : (
                                <div className="spinning-vanilla-line" />
                            )
                        ) : step === 'success' ? (
                            <div className="checkmark-vanilla">
                                <Check size={12} strokeWidth={4} />
                            </div>
                        ) : (
                            <div className="step-circle-upcoming" />
                        )}
                    </div>
                    <div className="step-title-group">
                        <span className="step-main-text">Swap tokens</span>
                        <span className="step-subtitle">Confirm in wallet</span>
                    </div>
                    <div className={`step-status-v2 ${step === 'swapping' ? (isCancelled ? 'cancelled' : 'pending') : step === 'success' ? 'done' : 'upcoming'}`}>
                        {step === 'swapping' ? (isCancelled ? 'CANCELLED' : 'PENDING') : step === 'success' ? 'DONE' : ''}
                    </div>
                </div>
            </div>

            {/* 3. STATS CARD */}
            <div className="ofa-modal-card stats-card">
                <div className="stat-row">
                    <span className="label">Est. Time</span>
                    <span className="value">{stats?.estTime || '--'}</span>
                </div>
                <div className="stat-row">
                    <span className="label">Est. Gas Fee</span>
                    <span className="value">{stats?.gasFee || 'Calculating...'}</span>
                </div>
            </div>

            {/* Main Action Button */}
            {!isCancelled ? (
                <button className="ofa-modal-action-btn processing" disabled>
                    {step === 'approving' && <><Loader2 size={18} className="spin" /> APPROVING {fromToken?.symbol}...</>}
                    {step === 'swapping' && <><Loader2 size={18} className="spin" /> SWAPPING...</>}
                </button>
            ) : (
                <button className="ofa-modal-action-btn retry" onClick={onRetry}>
                    {step === 'approving' ? 'RE-APPROVE' : 'RE-SWAP'}
                </button>
            )}

            {error && !isCancelled && (
                <div className="ofa-modal-error">
                    <X size={14} />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}

function SuccessView({ fromAmount, fromToken, toAmount, toToken, explorerUrl, txHash, onClose }) {
    const hashSnippet = txHash ? `${txHash.slice(-8)}` : 'Details';

    const formatAmount = (val) => {
        if (!val) return '0.00';
        const num = parseFloat(val);
        if (isNaN(num)) return val;
        // Truncate to 2 decimal places as requested (e.g. 10.8555 -> 10.85)
        const truncated = Math.trunc(num * 100) / 100;
        return truncated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    return (
        <div className="ofa-success-view">
            <div className="success-hero">
                <div className="hero-icon-container">
                    <div className="hero-icon-bg">
                        <img src="/icons/Ofa2.png" alt="Success" className="hero-rocket" />
                    </div>
                    <div className="hero-badge">
                        <Check size={14} strokeWidth={4} />
                    </div>
                </div>
                <h3 className="success-sub-header">Transaction Completed</h3>
            </div>

            <div className="ofa-modal-card summary-card">
                <div className="summary-row">
                    <span className="label">SENT</span>
                    <div className="val">
                        <img src={fromToken?.icon} alt="" className="summary-token-icon" />
                        <span className="summary-amount">{formatAmount(fromAmount)} {fromToken?.symbol}</span>
                    </div>
                </div>
                <div className="summary-row">
                    <span className="label">RECEIVED</span>
                    <div className="val received-group">
                        <div className="received-left">
                            <img src={toToken?.icon} alt="" className="summary-token-icon" />
                            <span className="summary-amount">{formatAmount(toAmount)} {toToken?.symbol}</span>
                        </div>
                        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="hash-snippet-link">
                            {hashSnippet} <ExternalLink size={10} />
                        </a>
                    </div>
                </div>
            </div>

            <div className="success-actions">
                <button className="ofa-modal-primary-btn success-done-btn" onClick={onClose}>
                    DONE
                </button>
            </div>
        </div>
    );
}

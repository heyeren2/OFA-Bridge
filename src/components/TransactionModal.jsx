import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    Check,
    CheckCircle2,
    Loader2,
    ArrowUpRight,
    RefreshCw,
    ArrowRight,
    Clock,
    Circle
} from 'lucide-react';
import { getChainByName } from '../config/chains';
import { TOKEN_INFO } from '../config/contracts';

const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatAmount = (val) => {
    if (!val || isNaN(parseFloat(val))) return '0.00';
    const [int, frac] = val.toString().split('.');
    return `${int}.${(frac || '00').padEnd(2, '0').slice(0, 2)}`;
};

const truncateAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

export default function TransactionModal({
    isOpen,
    onClose,
    bridgeStep,
    stepStatuses, // { 'approve': 'completed', 'burn': 'pending', ... }
    bridgeSteps,
    error,
    txData,
    amount,
    selectedToken,
    fromChain,
    toChain,
    destAddress,
    walletAddress,
    isSwapAndBridge,
    destToken,
    destAmount,
    onRemint,
    isReminting
}) {
    const [prevStep, setPrevStep] = useState(null);
    const prevStepRef = useRef(bridgeStep);

    const [totalElapsed, setTotalElapsed] = useState(0);
    const [stepElapsed, setStepElapsed] = useState(0);
    const bridgeStartRef = useRef(null);
    const stepStartRef = useRef(null);
    const timerRef = useRef(null);
    const [totalTime, setTotalTime] = useState(null);

    useEffect(() => {
        if (isOpen && !bridgeStartRef.current) {
            bridgeStartRef.current = Date.now();
            stepStartRef.current = Date.now();
            setTotalElapsed(0);
            setStepElapsed(0);
            setTotalTime(null);
        }
        if (!isOpen) {
            bridgeStartRef.current = null;
            stepStartRef.current = null;
            setTotalElapsed(0);
            setStepElapsed(0);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && bridgeStep !== 'complete' && !error) {
            timerRef.current = setInterval(() => {
                if (bridgeStartRef.current) {
                    setTotalElapsed(Math.floor((Date.now() - bridgeStartRef.current) / 1000));
                }
                if (stepStartRef.current) {
                    setStepElapsed(Math.floor((Date.now() - stepStartRef.current) / 1000));
                }
            }, 1000);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [isOpen, bridgeStep, error]);

    useEffect(() => {
        if (bridgeStep !== prevStepRef.current) {
            setPrevStep(prevStepRef.current);
            prevStepRef.current = bridgeStep;
            stepStartRef.current = Date.now();
            setStepElapsed(0);

            if (bridgeStep === 'complete' && bridgeStartRef.current) {
                setTotalTime(Math.floor((Date.now() - bridgeStartRef.current) / 1000));
                if (timerRef.current) clearInterval(timerRef.current);
            }
        }
    }, [bridgeStep]);

    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    if (!isOpen) return null;

    const toChainData = getChainByName(toChain);
    const fromChainData = getChainByName(fromChain);

    const getShortenedChainName = (name) => {
        if (!name) return '';
        if (name.includes('Ethereum Sepolia')) return 'Sepolia';
        if (name.includes('Arc Testnet')) return 'Arc';
        if (name.includes('Base Sepolia')) return 'Base';
        if (name.includes('Optimism Sepolia')) return 'Optimism';
        if (name.includes('Arbitrum Sepolia')) return 'Arbitrum';
        return name.replace(' Testnet', '').replace(' Sepolia', '');
    };

    const STEP_DESCRIPTIONS = {
        swap: 'Exchanging ETH for USDC...',
        approve: 'Waiting for wallet confirmation...',
        burn: 'Confirming burn transaction...',
        attestation: 'Circle is verifying attestation...',
        mint: 'Confirming mint transaction...',
    };

    const steps = (bridgeSteps || []).map((s, idx) => ({
        id: s.key,
        index: idx,
        label: s.label,
        activeDesc: s.activeDesc || STEP_DESCRIPTIONS[s.key] || 'Processing...',
    }));

    const stepOrder = steps.map(s => s.id);
    const currentIndex = stepOrder.indexOf(bridgeStep);
    const isComplete = bridgeStep === 'complete' && !error;
    const isCancelled = error === 'CANCELLED';

    const getStepStatus = (stepId) => {
        if (isComplete) return 'completed';
        if (isCancelled) {
            const targetIndex = stepOrder.indexOf(stepId);
            if (currentIndex > targetIndex) return 'completed';
            if (currentIndex === targetIndex) return 'error';
            return 'pending';
        }

        const explicitStatus = stepStatuses?.[stepId];
        if (explicitStatus === 'error') return 'error';

        const targetIndex = stepOrder.indexOf(stepId);
        if (currentIndex > targetIndex) return 'completed';

        if (explicitStatus === 'completed') return 'completed';

        if (currentIndex === targetIndex) {
            if (error) return 'error';
            // pending/started = show spinner
            if (explicitStatus === 'pending' || explicitStatus === 'started') return 'active';
            return 'active'; // default for current step
        }

        return 'pending';
    };

    const progressPercent = isComplete ? 100 : ((currentIndex) / steps.length) * 100;

    const remainingSeconds = Math.max(0, 90 - totalElapsed);

    return createPortal(
        <div className="tx-modal-overlay" onClick={onClose}>
            <div className={`txm-modal ${isCancelled ? 'cancelled' : ''}`} onClick={(e) => e.stopPropagation()}>
                <button className="txm-close" onClick={onClose}>
                    <X size={18} />
                </button>

                {/* Header */}
                <div className="txm-header">
                    <div className="txm-header-left">
                        <h2>{isComplete ? 'Bridge Complete' : isCancelled ? 'Bridge Transaction' : 'Bridge Transaction'}</h2>
                        <div className="txm-header-route">
                            <div className="txm-route-token">
                                <img src={fromChainData?.icon} alt="" width={14} height={14} />
                                <span>{getShortenedChainName(fromChain)}</span>
                            </div>
                            <ArrowRight size={12} className="txm-route-arrow" />
                            <div className="txm-route-token">
                                <img src={toChainData?.icon} alt="" width={14} height={14} />
                                <span>{getShortenedChainName(toChain)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Progress & Amount Row */}
                {!isComplete && (
                    <div className="txm-progress-section">
                        <div className="txm-progress-bar-wrapper">
                            <div className="txm-progress-bar-container">
                                <div
                                    className="txm-progress-bar-fill"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>

                        <div className="txm-progress-details">
                            <div className="txm-header-amount-pill-container">
                                <div className="txm-header-amount-pill">
                                    <img src={TOKEN_INFO[selectedToken]?.icon || '/icons/usdc.png'} alt={selectedToken} width={16} height={16} />
                                    <span>{formatAmount(amount)} {selectedToken}</span>
                                </div>
                                {isCancelled && (
                                    <div className="txm-cancelled-badge">
                                        <span>Cancelled</span>
                                    </div>
                                )}
                            </div>
                            {!isCancelled && (
                                <div className="txm-header-timer-remaining">
                                    <span className="remaining-label">-{formatTime(remainingSeconds)} remaining</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Body */}
                <div className="txm-body">
                    {isComplete ? (
                        <div className="txm-success-v4">
                            <div className="success-hero-icon">
                                <Check size={40} strokeWidth={3} />
                            </div>

                            <h1>Bridge Successful!</h1>
                            <p>
                                {isSwapAndBridge || destToken === 'ETH' ? (
                                    <>
                                        {formatAmount(amount)} {selectedToken} <ArrowRight size={14} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 4px' }} /> {formatAmount(destAmount)} {destToken} received on {getShortenedChainName(toChain)}
                                    </>
                                ) : (
                                    <>{formatAmount(destAmount)} {selectedToken} received on {getShortenedChainName(toChain)}</>
                                )}
                            </p>
                            {destAddress?.toLowerCase() !== walletAddress?.toLowerCase() && (
                                <div className="txm-recipient-display">
                                    <span className="label">Recipient:</span>
                                    <span className="address">{truncateAddress(destAddress)}</span>
                                </div>
                            )}

                            <div className="txm-network-grid">
                                <div className="txm-network-box txm-network-box--multi">
                                    <div className="txm-network-info">
                                        <div className="txm-network-icon-circle">
                                            <img src={fromChainData?.icon} alt="" width={20} height={20} />
                                        </div>
                                        <div className="txm-network-details">
                                            <span className="txm-network-label">SOURCE CHAIN</span>
                                            <div className="txm-link-group">
                                                <span className="txm-chain-main-link">
                                                    View on {getShortenedChainName(fromChain)}
                                                </span>
                                                {txData.swapHash && (
                                                    <a href={`${fromChainData?.explorer}/tx/${txData.swapHash}`} target="_blank" rel="noreferrer" className="txm-sub-link">
                                                        Swap <ArrowUpRight size={12} />
                                                    </a>
                                                )}
                                                <a href={`${fromChainData?.explorer}/tx/${txData.sourceHash}`} target="_blank" rel="noreferrer" className="txm-sub-link">
                                                    Burn <ArrowUpRight size={12} />
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="txm-network-box txm-network-box--multi">
                                    <div className="txm-network-info">
                                        <div className="txm-network-icon-circle">
                                            <img src={toChainData?.icon} alt="" width={20} height={20} />
                                        </div>
                                        <div className="txm-network-details">
                                            <span className="txm-network-label">DESTINATION CHAIN</span>
                                            <div className="txm-link-group">
                                                <span className="txm-chain-main-link">
                                                    View on {getShortenedChainName(toChain)}
                                                </span>
                                                <a href={`${toChainData?.explorer}/tx/${txData.destHash}`} target="_blank" rel="noreferrer" className="txm-sub-link">
                                                    Mint <ArrowUpRight size={12} />
                                                </a>
                                                {txData.destSwapHash && (
                                                    <a href={`${toChainData?.explorer}/tx/${txData.destSwapHash}`} target="_blank" rel="noreferrer" className="txm-sub-link">
                                                        Swap <ArrowUpRight size={12} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button className="txm-primary-btn-v4" onClick={onClose}>
                                Back to Bridge
                            </button>

                            <div className="txm-footer-branding">
                                <img src="/icons/circle.png" alt="Circle" width={14} height={14} />
                                <span>Powered by Circle CCTP</span>
                            </div>
                        </div>
                    ) : (
                        <div className="txm-step-list-v2">
                            {steps.map((step) => {
                                const status = getStepStatus(step.id);
                                return (
                                    <div
                                        key={step.id}
                                        className={`txm-step-v2 ${status}`}
                                    >
                                        <div className="txm-step-indicator-v2">
                                            {isReminting && step.id === 'mint' ? (
                                                <div className="txm-step-circle active">
                                                    <div className="rolling-circle" />
                                                </div>
                                            ) : isCancelled && step.id === bridgeStep ? (
                                                <div className="txm-step-circle error">
                                                    <X size={16} />
                                                </div>
                                            ) : isCancelled && stepOrder.indexOf(step.id) > currentIndex ? (
                                                <div className="txm-step-circle pending" />
                                            ) : status === 'completed' ? (
                                                <div className="txm-step-circle completed">
                                                    <CheckCircle2 size={16} />
                                                </div>
                                            ) : status === 'active' && !isCancelled ? (
                                                <div className="txm-step-circle active">
                                                    <div className="rolling-circle" />
                                                </div>
                                            ) : status === 'error' ? (
                                                <div className="txm-step-circle error">
                                                    <X size={16} />
                                                </div>
                                            ) : (
                                                <div className="txm-step-circle pending" />
                                            )}
                                            {step.index < steps.length - 1 && (
                                                <div className={`txm-step-line-v2 ${status === 'completed' ? 'done' : ''}`} />
                                            )}
                                        </div>

                                        <div className="txm-step-content-v2">
                                            <div className="txm-step-row-v2">
                                                <span className={`txm-step-label-v2 ${status}`}>
                                                    {isReminting && step.id === 'mint'
                                                        ? 'Remint USDC'
                                                        : step.label}
                                                </span>
                                                {status === 'completed' && (
                                                    <span className="txm-step-badge-done">DONE</span>
                                                )}
                                                {status === 'active' && !isCancelled && (
                                                    <span className="txm-step-timer-v2">{formatTime(stepElapsed)}</span>
                                                )}
                                            </div>
                                            {isReminting && step.id === 'mint' ? (
                                                <span className="txm-step-description-v2">
                                                    Confirm remint transaction .....
                                                </span>
                                            ) : isCancelled && step.id === bridgeStep && (
                                                <span className="txm-step-label-cancelled-sub">TRANSACTION REJECTED</span>
                                            )}
                                            {status === 'active' && !isCancelled && (
                                                <p className="txm-step-description-v2">{step.activeDesc}</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {error && !isCancelled && (
                        <div className="txm-error-v2">
                            <div className="txm-error-content-v2">
                                <X color="#ef4444" size={16} />
                                <p>{error}</p>
                            </div>
                            {bridgeStep === 'mint' && (
                                <button
                                    className="txm-remint-btn-v2"
                                    onClick={onRemint}
                                    disabled={isReminting}
                                >
                                    {isReminting ? (
                                        <Loader2 size={16} className="spin" />
                                    ) : null}
                                    <span>{isReminting ? 'Reminting...' : 'Remint USDC'}</span>
                                </button>
                            )}
                        </div>
                    )}

                    {isCancelled && bridgeStep === 'mint' && (
                        <div className="txm-remint-container-v2">
                            <button
                                className="txm-remint-btn-v2"
                                onClick={onRemint}
                                disabled={isReminting}
                            >
                                {isReminting ? (
                                    <Loader2 size={16} className="spin" />
                                ) : null}
                                <span>{isReminting ? 'Reminting...' : 'Remint USDC'}</span>
                            </button>
                        </div>
                    )}
                </div>

                {!isComplete && (
                    <>
                        <div className="txm-divider-v3" />
                        {/* Footer */}
                        <div className="txm-footer-v2" style={{ border: 'none', paddingTop: 10, paddingBottom: 10 }}>
                            <button className="txm-footer-btn-v2" onClick={onClose}>
                                {isCancelled ? 'Back to Bridge' : 'Close'}
                            </button>
                            <div className="txm-powered-by">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <img src="/icons/circle.png" alt="Circle" width={12} height={12} />
                                    <span>Powered by Circle CCTP</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}

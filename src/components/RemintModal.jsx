import React from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, RefreshCw, Check } from 'lucide-react';
import { getChainByName } from '../config/chains';
import { TOKEN_INFO } from '../config/contracts';

export const RemintModal = ({ isOpen, isSuccess, mintHash, mintingStep, onClose, onConfirm, tx, isMinting }) => {
    if (!isOpen || !tx) return null;

    const fromChain = getChainByName(tx.fromChain);
    const toChain = getChainByName(tx.toChain);

    const getShortenedChainName = (name) => {
        if (!name) return '';
        if (name.includes('Ethereum Sepolia')) return 'Sepolia';
        if (name.includes('Arc Testnet')) return 'Arc';
        if (name.includes('Base Sepolia')) return 'Base';
        if (name.includes('Optimism Sepolia')) return 'Optimism';
        if (name.includes('Arbitrum Sepolia')) return 'Arbitrum';
        return name.replace(' Testnet', '').replace(' Sepolia', '');
    };

    const formatAmount = (val) => {
        if (!val || isNaN(parseFloat(val))) return '0.00';
        const [int, frac] = val.toString().split('.');
        const truncatedFrac = (frac || '00').padEnd(2, '0').slice(0, 2);
        return `${parseInt(int).toLocaleString()}.${truncatedFrac}`;
    };

    const getExplorerUrl = (chainName, hash) => {
        if (!hash) return '#';
        const c = getChainByName(chainName);
        return c?.explorer ? `${c.explorer}/tx/${hash}` : '#';
    };

    // If remint was successful, show the Success View
    if (isSuccess) {
        return createPortal(
            <div className="tx-modal-overlay" onClick={onClose}>
                <div className="txm-modal" onClick={e => e.stopPropagation()} style={{
                    background: 'var(--midnight-indigo)',
                    maxWidth: '430px',
                    width: '95%',
                    borderRadius: '24px',
                    padding: '32px',
                    position: 'relative',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                    border: '1px solid rgba(240, 231, 213, 0.1)',
                    textAlign: 'center'
                }}>
                    <button className="txm-close" onClick={onClose} style={{
                        position: 'absolute',
                        top: '20px',
                        right: '20px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: 'none',
                        color: 'rgba(240, 231, 213, 0.5)',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '50%',
                        zIndex: 10
                    }}>
                        <X size={18} />
                    </button>

                    <div className="txm-success-header" style={{ marginBottom: '32px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f5deb3', margin: '0 0 12px 0', fontFamily: 'Outfit, sans-serif' }}>Remint Complete</h2>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', color: 'rgba(240,231,213,0.5)' }}>
                            <img src={fromChain?.icon} width={14} height={14} alt="" />
                            <span>{getShortenedChainName(tx.fromChain)}</span>
                            <ArrowRight size={12} />
                            <img src={toChain?.icon} width={14} height={14} alt="" />
                            <span>{getShortenedChainName(tx.toChain)}</span>
                        </div>
                    </div>

                    <div className="txm-success-hero" style={{ marginBottom: '40px' }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            background: 'rgba(240, 231, 213, 0.1)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 20px auto',
                            padding: '12px',
                            border: '1px solid rgba(240, 231, 213, 0.2)',
                            position: 'relative'
                        }}>
                            <img src="/icons/Ofa2.png" alt="Success" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />

                            {/* Success Badge at bottom side */}
                            <div style={{
                                position: 'absolute',
                                bottom: '-2px',
                                right: '-2px',
                                width: '28px',
                                height: '28px',
                                background: '#4f46e5', // Indigo color
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid #0f172a', // Match modal background
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                            }}>
                                <Check size={16} style={{ color: '#f5deb3' }} strokeWidth={3} />
                            </div>
                        </div>
                        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#f5deb3', margin: '0 0 8px 0' }}>Remint Successful!</h1>
                        <p style={{ fontSize: '13.5px', color: 'rgba(240, 231, 213, 0.6)' }}>
                            {formatAmount(tx.amountDisplay)} USDC received on {getShortenedChainName(tx.toChain)}
                        </p>
                    </div>

                    <div className="txm-success-details" style={{ marginBottom: '40px' }}>
                        <div style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: '16px',
                            padding: '16px',
                            border: '1px solid rgba(240, 231, 213, 0.05)',
                            textAlign: 'left'
                        }}>
                            <p style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(240, 231, 213, 0.4)', margin: '0 0 10px 0', letterSpacing: '0.1em' }}>DESTINATION CHAIN</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <img src={toChain?.icon} width={18} height={18} alt="" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span
                                            style={{ color: '#f5deb3', fontSize: '14px', fontWeight: '700', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            View on Explorer
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <a
                                                href={getExplorerUrl(tx.toChain, mintHash || tx.destTxHash)}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={e => e.stopPropagation()}
                                                style={{ fontSize: '9px', fontWeight: '800', padding: '2px 8px', background: 'rgba(240,231,213,0.1)', borderRadius: '4px', color: '#f5deb3', textDecoration: 'none', letterSpacing: '0.05em', cursor: 'pointer', border: '1px solid rgba(240,231,213,0.15)', transition: 'background 0.15s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(240,231,213,0.2)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(240,231,213,0.1)'}
                                            >
                                                MINT TXN ↗
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="txm-actions">
                        <button
                            onClick={onClose}
                            style={{
                                width: '100%',
                                padding: '16px',
                                borderRadius: '16px',
                                background: '#F0E7D5',
                                color: '#212842',
                                border: 'none',
                                fontSize: '16px',
                                fontWeight: '800',
                                cursor: 'pointer',
                                textTransform: 'uppercase',
                                letterSpacing: '0.025em',
                                marginBottom: '20px'
                            }}
                        >
                            Return to Bridge
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'rgba(240, 231, 213, 0.4)', fontSize: '12px' }}>
                            <img src="/icons/circle.png" width={14} height={14} alt="" style={{ opacity: 0.5 }} />
                            <span>Powered by Circle CCTP</span>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    const isAttestationFailed = tx.rawStatus === 'attestation_failed';

    // Step status driven by mintingStep prop from parent:
    //   null        = not started, isMinting=false
    //   'attestation' = fetching fresh attestation from Circle
    //   'mint'      = attestation ready, submitting receiveMessage tx to chain
    const attestationStepStatus = (() => {
        if (!isAttestationFailed) return 'completed'; // normal remint: attestation was fine
        if (!isMinting) return 'pending';
        if (mintingStep === 'mint') return 'completed';  // attestation done, now minting
        return 'active'; // still fetching attestation
    })();

    const mintStepStatus = (() => {
        if (!isMinting) return isAttestationFailed ? 'pending' : 'pending';
        if (isAttestationFailed && mintingStep !== 'mint') return 'pending'; // waiting on attestation
        return 'active'; // minting
    })();

    const steps = [
        {
            key: 'burn',
            label: 'Burn USDC',
            status: 'completed',
            desc: 'USDC burned on source'
        },
        {
            key: 'attestation',
            label: 'Attestation',
            status: attestationStepStatus,
            desc: isAttestationFailed
                ? (attestationStepStatus === 'active'
                    ? 'Fetching fresh Circle signature...'
                    : attestationStepStatus === 'completed'
                        ? 'New attestation received'
                        : 'Attestation expired. Re-attest to proceed.')
                : 'Circle attestation is ready'
        },
        {
            key: 'mint',
            label: 'Mint USDC',
            status: mintStepStatus,
            desc: mintStepStatus === 'active'
                ? 'Confirm mint transaction...'
                : (isAttestationFailed ? 'Waiting for new attestation' : 'Ready to mint on destination')
        }
    ];

    return createPortal(
        <div className="tx-modal-overlay" onClick={onClose}>
            <div className="txm-modal" onClick={e => e.stopPropagation()} style={{
                background: 'var(--midnight-indigo)',
                maxWidth: '430px',
                width: '95%',
                borderRadius: '24px',
                padding: '24px 32px 28px 32px',
                position: 'relative',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                border: '1px solid rgba(240, 231, 213, 0.1)'
            }}>
                <button className="txm-close" onClick={onClose} style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: 'none',
                    color: 'rgba(240, 231, 213, 0.5)',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10
                }}>
                    <X size={18} />
                </button>

                {/* Centered Title */}
                <div className="txm-title-container" style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <h2 style={{
                        fontSize: '20px',
                        fontWeight: '800',
                        color: '#f5deb3',
                        margin: 0,
                        fontFamily: 'Outfit, sans-serif',
                        display: 'inline-block'
                    }}>
                        Remint Transaction
                    </h2>
                </div>

                {/* Horizontal Route and Amount Row */}
                <div className="txm-header-row" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '32px'
                }}>
                    <div className="txm-header-route" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="txm-route-token" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#f5deb3', fontWeight: '600' }}>
                            <img src={fromChain?.icon} alt="" width={15} height={15} style={{ borderRadius: '50%' }} />
                            <span>{getShortenedChainName(tx.fromChain)}</span>
                        </div>
                        <ArrowRight size={12} className="txm-route-arrow" style={{ color: 'rgba(240, 231, 213, 0.4)' }} />
                        <div className="txm-route-token" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#f5deb3', fontWeight: '600' }}>
                            <img src={toChain?.icon} alt="" width={15} height={15} style={{ borderRadius: '50%' }} />
                            <span>{getShortenedChainName(tx.toChain)}</span>
                        </div>
                    </div>

                    <div className="txm-header-amount-pill" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(240, 231, 213, 0.05)',
                        padding: '6px 14px',
                        borderRadius: '100px',
                        border: '1px solid rgba(240, 231, 213, 0.12)',
                        fontSize: '14px',
                        fontWeight: '700',
                        color: '#f5deb3'
                    }}>
                        <img src={TOKEN_INFO['USDC']?.icon || '/icons/usdc.png'} alt="USDC" width={16} height={16} />
                        <span>{formatAmount(tx.amountDisplay)} USDC</span>
                    </div>
                </div>

                <div className="txm-step-list-v2" style={{ display: 'flex', flexDirection: 'column' }}>
                    {steps.map((step, idx) => (
                        <div key={step.key} className={`txm-step-v2 ${step.status}`} style={{ display: 'flex', gap: '16px', marginBottom: idx === steps.length - 1 ? 0 : '16px' }}>
                            <div className="txm-step-indicator-v2" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '32px' }}>
                                {step.status === 'completed' ? (
                                    <div className="txm-step-circle completed" style={{ background: '#10b981', color: 'white', border: 'none' }}>
                                        <CheckCircle2 size={16} />
                                    </div>
                                ) : step.status === 'active' ? (
                                    <div className="txm-step-circle active" style={{ borderColor: 'transparent', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div className="dual-rolling-circle" style={{
                                            width: '18px',
                                            height: '18px',
                                            border: '2px solid #10b981',
                                            borderTopColor: '#F0E7D5',
                                            borderRadius: '50%',
                                            animation: 'rotate 1s linear infinite'
                                        }} />
                                    </div>
                                ) : (
                                    <div className="txm-step-circle pending" style={{ background: '#1e293b', border: '2px solid rgba(240,231,213,0.1)' }} />
                                )}
                                {idx < steps.length - 1 && (
                                    <div className={`txm-step-line-v2 ${step.status === 'completed' ? 'done' : ''}`} style={{
                                        width: '2px',
                                        height: '24px',
                                        background: step.status === 'completed' ? '#10b981' : 'rgba(240, 231, 213, 0.1)',
                                        margin: '4px 0'
                                    }} />
                                )}
                            </div>
                            <div className="txm-step-content-v2" style={{ flex: 1 }}>
                                <div className="txm-step-row-v2" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span className="txm-step-label-v2" style={{ fontSize: '15px', fontWeight: '700', color: '#f5deb3' }}>{step.label}</span>
                                    <span className="txm-step-description-v2" style={{
                                        fontSize: '11.5px',
                                        color: 'rgba(240, 231, 213, 0.5)',
                                        fontWeight: '500',
                                        marginTop: '1px'
                                    }}>
                                        {step.desc}
                                    </span>
                                    {step.status === 'completed' && (
                                        <span className="txm-step-badge-done" style={{ fontSize: '9px', fontWeight: '800', padding: '2px 6px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '4px', letterSpacing: '0.05em', marginLeft: 'auto' }}>DONE</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="modal-actions" style={{ marginTop: '32px' }}>
                    <button
                        className="bridge-btn primary"
                        style={{
                            width: '100%',
                            padding: '16px',
                            borderRadius: '16px',
                            background: '#F0E7D5',
                            color: '#212842',
                            border: 'none',
                            fontSize: '16px',
                            fontWeight: '800',
                            cursor: isMinting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 4px 15px rgba(240, 231, 213, 0.2)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.025em'
                        }}
                        disabled={isMinting}
                        onClick={() => onConfirm(tx)}
                    >
                        {isMinting ? (
                            <span>{mintingStep === 'attestation' ? 'Re-attesting...' : 'Minting...'}</span>
                        ) : (
                            <span>{isAttestationFailed ? 'Re-Attest & Mint' : 'Complete Mint'}</span>
                        )}
                    </button>
                </div>
            </div>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes rotate {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spin {
                    animation: rotate 1.5s linear infinite;
                }
            `}} />
        </div>,
        document.body
    );
};

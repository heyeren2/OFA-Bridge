import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw, Check, Loader2, ArrowRight, ExternalLink, ChevronDown, Monitor, Wallet } from 'lucide-react';
import { CCTP_DOMAIN_IDS, fetchAttestation, checkAttestationStatus } from '../services/attestationService';
import { retryMint } from '../services/bridgeService';
import { SUPPORTED_CHAINS, getChainByName } from '../config/chains';
import './RetryModal.css';

// Map Circle Domain IDs back to our chain names
const DOMAIN_TO_CHAIN = Object.entries(CCTP_DOMAIN_IDS).reduce((acc, [name, id]) => {
    acc[id] = name;
    return acc;
}, {});

export default function RetryModal({ isOpen, onClose }) {
    const [step, setStep] = useState('input'); // 'input' | 'attesting' | 'minting' | 'success' | 'error'
    const [sourceChain, setSourceChain] = useState('Ethereum Sepolia');
    const [burnHash, setBurnHash] = useState('');
    const [error, setError] = useState('');
    const [attestation, setAttestation] = useState(null);
    const [destChain, setDestChain] = useState('');
    const [mintHash, setMintHash] = useState('');
    const [isClosing, setIsClosing] = useState(false);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
            setIsClosing(false);
            // Reset state
            setStep('input');
            setBurnHash('');
            setAttestation(null);
            setError('');
            setDestChain('');
        }, 300);
    }, [onClose]);

    const startRetry = async () => {
        if (!burnHash || burnHash.length < 60) {
            setError('Please enter a valid transaction hash');
            return;
        }

        setError('');
        setStep('attesting');

        try {
            // 1. Fetch Attestation (Iris API)
            const data = await fetchAttestation(burnHash, sourceChain);

            if (!data) {
                throw new Error('Invalid Burn Hash. This transaction does not contain a CCTP Burn event on the selected source chain.');
            }

            // 2. Identify the real destination chain from the message bytes
            // CCTP message hex layout (0x-prefixed, each byte = 2 hex chars):
            //   chars  2- 9  → version        (4 bytes)
            //   chars 10-17  → sourceDomain   (4 bytes)
            //   chars 18-25  → destinationDomain (4 bytes)  ← correct offset
            //   chars 26-41  → nonce          (8 bytes)
            const destDomainHex = data.message.slice(18, 26);
            const destDomainId = parseInt(destDomainHex, 16);
            const targetChain = DOMAIN_TO_CHAIN[destDomainId] || 'Arc Testnet';

            console.log(`[RetryModal] Detected destination domain ${destDomainId} → ${targetChain}`);
            setDestChain(targetChain);

            // 3. PROACTIVE CHECK: simulate on the REAL destination chain (no wallet needed)
            const status = await checkAttestationStatus({
                burnTxHash: burnHash,
                fromChain: sourceChain,
                toChain: targetChain,
            });

            console.log(`[RetryModal] Proactive status for ${targetChain}: ${status}`);

            if (status === 'already_minted') {
                throw new Error('Nonce already used');
            }
            if (status === 'expired') {
                throw new Error('ATTESTATION_EXPIRED');
            }
            if (status === 'pending') {
                throw new Error('Attestation found but not yet valid. Circle may still be signing the message.');
            }

            setAttestation(data);
            setStep('minting');
        } catch (err) {
            let userMsg = err.message;
            if (userMsg.includes('ATTESTATION_EXPIRED')) {
                userMsg = 'The attestation for this transaction has expired. On testnets, signatures are temporary. You may need to initiate a new bridge transaction.';
            } else if (userMsg.includes('Nonce already used') || userMsg.includes('already executed')) {
                userMsg = 'This transaction has already been completed. The tokens were already delivered to the destination wallet.';
            }
            setError(userMsg);
            setStep('error');
        }
    };

    const executeMint = async () => {
        if (!attestation) return;

        setError('');
        try {
            // Use the destination chain decoded from message bytes in startRetry.
            const target = destChain || 'Arc Testnet';

            // ─── GUARD: Simulate on-chain BEFORE triggering the wallet popup ─────
            // This is the definitive check. If the nonce is already consumed the
            // simulation reverts here silently — the wallet popup NEVER fires.
            try {
                const { createPublicClient, http } = await import('viem');
                const { getChainByName: gcn } = await import('../config/chains');
                const { CCTP_MESSAGE_TRANSMITTER, RECEIVE_MESSAGE_ABI } = await import('../services/attestationService');

                const destChainConfig = gcn(target);
                const transmitter = CCTP_MESSAGE_TRANSMITTER[target];

                if (destChainConfig?.rpc && transmitter) {
                    const publicClient = createPublicClient({
                        chain: {
                            id: destChainConfig.chainId,
                            name: target,
                            nativeCurrency: destChainConfig.nativeCurrency || { name: 'ETH', symbol: 'ETH', decimals: 18 },
                            rpcUrls: { default: { http: [destChainConfig.rpc] } },
                        },
                        transport: http(destChainConfig.rpc),
                    });

                    await publicClient.simulateContract({
                        address: transmitter,
                        abi: RECEIVE_MESSAGE_ABI,
                        functionName: 'receiveMessage',
                        args: [attestation.message, attestation.attestation],
                    });
                    console.log('[RetryModal] Pre-mint simulation passed ✓ — safe to execute.');
                }
            } catch (simErr) {
                const simReason = (simErr.shortMessage || simErr.details || simErr.message || '').toLowerCase();
                console.warn('[RetryModal] Pre-mint simulation blocked execution:', simReason);

                if (simReason.includes('nonce') || simReason.includes('already used') || simReason.includes('already executed')) {
                    throw new Error('Nonce already used');
                }
                if (simReason.includes('expired') || simReason.includes('must be re-signed')) {
                    throw new Error('ATTESTATION_EXPIRED');
                }
                // Unknown simulation errors — block to be safe.
                // We can't verify the transaction state, so we must not let the user waste gas.
                throw new Error('Could not verify transaction status on the destination chain. It may have already been completed, or the chain RPC is unavailable. Check the destination chain explorer before retrying.');
            }
            // ─── END GUARD ────────────────────────────────────────────────────────

            const result = await retryMint({
                burnTxHash: burnHash,
                fromChain: sourceChain,
                toChain: target,
                cachedAttestation: attestation,
            });

            setMintHash(result.mintTxHash);
            setStep('success');

            // Sync with backend so Activity Tab updates from "Action Needed" -> "Completed"
            try {
                fetch(import.meta.env.VITE_ANALYTICS_URL + '/track/mint', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        burnTxHash: burnHash,
                        mintTxHash: result.mintTxHash,
                        bridgeId: import.meta.env.VITE_BRIDGE_ID,
                        success: true,
                    }),
                }).catch(() => {});
            } catch (e) {
                console.warn('[RetryModal] Sync failed:', e.message);
            }
        } catch (err) {
            let userMsg = err.message;
            if (userMsg.includes('ATTESTATION_EXPIRED')) {
                userMsg = 'The attestation for this transaction has expired. On testnets, signatures are temporary. You may need to initiate a new bridge transaction.';
            } else if (userMsg.includes('Nonce already used') || userMsg.includes('already executed')) {
                userMsg = 'This transaction has already been completed. The tokens were already delivered to the destination wallet.';
            }
            // Wallet rejections stay inline — don't navigate to error screen
            setError(userMsg);
            if (!userMsg.includes('User rejected')) {
                setStep('error');
            }
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className={`retry-modal-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
            <div className={`retry-modal-container ${isClosing ? 'closing' : ''} ${step === 'success' ? 'success' : ''}`} onClick={e => e.stopPropagation()}>

                <div className="retry-modal-header">
                    <div className="header-title">
                        <img src="/icons/retry.png" alt="Retry" className="retry-header-img" />
                        <h2>Retry Transaction</h2>
                    </div>
                    <button className="close-btn" onClick={handleClose}><X size={20} /></button>
                </div>

                <div className="retry-modal-body">
                    {step === 'input' && (
                        <div className="retry-input-view">
                            <p className="retry-hint">
                                Stuck on another bridge? Enter your Burn Transaction Hash from any CCTP bridge to complete it here.
                            </p>

                            <div className="retry-field">
                                <label>Source Chain</label>
                                <div className="retry-select-trigger" onClick={() => setIsSelectorOpen(true)}>
                                    <div className="trigger-content">
                                        <img
                                            src={getChainByName(sourceChain)?.icon}
                                            alt=""
                                            className="mini-chain-icon"
                                        />
                                        <span>{sourceChain}</span>
                                    </div>
                                    <ChevronDown size={16} className="select-arrow" />
                                </div>
                            </div>

                            <div className="retry-field">
                                <label>Burn Transaction Hash</label>
                                <input
                                    className="retry-hash-input"
                                    placeholder="0x..."
                                    value={burnHash}
                                    onChange={(e) => setBurnHash(e.target.value)}
                                />
                            </div>

                            {error && <div className="retry-error-msg">{error}</div>}

                            <button className="retry-primary-btn" onClick={startRetry}>
                                SUBMIT &amp; ATTEST
                            </button>
                        </div>
                    )}

                    {(step === 'attesting' || step === 'minting') && (
                        <div className="retry-processing-view">
                            <div className="retry-status-icon">
                                <Loader2 size={40} className="spin" />
                            </div>
                            <h3>{step === 'attesting' ? 'Fetching Attestation...' : 'Ready to Mint'}</h3>
                            <p>
                                {step === 'attesting'
                                    ? 'We are checking Circle Iris API for your CCTP attestation.'
                                    : 'Attestation found! Please proceed to mint your tokens on the destination chain.'}
                            </p>

                            {step === 'minting' && (
                                <button className="retry-primary-btn" onClick={executeMint}>
                                    EXECUTE MINT
                                </button>
                            )}
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="retry-success-view">
                            <div className="success-icon-ring">
                                <div className="success-icon-wrap">
                                    <Check size={28} />
                                </div>
                            </div>
                            <h3>Mint Successful!</h3>

                            <div className="retry-tx-box">
                                <span>Transaction Hash:</span>
                                <a
                                    href={`${getChainByName(destChain)?.explorer}/tx/${mintHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {mintHash.slice(0, 10)}...{mintHash.slice(-8)} <ExternalLink size={12} />
                                </a>
                            </div>

                            <button className="retry-primary-btn" onClick={handleClose}>
                                DONE
                            </button>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="retry-error-view">
                            <div className="error-icon-wrap">
                                <X size={24} />
                            </div>
                            <h3>Retrieval Failed</h3>
                            <div className="retry-error-card">
                                <p>{error}</p>
                            </div>
                            <button
                                className="retry-primary-btn"
                                onClick={() => error.includes('already') ? handleClose() : setStep('input')}
                            >
                                {error.includes('already') ? 'BACK TO BRIDGE' : 'TRY AGAIN'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Custom Chain Selector Overlay */}
                {isSelectorOpen && (
                    <div className="chain-selector-overlay" onClick={() => setIsSelectorOpen(false)}>
                        <div className="selector-card" onClick={e => e.stopPropagation()}>
                            <div className="selector-header">
                                <h3>Select Source Chain</h3>
                                <button className="selector-close" onClick={() => setIsSelectorOpen(false)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="selector-list">
                                {SUPPORTED_CHAINS.map(chain => (
                                    <div
                                        key={chain.name}
                                        className={`selector-item ${sourceChain === chain.name ? 'active' : ''}`}
                                        onClick={() => {
                                            setSourceChain(chain.name);
                                            setIsSelectorOpen(false);
                                        }}
                                    >
                                        <img src={chain.icon} alt={chain.name} />
                                        <span>{chain.name}</span>
                                        {sourceChain === chain.name && <Check size={14} className="check-icon" />}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

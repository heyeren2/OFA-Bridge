import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Settings, ChevronDown, ChevronRight, ArrowUpDown, ArrowDown, Clock, Zap, X, ScrollText } from 'lucide-react';
import { useAccount, useBalance } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import ChainSelector from './ChainSelector';
import TokenSelector from './TokenSelector';
import AssetSelectorModal from './AssetSelectorModal';
import SettingsPopup from './SettingsPopup';
import BridgeStatus from './BridgeStatus';
import { SUPPORTED_CHAINS, ARC_CHAIN, BRIDGE_DIRECTION, getChainByName } from '../config/chains';
import { TOKEN_INFO, USDC_ADDRESSES, SWAP_FEE_PERCENTAGE } from '../config/contracts';
import { calculateFee, calculateForwardingFee, executeBridge, retryMint } from '../services/bridgeService';

import { FORWARDING_CONFIG, DEFAULT_MINT_MODE, CHAINS_WITHOUT_FORWARDER_SUPPORT } from '../services/forwardingConfig';
import { getSwapQuote, executeSwap } from '../services/swapService';
import { getDestSwapQuote, executeDestSwap } from '../services/destSwapService';
import TransactionModal from './TransactionModal';
import { sdk } from '../services/analyticsService';
// RecipientModal and its CSS are now imported in App.jsx

const TRANSLATIONS = {
    English: {
        from: 'From',
        to: 'To',
        balance: 'Balance',
        bridgeFee: 'Bridge Fee',
        connectWallet: 'Connect Wallet',
        bridging: 'Bridging...',
        bridgeAgain: 'BRIDGE AGAIN',
        tryAgain: 'TRY AGAIN',
        swapAndBridge: 'SWAP & BRIDGE',
        bridge: 'BRIDGE',
        max: 'MAX',
        insufficientBalance: 'Insufficient Balance',
        enterAmount: 'Enter Amount'
    },
    Español: {
        from: 'Desde',
        to: 'Para',
        balance: 'Saldo',
        bridgeFee: 'Comisión',
        connectWallet: 'Conectar Wallet',
        bridging: 'Puenteando...',
        bridgeAgain: 'PUENTE DE NUEVO',
        tryAgain: 'INTENTAR OTRA VEZ',
        swapAndBridge: 'INTERCAMBIO Y PUENTE',
        bridge: 'PUENTE',
        max: 'MÁX',
        insufficientBalance: 'Saldo Insuficiente',
        enterAmount: 'Ingrese el Monto'
    },
    Dutch: {
        from: 'Van',
        to: 'Naar',
        balance: 'Saldo',
        bridgeFee: 'Brug Kosten',
        connectWallet: 'Wallet Verbinden',
        bridging: 'Bruggen...',
        bridgeAgain: 'OPNIEUW BRUGGEN',
        tryAgain: 'OPNIEUW PROBEREN',
        swapAndBridge: 'SWAP & BRUG',
        bridge: 'BRUG',
        max: 'MAX',
        insufficientBalance: 'Onvoldoende Saldo',
        enterAmount: 'Voer Bedrag In'
    },
    French: {
        from: 'De',
        to: 'À',
        balance: 'Solde',
        bridgeFee: 'Frais de pont',
        connectWallet: 'Connecter Wallet',
        bridging: 'Pontage...',
        bridgeAgain: 'PONT À NOUVEAU',
        tryAgain: 'RÉESSAYER',
        swapAndBridge: 'ÉCHANGE ET PONT',
        bridge: 'PONT',
        max: 'MAX',
        insufficientBalance: 'Solde Insuffisant',
        enterAmount: 'Entrez le Montant'
    },
    Chinese: {
        from: '来自',
        to: '到',
        balance: '余额',
        bridgeFee: '桥接费用',
        connectWallet: '连接钱包',
        bridging: '桥接中...',
        bridgeAgain: '再次桥接',
        tryAgain: '再试一次',
        swapAndBridge: '交换并桥接',
        bridge: '桥接',
        max: '最大',
        insufficientBalance: '余额不足',
        enterAmount: '输入金额'
    },
    Japanese: {
        from: 'から',
        to: 'まで',
        balance: '残高',
        bridgeFee: 'ブリッジ手数料',
        connectWallet: 'ウォレットを接続',
        bridging: 'ブリッジ中...',
        bridgeAgain: 'もう一度ブリッジ',
        tryAgain: '再試行',
        swapAndBridge: 'スワップ＆ブリッジ',
        bridge: 'ブリッジ',
        max: '最大',
        insufficientBalance: '残高不足',
        enterAmount: '金額を入力'
    }
};

const CURRENCY_DATA = {
    USD: { symbol: '$', rate: 1.0 },
    EUR: { symbol: '€', rate: 0.93 },
    CAD: { symbol: '$', rate: 1.35 }
};

export default function Bridge({
    currency,
    language,
    onOpenSettings,
    isSettingsOpen,
    setIsSettingsOpen,
    setActiveTab,
    customRecipient,
    setCustomRecipient,
    onOpenRecipientModal,
    slippage
}) {
    const t = TRANSLATIONS[language] || TRANSLATIONS.English;
    const c = CURRENCY_DATA[currency] || CURRENCY_DATA.USD;

    const { openConnectModal } = useConnectModal();
    const { address: currentAddress, isConnected, connector } = useAccount();

    const [fromChainName, setFromChainName] = useState('Ethereum Sepolia');
    const [toChainName, setToChainName] = useState('Arc Testnet');
    const [selectedToken, setSelectedToken] = useState('USDC');
    const [destToken, setDestToken] = useState('USDC');
    const [amount, setAmount] = useState('');
    const [isBridging, setIsBridging] = useState(false);
    const [bridgeStep, setBridgeStep] = useState(null); // The current active/focus step
    const [stepStatuses, setStepStatuses] = useState({}); // Detailed status for each step: { 'approve': 'completed', ... }
    const [bridgeError, setBridgeError] = useState(null);
    const [swapQuote, setSwapQuote] = useState(null);
    const [destSwapQuote, setDestSwapQuote] = useState(null);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [selectorMode, setSelectorMode] = useState('chain');
    const [selectorTarget, setSelectorTarget] = useState('from'); // 'from' or 'to'
    const [isReminting, setIsReminting] = useState(false);
    const [cachedAttestation, setCachedAttestation] = useState(null); // stored from SDK event
    const [isTxModalOpen, setIsTxModalOpen] = useState(false);
    const [txData, setTxData] = useState({ approveHash: null, sourceHash: null, destHash: null, swapHash: null, destSwapHash: null });
    // customRecipient and isRecipientModalOpen are now handled via props

    const isDestForwarderBlocked = CHAINS_WITHOUT_FORWARDER_SUPPORT.displayNames.includes(toChainName);
    const [mintMode, setMintMode] = useState(DEFAULT_MINT_MODE);

    const isAutoModeRestricted = useMemo(() => {
        if (toChainName !== 'Ethereum Sepolia') return false;
        const amt = parseFloat(amount);
        return isNaN(amt) || amt < 5;
    }, [toChainName, amount]);

    const isEthDestNoRecipient = useMemo(() => {
        return toChainName === 'Ethereum Sepolia' && destToken === 'ETH';
    }, [toChainName, destToken]);

    useEffect(() => {
        if (customRecipient && !isDestForwarderBlocked && !isAutoModeRestricted && mintMode !== 'auto') {
            setMintMode('auto');
        }
    }, [customRecipient, isDestForwarderBlocked, isAutoModeRestricted]);

    useEffect(() => {
        if (isDestForwarderBlocked || isAutoModeRestricted) {
            setMintMode('manual');
        }
    }, [toChainName, isDestForwarderBlocked, isAutoModeRestricted]);

    useEffect(() => {
        if (isAutoModeRestricted || isDestForwarderBlocked) {
            setCustomRecipient('');
        }
    }, [isAutoModeRestricted, isDestForwarderBlocked, setCustomRecipient]);

    useEffect(() => {
        const dest = getChainByName(toChainName);
        if (dest && !dest.tokens.includes(destToken)) {
            setDestToken('USDC');
        }
    }, [toChainName, destToken]);

    const isForwarderActive =
        FORWARDING_CONFIG.isForwardingEnabled &&
        mintMode === 'auto' &&
        !isDestForwarderBlocked;

    const fromChain = useMemo(() => getChainByName(fromChainName), [fromChainName]);
    const destChain = useMemo(() => getChainByName(toChainName), [toChainName]);

    const isEthSwap = selectedToken === 'ETH' && fromChainName === 'Ethereum Sepolia';


    const { data: sourceBalanceData } = useBalance({
        address: currentAddress,
        token: selectedToken === 'USDC' ? USDC_ADDRESSES[fromChain.bridgeKitName] : undefined,
        chainId: fromChain.chainId,
        watch: true,
    });


    const { data: destBalanceData } = useBalance({
        address: customRecipient || currentAddress,
        token: destToken === 'USDC' ? USDC_ADDRESSES[destChain.bridgeKitName] : undefined,
        chainId: destChain.chainId,
        watch: true,
    });

    const { data: sourceNativeData } = useBalance({
        address: currentAddress,
        chainId: fromChain.chainId,
        watch: true,
    });

    const { data: destNativeData } = useBalance({
        address: customRecipient || currentAddress,
        chainId: destChain.chainId,
        watch: true,
    });

    const sourceBalance = useMemo(() => {
        if (!isConnected || !sourceBalanceData) return '0.00';
        const [int, frac] = sourceBalanceData.formatted.split('.');
        return `${int}.${(frac || '00').padEnd(2, '0').slice(0, 2)}`;
    }, [isConnected, sourceBalanceData]);

    const destBalance = useMemo(() => {
        if (!isConnected || !destBalanceData) return '0.00';
        const [int, frac] = destBalanceData.formatted.split('.');
        return `${int}.${(frac || '00').padEnd(2, '0').slice(0, 2)}`;
    }, [isConnected, destBalanceData]);

    const forwardingFee = useMemo(() => {
        // No forwarding fee if user chose manual mode or chain blocks the forwarder
        if (!isForwarderActive) return '0';
        return calculateForwardingFee(toChainName);
    }, [toChainName, isForwarderActive]);

    const fee = useMemo(() => {
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return '0.00';
        let baseFee = '0';
        if (isEthSwap && swapQuote) {
            baseFee = calculateFee(swapQuote.amountOut);
        } else {
            baseFee = calculateFee(amount);
        }
        return (parseFloat(baseFee) + parseFloat(forwardingFee)).toFixed(6);
    }, [amount, isEthSwap, swapQuote, forwardingFee]);

    const receiveAmount = useMemo(() => {
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return '0.00';

        let rawReceive;
        if (destToken === 'ETH' && destSwapQuote) {
            rawReceive = destSwapQuote.amountOut;
        } else if (isEthSwap && swapQuote) {
            // Deduct displayed fee + hidden swap fee from swap output
            const hiddenSwapFee = (parseFloat(swapQuote.amountOut) * SWAP_FEE_PERCENTAGE).toFixed(6);
            rawReceive = (parseFloat(swapQuote.amountOut) - parseFloat(fee) - parseFloat(hiddenSwapFee)).toString();
        } else {
            rawReceive = (parseFloat(amount) - parseFloat(fee)).toString();
        }

        // Truncate to 2 decimals for display
        const [int, frac] = rawReceive.split('.');
        return `${int}.${(frac || '00').padEnd(2, '0').slice(0, 2)}`;
    }, [amount, fee, isEthSwap, swapQuote, destToken, destSwapQuote]);

    const expectedTime = useMemo(() => {
        if (isForwarderActive) {
            // FAST + Forwarder: Circle auto-mints, near-instant end-to-end
            return '~30-60 seconds';
        }
        // FAST transfer, user signs the mint — attestation is quick, switch adds ~30s
        const slowSources = ['Ethereum Sepolia', 'Base Sepolia', 'Arbitrum Sepolia', 'Optimism Sepolia'];
        return slowSources.includes(fromChainName) ? '~1-2 minutes' : '~30-60 seconds';
    }, [fromChainName, isForwarderActive]);

    const bridgeSteps = useMemo(() => {
        const mintStep = isForwarderActive
            ? { key: 'mint', label: 'Circle Minting (Automatic)', activeDesc: 'Circle is minting on destination...' }
            : { key: 'mint', label: 'Mint USDC', activeDesc: 'Confirming mint transaction...' };

        const steps = [];

        if (isEthSwap) {
            steps.push({ key: 'swap', label: 'Swap ETH → USDC' });
        }

        steps.push(
            { key: 'approve', label: 'Approve USDC' },
            { key: 'burn', label: 'Burn USDC' },
            { key: 'attestation', label: 'Attestation' },
            mintStep
        );

        if (destToken === 'ETH' && toChainName === 'Ethereum Sepolia') {
            steps.push({ key: 'swap_dest', label: 'Swap USDC → ETH' });
        }

        return steps;
    }, [isEthSwap, isForwarderActive, destToken, toChainName]);

    const handleChainChange = useCallback((chainName) => {
        if (selectorTarget === 'from') {
            setFromChainName(chainName);
            // If selecting same chain for destination, swap them
            if (chainName === toChainName) {
                setToChainName(fromChainName);
            }
        } else {
            setToChainName(chainName);
            if (chainName === fromChainName) {
                setFromChainName(toChainName);
            }
        }

        // Only reset token if changing the SOURCE chain and the new source doesn't support it
        if (selectorTarget === 'from') {
            const chain = getChainByName(chainName);
            if (chain && !chain.tokens.includes(selectedToken)) {
                setSelectedToken('USDC');
            }
        } else {
            if (chainName !== 'Ethereum Sepolia') {
                setDestToken('USDC');
            }
        }
        if (selectorTarget === 'from') {
            setSwapQuote(null);
        }
        setBridgeStep(null);
        setBridgeError(null);
        setIsSelectorOpen(false);
    }, [selectorTarget, toChainName, fromChainName, selectedToken]);

    const handleAssetSelect = useCallback((chainName, tokenSymbol) => {
        if (selectorTarget === 'from') {
            const oldFrom = fromChainName;
            setFromChainName(chainName);
            if (chainName === toChainName) {
                setToChainName(oldFrom);
            }

            // Only update selectedToken if selecting SOURCE
            const chain = getChainByName(chainName);
            if (chain && chain.tokens.includes(tokenSymbol)) {
                setSelectedToken(tokenSymbol);
            } else {
                setSelectedToken('USDC');
            }
        } else {
            // Changing destination
            const oldTo = toChainName;
            setToChainName(chainName);
            if (chainName === fromChainName) {
                setFromChainName(oldTo);

                // If we flipped, validate current source token for the new source chain
                const newSource = getChainByName(oldTo);
                if (newSource && !newSource.tokens.includes(selectedToken)) {
                    setSelectedToken('USDC');
                }
            }

            // Update destToken: use the selected token if the dest chain supports it
            const destChainConfig = getChainByName(chainName);
            if (destChainConfig && destChainConfig.tokens.includes(tokenSymbol)) {
                setDestToken(tokenSymbol);
            } else {
                setDestToken('USDC');
            }
        }

        // Only clear the swap quote if we're changing the SOURCE chain.
        if (selectorTarget === 'from') {
            setSwapQuote(null);
        }
        setBridgeStep(null);
        setStepStatuses({});
        setBridgeError(null);
        setIsSelectorOpen(false);
    }, [selectorTarget, fromChainName, toChainName, selectedToken]);

    const openSelector = useCallback((mode, target = 'from') => {
        setSelectorMode(mode);
        setSelectorTarget(target);
        setIsSelectorOpen(true);
    }, []);

    const handleAmountChange = useCallback(async (e) => {
        const val = e.target.value;
        if (val === '' || /^\d*\.?\d*$/.test(val)) {
            setAmount(val);
            // Note: quote is debounced via useEffect — no need to clear it here
        }
    }, [selectedToken]);

    const toggleDirection = useCallback(() => {
        const oldFrom = fromChainName;
        const oldTo = toChainName;
        const oldSelected = selectedToken;
        const oldDest = destToken;

        setFromChainName(oldTo);
        setToChainName(oldFrom);
        setSelectedToken(oldDest);
        setDestToken(oldSelected);

        // Validate if the flipped tokens are supported on their new chains
        const newSource = getChainByName(oldTo);
        const newDest = getChainByName(oldFrom);

        if (newSource && !newSource.tokens.includes(oldDest)) {
            setSelectedToken('USDC');
        }
        if (newDest && !newDest.tokens.includes(oldSelected)) {
            setDestToken('USDC');
        }

        setSwapQuote(null);
        setBridgeStep(null);
        setBridgeError(null);
    }, [fromChainName, toChainName, selectedToken, destToken]);

    const handleConnect = useCallback(() => {
        if (openConnectModal) {
            openConnectModal();
        }
    }, [openConnectModal]);

    // Dest Swap Quote Effect
    useEffect(() => {
        const fetchDestQuote = async () => {
            if (destToken === 'ETH' && toChainName === 'Ethereum Sepolia' && amount && parseFloat(amount) > 0) {
                try {
                    // Fee is already deducted from amount for the bridge, so we swap (amount - fee)
                    const bridgeAmount = (parseFloat(amount) - parseFloat(fee)).toString();
                    if (parseFloat(bridgeAmount) <= 0) return;

                    const quote = await getDestSwapQuote(bridgeAmount);
                    setDestSwapQuote(quote);
                } catch (err) {
                    console.error('Failed to get dest swap quote:', err);
                    setDestSwapQuote(null);
                }
            } else {
                setDestSwapQuote(null);
            }
        };

        const timer = setTimeout(fetchDestQuote, 500);
        return () => clearTimeout(timer);
    }, [destToken, toChainName, amount, fee]);

    const handleBridge = useCallback(async () => {
        if (!isConnected) {
            handleConnect();
            return;
        }

        if (!amount || parseFloat(amount) <= 0) return;

        setIsBridging(true);
        setBridgeError(null);
        setStepStatuses({});
        setIsTxModalOpen(true);
        setTxData({ approveHash: null, sourceHash: null, destHash: null });
        setCachedAttestation(null); // clear any previous cached attestation

        const hasBurnTxRef = { current: false };
        const isCancelledRef = { current: false };
        const burnTxHashRef = { current: null };

        // Create a processing entry in history immediately
        const txId = Date.now();
        const historyEntry = {
            id: txId,
            userAddress: currentAddress,
            fromChain: fromChainName,
            toChain: toChainName,
            token: selectedToken,
            amount,
            fee,
            received: receiveAmount,
            timestamp: new Date().toISOString(),
            status: 'processing',
            lastStep: isEthSwap ? 'swap' : 'approve',
            isSwapRoute: isEthSwap,
            txHashes: { approve: null, source: null, dest: null },
            sourceTxHash: null, // for re-mint
        };

        const updateHistory = (updates) => {
            const history = JSON.parse(localStorage.getItem('bridgeHistory') || '[]');
            const idx = history.findIndex(h => h.id === txId);
            if (idx >= 0) {
                history[idx] = { ...history[idx], ...updates };
            } else {
                history.unshift({ ...historyEntry, ...updates });
            }
            localStorage.setItem('bridgeHistory', JSON.stringify(history.slice(0, 50)));
            window.dispatchEvent(new Event('storage'));
        };

        // Save the initial processing entry
        updateHistory({});

        try {
            let bridgeAmount = amount;
            const fromChainKit = fromChain.bridgeKitName;
            const toChainKit = destChain.bridgeKitName;

            if (isEthSwap) {
                if (!swapQuote?.amountOut || parseFloat(swapQuote.amountOut) <= 0) {
                    throw new Error('Swap quote not ready. Please wait a moment and try again.');
                }
                setBridgeStep('swap');
                setStepStatuses(prev => ({ ...prev, swap: 'pending' }));
                const swapResult = await executeSwap(amount, swapQuote.amountOut, currentAddress, slippage);
                bridgeAmount = swapResult.usdcReceived;
                setTxData(prev => ({ ...prev, swapHash: swapResult.hash }));
                setBridgeStep('approve');
                setStepStatuses(prev => ({ ...prev, swap: 'completed' }));
                updateHistory({ lastStep: 'approve', txHashes: { swap: swapResult.hash } });
            }

            const result = await executeBridge({
                fromChain: fromChainKit,
                toChain: toChainKit,
                amount: bridgeAmount,
                fullAmount: amount,
                recipientAddress: customRecipient || currentAddress,
                forwardingFee,
                isSwapRoute: isEthSwap,
                mintMode,
                slippage,
                onStatusUpdate: async (update) => {
                    if (update.step === 'error') {
                        setBridgeError(update.error);
                    } else if (update.step === 'cancelled') {
                        isCancelledRef.current = true;
                        if (update.failedStep) {
                            setBridgeStep(update.failedStep);
                            setStepStatuses(prev => ({ ...prev, [update.failedStep]: 'error' }));
                            updateHistory({ lastStep: update.failedStep });

                            // SDK tracking calls (best-effort, may fail silently)
                            if (update.failedStep === 'attestation') {
                                sdk.trackAttestation({ burnTxHash: burnTxHashRef.current, success: false, error: 'User cancelled' }).catch(() => {});
                            } else if (update.failedStep === 'mint') {
                                sdk.trackAttestation({ burnTxHash: burnTxHashRef.current, success: true }).catch(() => {});
                                sdk.trackMint({ burnTxHash: burnTxHashRef.current, success: false, error: 'User cancelled' }).catch(() => {});
                            }
                        }

                        // ── RELIABLE FALLBACK ─────────────────────────────────────────────
                        // Call backend /track/status DIRECTLY, outside of failedStep checks.
                        // This fires for ANY cancellation as long as we have a burn hash.
                        // Covers: null failedStep, Circle auto-mode, HMR edge cases, etc.
                        // ──────────────────────────────────────────────────────────────────
                        if (burnTxHashRef.current) {
                            const analyticsUrl = import.meta.env.VITE_ANALYTICS_URL;
                            const bridgeId = import.meta.env.VITE_BRIDGE_ID;
                            const cancelledAtAttestation = update.failedStep === 'attestation';
                            const targetStatus = cancelledAtAttestation ? 'attestation_failed' : 'mint_failed';

                            console.log(`[Bridge] Cancel detected — updating backend status to: ${targetStatus} for ${burnTxHashRef.current}`);

                            const doStatusUpdate = () => {
                                if (cancelledAtAttestation) {
                                    // Just mark attestation as failed
                                    return fetch(`${analyticsUrl}/track/status`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ burnTxHash: burnTxHashRef.current, bridgeId, status: 'attestation_failed' }),
                                    });
                                } else {
                                    // Mint was cancelled — first ensure attested, then mint_failed
                                    return fetch(`${analyticsUrl}/track/status`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ burnTxHash: burnTxHashRef.current, bridgeId, status: 'attested' }),
                                    }).then(() => fetch(`${analyticsUrl}/track/status`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ burnTxHash: burnTxHashRef.current, bridgeId, status: 'mint_failed' }),
                                    }));
                                }
                            };

                            doStatusUpdate()
                                .then(() => console.log(`[Bridge] ✅ Direct status update: ${targetStatus}`))
                                .catch(err => {
                                    console.warn('[Bridge] Direct status update failed, retrying in 3s...', err.message);
                                    // Retry once after 3 seconds (handles cold Render start)
                                    setTimeout(() => doStatusUpdate().catch(() => {}), 3000);
                                });
                        } else {
                            console.warn('[Bridge] cancel: burnTxHashRef is empty — cannot update backend status');
                        }

                        setBridgeError('CANCELLED');

                    } else if (update.step === 'complete') {
                        // All done — handled after executeBridge resolves

                    } else if (update.status === 'completed') {
                        // Step finished
                        console.log(`[Bridge] ✅ Step [${update.step}] COMPLETED (forced=${!!update.forced}, txHash=${update.txHash})`);
                        setStepStatuses(prev => ({ ...prev, [update.step]: 'completed' }));
                        if (!update.forced) {
                            setBridgeStep(update.step);
                        }

                        // Confirm burn happened
                        if (update.step === 'burn' || update.step === 'attestation' || update.step === 'mint') {
                            hasBurnTxRef.current = true;
                        }

                        // Record txHashes
                        if (update.txHash) {
                            if (update.step === 'approve') {
                                setTxData(prev => ({ ...prev, approveHash: update.txHash }));
                                updateHistory({ txHashes: { approve: update.txHash } });
                            }
                            if (update.step === 'burn') {
                                setTxData(prev => ({ ...prev, sourceHash: update.txHash }));
                                updateHistory({ txHashes: { source: update.txHash }, sourceTxHash: update.txHash, lastStep: 'attestation' });
                                // Track burn with SDK → sends to backend
                                await sdk.trackBurn({
                                    burnTxHash: update.txHash,
                                    wallet: currentAddress,
                                    amount: bridgeAmount,
                                    sourceChain: fromChainName,
                                    destinationChain: toChainName,
                                }).catch(err => console.warn('[Bridge] trackBurn failed:', err.message));
                                // Store burn hash in ref to avoid stale closure
                                burnTxHashRef.current = update.txHash;
                            }
                            if (update.step === 'mint') {
                                setTxData(prev => ({ ...prev, destHash: update.txHash }));
                                updateHistory({ txHashes: { dest: update.txHash }, lastStep: 'complete' });
                                // Track successful mint with SDK → sends to backend
                                await sdk.trackMint({
                                    burnTxHash: burnTxHashRef.current,
                                    mintTxHash: update.txHash,
                                    amountReceived: receiveAmount,
                                    success: true,
                                }).catch(err => console.warn('[Bridge] trackMint failed:', err.message));
                            }
                        }
                        // Cache the attestation payload so Remint can bypass the re-fetch
                        if (update.step === 'attestation' && update.data) {
                            const payload = update.data;
                            const msg = payload?.message || payload?.values?.message || null;
                            const att = payload?.attestation || payload?.values?.attestation || null;
                            if (msg && att) {
                                console.log('[Bridge] Caching attestation data for potential Remint');
                                setCachedAttestation({ message: msg, attestation: att });
                            }
                        }
                        // Track attestation completion with SDK → sends to backend
                        if (update.step === 'attestation') {
                            await sdk.trackAttestation({
                                burnTxHash: burnTxHashRef.current,
                                success: true,
                            }).catch(err => console.warn('[Bridge] trackAttestation failed:', err.message));
                        }

                    } else if (update.status === 'pending' || update.status === 'started') {
                        // Next step starting
                        if (!isCancelledRef.current) {
                            console.log(`[Bridge] 🔄 Step [${update.step}] starting`);
                            setStepStatuses(prev => {
                                // Don't overwrite a 'completed' status with 'pending'
                                if (prev[update.step] === 'completed') return prev;
                                return { ...prev, [update.step]: 'pending' };
                            });

                            setBridgeStep(current => {
                                const stepOrder = ['approve', 'burn', 'attestation', 'mint'];
                                const currentIndex = stepOrder.indexOf(current);
                                const nextIndex = stepOrder.indexOf(update.step);

                                // Always advance, never pull back
                                if (nextIndex > currentIndex) {
                                    setStepStatuses(prev => {
                                        const nextStatuses = { ...prev };
                                        for (let i = 0; i < nextIndex; i++) {
                                            const prevStepId = stepOrder[i];
                                            if (nextStatuses[prevStepId] !== 'completed') {
                                                nextStatuses[prevStepId] = 'completed';
                                            }
                                        }
                                        nextStatuses[update.step] = 'pending';
                                        return nextStatuses;
                                    });
                                    return update.step;
                                }
                                return current;
                            });

                            updateHistory({ lastStep: update.step });
                        }
                    }
                },
            });

            console.log('[Bridge] executeBridge resolved:', {
                resultState: result.state,
                isActuallyCancelled: isCancelledRef.current,
                hasBurnTx: hasBurnTxRef.current
            });

            if (!hasBurnTxRef.current && !isCancelledRef.current && result.state !== 'completed') {
                console.log('[Bridge] No burn tx detected — treating as user cancellation');
                isCancelledRef.current = true;
                setBridgeError('CANCELLED');
            }

            if (destToken === 'ETH' && toChainName === 'Ethereum Sepolia') {
                setBridgeStep('swap_dest');
                setStepStatuses(prev => ({ ...prev, swap_dest: 'pending' }));

                // Fetch fresh quote for final bridged amount (in case it changed slightly)
                const bridgeAmount = (parseFloat(amount) - parseFloat(fee)).toString();
                const quote = await getDestSwapQuote(bridgeAmount);

                const swapResult = await executeDestSwap(bridgeAmount, quote.amountOut, currentAddress, slippage);
                setTxData(prev => ({ ...prev, destSwapHash: swapResult.hash }));

                setStepStatuses(prev => ({ ...prev, swap_dest: 'completed' }));
                updateHistory({ txHashes: { destSwap: swapResult.hash } });
            }

            if (!isCancelledRef.current) {
                setBridgeStep('complete');
                updateHistory({ status: 'completed', lastStep: 'complete' });
            } else {
                // Determine if mint failed (burn happened but mint didn't)
                const finalStatus = hasBurnTxRef.current ? 'mint_failed' : 'cancelled';
                updateHistory({ status: finalStatus });
            }
        } catch (err) {
            // DEBUG: Surface the actual error so we can see it
            console.error('[Bridge] Caught error:', {
                message: err.message,
                shortMessage: err.shortMessage,
                code: err.code,
                name: err.name,
                cause: err.cause,
                stack: err.stack,
            });
            // Mask Ethereum addresses for privacy (0x... → 0x...abcd)
            const maskAddress = (str) =>
                typeof str === 'string' ? str.replace(/0x[a-fA-F0-9]{40}/g, addr => `${addr.slice(0, 6)}...${addr.slice(-4)}`) : str;

            // User-facing error message
            let displayError = maskAddress(err.shortMessage || err.message || 'Bridge execution failed');

            // Map error codes
            if (err.code === 9002 || err.message?.includes('9002')) {
                displayError = `Insufficient gas funds on ${fromChainName}`;
            }

            // Fallback cancellation detection — in case bridgeService didn't catch it
            const errMsg = (err.message || '').toLowerCase();
            const errShort = (err.shortMessage || '').toLowerCase();
            const errCause = (err.cause?.message || '').toLowerCase();
            const wasCancelled =
                isCancelledRef.current ||
                err.code === 4001 ||
                err.cause?.code === 4001 ||
                err.code === 'ACTION_REJECTED' ||
                errMsg.includes('user rejected') ||
                errMsg.includes('user denied') ||
                errShort.includes('user rejected') ||
                errCause.includes('user rejected');

            if (wasCancelled) {
                isCancelledRef.current = true;
                setBridgeError('CANCELLED');
                const finalStatus = hasBurnTxRef.current ? 'mint_failed' : 'cancelled';
                updateHistory({ status: finalStatus });

                // If it was a mint failure, report it
                if (hasBurnTxRef.current) {
                   sdk.trackMint({ burnTxHash: burnTxHashRef.current, success: false, error: 'Cancelled' }).catch(() => {});
                }
            } else {
                setBridgeError(displayError);
                updateHistory({ status: 'failed' });
                
                // Track backend failure
                if (hasBurnTxRef.current) {
                    sdk.trackMint({ burnTxHash: burnTxHashRef.current, success: false, error: displayError }).catch(() => {});
                }
            }
        } finally {
            setIsBridging(false);
        }
    }, [isConnected, amount, currentAddress, fromChainName, toChainName, selectedToken, destToken, fee, receiveAmount, isEthSwap, swapQuote, fromChain, destChain, customRecipient, mintMode, slippage, handleConnect]);

    const handleRemint = useCallback(async () => {
        if (!txData.sourceHash) return;

        setIsReminting(true);
        setBridgeError(null);

        try {
            const result = await retryMint({
                burnTxHash: txData.sourceHash,
                fromChain: fromChainName,
                toChain: toChainName,
                cachedAttestation,
            });

            if (result.mintTxHash) {
                setTxData(prev => ({ ...prev, destHash: result.mintTxHash }));
                setBridgeStep('complete');
                setStepStatuses(prev => ({ ...prev, mint: 'completed' }));

                // Update history
                const history = JSON.parse(localStorage.getItem('bridgeHistory') || '[]');
                const idx = history.findIndex(h => h.sourceTxHash === txData.sourceHash);
                if (idx >= 0) {
                    history[idx].txHashes.dest = result.mintTxHash;
                    history[idx].status = 'processing'; // It will eventually be picked up as completed if polled, or we just set it now
                    history[idx].lastStep = 'complete';
                    localStorage.setItem('bridgeHistory', JSON.stringify(history.slice(0, 50)));
                    window.dispatchEvent(new Event('storage'));
                }

                // Track successful remint with SDK → sends to backend
                sdk.trackMint({
                    burnTxHash: txData.sourceHash,
                    mintTxHash: result.mintTxHash,
                    amountReceived: receiveAmount,
                    success: true,
                }).catch(err => console.warn('[Bridge] trackMint (remint) failed:', err.message));
            }
        } catch (err) {
            console.error('[Bridge] Remint failed:', err);
            setBridgeError(err.message || 'Remint failed');
        } finally {
            setIsReminting(false);
        }
    }, [txData.sourceHash, fromChainName, toChainName]);

    const resetBridge = () => {
        setBridgeStep(null);
        setBridgeError(null);
        setAmount('');
        setSwapQuote(null);
    };

    const hasInsufficientBalance = useMemo(() => {
        if (!isConnected || !amount || isNaN(amount)) return false;
        return parseFloat(amount) > parseFloat(sourceBalance);
    }, [isConnected, amount, sourceBalance]);

    // Simplified chain names for button labels
    const getCleanChainName = (name) => {
        if (!name) return '';
        if (name === 'Ethereum Sepolia') return 'Sepolia';
        if (name === 'Unichain Sepolia') return 'Uni';
        // Remove Testnet and Sepolia suffixes
        return name.replace(/\s+Testnet/i, '').replace(/\s+Sepolia/i, '').trim();
    };

    const hasInsufficientSourceGas = useMemo(() => {
        if (!isConnected || isBridging) return false;
        if (!sourceNativeData) return false;
        // Basic threshold (e.g., 0.0001 native units)
        return parseFloat(sourceNativeData.formatted) < 0.0001;
    }, [isConnected, isBridging, sourceNativeData]);

    const hasInsufficientDestGas = useMemo(() => {
        if (!isConnected || isBridging || mintMode === 'auto') return false;
        if (!destNativeData) return false;
        // Manual mode requires destination gas
        return parseFloat(destNativeData.formatted) < 0.0001;
    }, [isConnected, isBridging, mintMode, destNativeData]);

    const getButtonLabel = () => {
        if (!isConnected) return t.connectWallet;
        if (!amount || parseFloat(amount) <= 0) return t.enterAmount;
        if (isBridging) return t.bridging;
        if (hasInsufficientSourceGas) return `Insufficient Gas on ${getCleanChainName(fromChainName)}`;
        if (hasInsufficientDestGas) return `Insufficient Gas on ${getCleanChainName(toChainName)}`;
        if (hasInsufficientBalance) return t.insufficientBalance;
        if (isEthSwap) return `${t.swapAndBridge} ${amount} ETH`;
        return `${t.bridge} ${amount} USDC`;
    };

    const peerChain = toChainName === 'Arc Testnet' ? fromChain : destChain;
    const peerChainCanSwap = peerChain?.tokens?.length > 1;
    const [ethQuote, setEthQuote] = useState('2500'); // Default fallback

    const [inputMode, setInputMode] = useState('TOKEN'); // 'TOKEN' or 'FIAT'
    const [priceData] = useState({ eth: 2500.00 }); // Initial price data estimate

    const handlePercentageClick = (pct) => {
        const balance = parseFloat(sourceBalance) || 0;
        setAmount((balance * (pct / 100)).toFixed(6));
    };

    const toggleInputMode = () => {
        setInputMode(prev => prev === 'TOKEN' ? 'FIAT' : 'TOKEN');
    };

    // Fetch real quota for entered amount if ETH is selected
    useEffect(() => {
        const fetchQuote = async () => {
            if (selectedToken === 'ETH' && fromChainName === 'Ethereum Sepolia' && amount && parseFloat(amount) > 0) {
                try {
                    const quote = await getSwapQuote(amount);
                    if (quote?.amountOut) {
                        setSwapQuote(quote);
                        // Also update the unit price for the rate display
                        const unitRate = (parseFloat(quote.amountOut) / parseFloat(amount)).toString();
                        setEthQuote(unitRate);
                    }
                } catch (err) {
                    console.error('Quote fetch failed:', err);
                }
            } else if (!amount || parseFloat(amount) <= 0) {
                // Only clear quote when the amount is empty/zero — NOT on chain/token switches
                setSwapQuote(null);
            }
        };

        const timer = setTimeout(fetchQuote, 400); // Debounce
        return () => clearTimeout(timer);
    }, [selectedToken, amount, fromChainName]);

    const fiatValue = useMemo(() => {
        const amt = parseFloat(amount) || 0;
        if (selectedToken === 'ETH') return amt * parseFloat(ethQuote);
        return amt * 1.00; // USDC is $1.00
    }, [amount, selectedToken, ethQuote]);

    return (
        <>
            <div className="bridge-container">
                {/* Top Floating Controls (Desktop/iPad) */}
                <div className="bridge-top-controls">
                    <div className="menu-container">
                        <button
                            className="settings-btn floating"
                            onClick={onOpenSettings}
                            data-tooltip="Settings"
                            data-tooltip-pos="left"
                        >
                            <Settings size={20} />
                        </button>
                    </div>
                </div>

                {/* Cards Navigation Row (Mobile Only) */}
                <div className="bridge-nav-row">
                    <button
                        className="activity-btn-mobile"
                        onClick={() => setActiveTab('activity')}
                        data-tooltip="Activity"
                        data-tooltip-pos="bottom"
                    >
                        <Clock size={20} />
                    </button>
                    <button
                        className="settings-btn-mobile"
                        onClick={onOpenSettings}
                        title="Settings"
                        data-tooltip="Settings"
                        data-tooltip-pos="bottom"
                    >
                        <Settings size={20} />
                    </button>
                </div>

                {/* CARD 1: SELL */}
                <div className="bridge-card-relay sell-card">
                    <div className="card-label-row">
                        <span className="relay-card-label">{t.from}</span>
                        <div
                            className="user-chain-info"
                            onClick={() => openSelector('chain', 'from')}
                            style={{ cursor: 'pointer' }}
                        >
                            <img src={fromChain.icon} alt="" className="mini-chain-logo" />
                            <span className="user-handle">{fromChain.name}</span>
                            <ChevronDown size={14} />
                        </div>
                    </div>

                    <div className="relay-input-row">
                        <div className="input-group">
                            <input
                                type="number"
                                className="relay-amount-input"
                                placeholder="0"
                                value={inputMode === 'TOKEN' ? amount : (fiatValue || '')}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (inputMode === 'TOKEN') {
                                        setAmount(val);
                                    } else {
                                        const price = selectedToken === 'ETH' ? parseFloat(ethQuote) : 1.00;
                                        setAmount((parseFloat(val) / price).toString());
                                    }
                                }}
                            />
                            <div className="relay-fiat-sub">
                                {inputMode === 'TOKEN' ? (
                                    <>
                                        <span className="fiat-val">{c.symbol}{(fiatValue * c.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        <button className="mode-toggle-btn" onClick={toggleInputMode}>
                                            <ArrowUpDown size={12} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <span className="fiat-val">{amount || '0'} {selectedToken}</span>
                                        <button className="mode-toggle-btn" onClick={toggleInputMode}>
                                            <ArrowUpDown size={12} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="selector-group">
                            <button
                                className="relay-token-selector"
                                onClick={() => openSelector('token', 'from')}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="token-icon-wrap">
                                    <img src={TOKEN_INFO[selectedToken]?.icon} alt="" className="token-img" />
                                    <img src={fromChain.icon} alt="" className="chain-badge-overlay" />
                                </div>
                                <div className="token-selector-info">
                                    <span className="token-sym">{selectedToken}</span>
                                    <span className="chain-name-sub">{fromChain.name.split(' ')[0]}</span>
                                </div>
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="relay-card-footer">
                        <div className="balance-info">
                            <span className="balance-label">{t.balance}: {sourceBalance}</span>
                        </div>
                        <div className="pct-buttons">
                            <button onClick={() => handlePercentageClick(20)}>20%</button>
                            <button onClick={() => handlePercentageClick(50)}>50%</button>
                            <button onClick={() => handlePercentageClick(100)}>{t.max}</button>
                        </div>
                    </div>
                </div>

                {/* CONNECTOR ARROW */}
                <div className="relay-connector">
                    <button className="relay-swap-btn" onClick={() => toggleDirection()}>
                        <ArrowDown size={16} />
                    </button>
                </div>

                {/* CARD 2: BUY */}
                <div className="bridge-card-relay buy-card">
                    <div className="card-label-row">
                        <span className="relay-card-label">{t.to}</span>
                        <div
                            className="user-chain-info"
                            onClick={() => openSelector('chain', 'to')}
                            style={{ cursor: 'pointer' }}
                        >
                            <img src={destChain.icon} alt="" className="mini-chain-logo" />
                            <span className="user-handle">{destChain.name}</span>
                            <ChevronDown size={14} />
                        </div>
                    </div>

                    <div className="relay-input-row">
                        <div className="input-group">
                            <span className="relay-amount-display">
                                {isEthSwap && !swapQuote
                                    ? <span className="quote-loading">…</span>
                                    : (receiveAmount || '0')}
                            </span>
                            <div className="relay-fiat-sub">
                                {isEthSwap && swapQuote ? (
                                    <span className="fiat-val">
                                        {c.symbol}{(parseFloat(receiveAmount) * c.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                ) : (
                                    <span className="fiat-val">
                                        {c.symbol}{(fiatValue * c.rate * 0.999).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (-0.01%)
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="selector-group">
                            <button
                                className="relay-token-selector"
                                onClick={() => openSelector('token', 'to')}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="token-icon-wrap">
                                    <img
                                        src={TOKEN_INFO[destToken]?.icon}
                                        alt=""
                                        className="token-img"
                                    />
                                    <img src={destChain.icon} alt="" className="chain-badge-overlay" />
                                </div>
                                <div className="token-selector-info">
                                    <span className="token-sym">{destToken}</span>
                                    <span className="chain-name-sub">{destChain.name.split(' ')[0]}</span>
                                </div>
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="relay-card-footer">
                        <div className="balance-info">
                            <span className="balance-label">{t.balance}: {destBalance}</span>
                        </div>
                        <div className={`recipient-pill-container ${customRecipient && mintMode === 'auto' ? 'pill-visible' : ''}`}>
                            {customRecipient && (
                                <div
                                    className={`recipient-pill ${(isDestForwarderBlocked || isAutoModeRestricted || isEthDestNoRecipient) ? 'pill--disabled' : ''}`}
                                    onClick={!(isDestForwarderBlocked || isAutoModeRestricted || isEthDestNoRecipient) ? onOpenRecipientModal : undefined}
                                >
                                    <ScrollText size={14} color="#fbbf24" style={{ flexShrink: 0 }} />
                                    <span className="pill-address">
                                        {customRecipient.slice(0, 6)}...{customRecipient.slice(-4)}
                                    </span>
                                    <button
                                        className="pill-clear"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCustomRecipient('');
                                        }}
                                        disabled={isDestForwarderBlocked || isAutoModeRestricted}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* CARD 3: INFO */}
                <div className="info-card-wrapper">
                    <div className="bridge-card-relay info-card">
                        <div className="info-row">
                            <span className="info-label">{t.bridgeFee}</span>
                            <div className="info-controls">
                                <div className="slippage-controls">
                                    <span className="val">0.3% ({c.symbol}{(parseFloat(fee) * c.rate).toFixed(2)})</span>
                                </div>
                            </div>
                        </div>

                        {/* Mint Mode Toggle */}
                        <div className="info-row mint-mode-row">
                            <span className="info-label">
                                Mint Mode
                                {(isDestForwarderBlocked || isAutoModeRestricted) && (
                                    <span
                                        className="mint-mode-locked-hint"
                                    >
                                        {' '}🔒
                                    </span>
                                )}
                            </span>
                            <div className={`mint-mode-toggle ${(isDestForwarderBlocked || isAutoModeRestricted) ? 'mint-mode-toggle--locked' : ''}`} data-mode={mintMode}>
                                <button
                                    className={`mint-mode-btn ${mintMode === 'manual' ? 'mint-mode-btn--active' : ''}`}
                                    onClick={() => {
                                        if (!(isDestForwarderBlocked || isAutoModeRestricted)) {
                                            setMintMode('manual');
                                            setCustomRecipient('');
                                        }
                                    }}
                                    disabled={isDestForwarderBlocked || isAutoModeRestricted}
                                    data-tooltip={!(isDestForwarderBlocked || isAutoModeRestricted) ? "You sign the mint transaction on the destination chain" : undefined}
                                >
                                    Manual
                                </button>
                                <button
                                    className={`mint-mode-btn ${mintMode === 'auto' ? 'mint-mode-btn--active' : ''}`}
                                    onClick={() => !(isDestForwarderBlocked || isAutoModeRestricted) && setMintMode('auto')}
                                    disabled={isDestForwarderBlocked || isAutoModeRestricted}
                                    data-tooltip={
                                        isAutoModeRestricted
                                            ? "Minimum 5 USDC required for Auto mode to Sepolia"
                                            : !isDestForwarderBlocked
                                                ? "Auto Mint by Circle, no destination gas needed"
                                                : undefined
                                    }
                                >
                                    Auto
                                </button>
                            </div>
                        </div>

                        <div className="info-row tokens-rate">
                            <span className="rate-val">
                                {isEthSwap
                                    ? `1 ETH = ${parseFloat(ethQuote).toLocaleString()} USDC`
                                    : `1 ${selectedToken} = 1.0000 ${selectedToken}`}
                            </span>
                            <div className="meta-stats">
                                <div className="stat-item">
                                    <Clock size={14} color="#10b981" />
                                    <span>{expectedTime}</span>
                                </div>
                                {isForwarderActive && (
                                    <div className="stat-item gasless-stat">
                                        <Zap size={14} color="#fbbf24" />
                                        <span>Gasless Dest.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="desktop-only">
                        <button
                            className={`recipient-trigger-btn ${(isDestForwarderBlocked || isAutoModeRestricted || isEthDestNoRecipient) ? 'trigger--disabled' : ''}`}
                            onClick={!(isDestForwarderBlocked || isAutoModeRestricted || isEthDestNoRecipient) ? onOpenRecipientModal : undefined}
                            disabled={isDestForwarderBlocked || isAutoModeRestricted || isEthDestNoRecipient}
                            data-tooltip={isEthDestNoRecipient ? "Custom recipient not supported for ETH destination swaps" : isAutoModeRestricted ? "Minimum 5 USDC required for Ethereum Auto mode" : isDestForwarderBlocked ? "Auto Mode unavailable for this chain" : "Send to a different wallet"}
                            data-tooltip-pos="left"
                        >
                            <img src="/icons/wallet.png" alt="Wallet" />
                        </button>
                    </div>
                </div>

                {/* CARD 4: ACTION */}
                <div className="action-card-relay">
                    {!isConnected ? (
                        <button onClick={handleConnect} className="relay-main-btn">
                            {t.connectWallet}
                        </button>
                    ) : (
                        <button
                            className="relay-main-btn"
                            onClick={handleBridge}
                            disabled={isBridging || (!amount || parseFloat(amount) <= 0) || hasInsufficientBalance || hasInsufficientSourceGas || hasInsufficientDestGas}
                        >
                            {getButtonLabel()}
                        </button>
                    )}
                </div>

                <div className="mobile-only">
                    <div className="mobile-recipient-wrap">
                        <button
                            className={`recipient-trigger-btn recipient-trigger-btn-mobile ${(isDestForwarderBlocked || isAutoModeRestricted || isEthDestNoRecipient) ? 'trigger--disabled' : ''}`}
                            onClick={!(isDestForwarderBlocked || isAutoModeRestricted || isEthDestNoRecipient) ? onOpenRecipientModal : undefined}
                            disabled={isDestForwarderBlocked || isAutoModeRestricted || isEthDestNoRecipient}
                        >
                            <img src="/icons/wallet.png" alt="Wallet" />
                        </button>
                    </div>
                </div>
            </div>

            <AssetSelectorModal
                isOpen={isSelectorOpen}
                onClose={() => setIsSelectorOpen(false)}
                onSelect={handleAssetSelect}
                currentChain={selectorTarget === 'from' ? fromChainName : toChainName}
                currentToken={selectedToken}
                mode={selectorMode}
            />

            <TransactionModal
                isOpen={isTxModalOpen}
                onClose={() => {
                    setIsTxModalOpen(false);
                    // If the bridge fully completed, reset the form so it's fresh for the next tx
                    if (txData.destHash) {
                        resetBridge();
                    }
                }}
                bridgeStep={bridgeStep}
                stepStatuses={stepStatuses}
                bridgeSteps={bridgeSteps}
                error={bridgeError}
                txData={txData}
                amount={amount}
                selectedToken={selectedToken}
                destToken={destToken}
                destAmount={receiveAmount}
                fromChain={fromChainName}
                toChain={toChainName}
                destAddress={customRecipient || currentAddress}
                walletAddress={currentAddress}
                isSwapAndBridge={isEthSwap}
                onRemint={handleRemint}
                isReminting={isReminting}
            />
        </>
    );
}
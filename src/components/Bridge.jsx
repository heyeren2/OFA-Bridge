import { useState, useCallback, useMemo, useEffect } from 'react';
import { Settings, ChevronDown, ChevronRight, ArrowUpDown, ArrowDown, Clock, Zap } from 'lucide-react';
import { useAccount, useBalance } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import ChainSelector from './ChainSelector';
import TokenSelector from './TokenSelector';
import AssetSelectorModal from './AssetSelectorModal';
import SettingsPopup from './SettingsPopup';
import BridgeStatus from './BridgeStatus';
import { SUPPORTED_CHAINS, ARC_CHAIN, BRIDGE_DIRECTION, getChainByName } from '../config/chains';
import { TOKEN_INFO, USDC_ADDRESSES, SWAP_FEE_PERCENTAGE } from '../config/contracts';
import { calculateFee, calculateForwardingFee, executeBridge } from '../services/bridgeService';
import { FORWARDING_CONFIG, DEFAULT_MINT_MODE, CHAINS_WITHOUT_FORWARDER_SUPPORT } from '../services/forwardingConfig';
import { getSwapQuote, executeSwap } from '../services/swapService';
import TransactionModal from './TransactionModal';

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
        insufficientBalance: 'Insufficient Balance'
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
        insufficientBalance: 'Saldo Insuficiente'
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
        insufficientBalance: 'Onvoldoende Saldo'
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
        insufficientBalance: 'Solde Insuffisant'
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
        insufficientBalance: '余额不足'
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
        insufficientBalance: '残高不足'
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
    setActiveTab
}) {
    const t = TRANSLATIONS[language] || TRANSLATIONS.English;
    const c = CURRENCY_DATA[currency] || CURRENCY_DATA.USD;

    const { openConnectModal } = useConnectModal();
    const { address: currentAddress, isConnected } = useAccount();

    const [fromChainName, setFromChainName] = useState('Ethereum Sepolia');
    const [toChainName, setToChainName] = useState('Arc Testnet');
    const [selectedToken, setSelectedToken] = useState('USDC');
    const [amount, setAmount] = useState('');
    const [isBridging, setIsBridging] = useState(false);
    const [bridgeStep, setBridgeStep] = useState(null); // The current active/focus step
    const [stepStatuses, setStepStatuses] = useState({}); // Detailed status for each step: { 'approve': 'completed', ... }
    const [bridgeError, setBridgeError] = useState(null);
    const [swapQuote, setSwapQuote] = useState(null);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [selectorMode, setSelectorMode] = useState('chain');
    const [selectorTarget, setSelectorTarget] = useState('from'); // 'from' or 'to'
    const [isTxModalOpen, setIsTxModalOpen] = useState(false);
    const [txData, setTxData] = useState({ approveHash: null, sourceHash: null, destHash: null });

    // ── Mint mode toggle ─────────────────────────────────────────────────────
    // 'manual' → user signs the mint on destination chain (default)
    // 'auto'   → Circle's Forwarding Service mints automatically (gasless)
    // Arc Testnet and other chains without customBurnWithHook support are always
    // forced to 'manual' regardless of what the user picks.
    const isDestForwarderBlocked = CHAINS_WITHOUT_FORWARDER_SUPPORT.displayNames.includes(toChainName);
    const [mintMode, setMintMode] = useState(DEFAULT_MINT_MODE);

    // When the user picks a destination that blocks the forwarder, reset to manual
    useEffect(() => {
        if (isDestForwarderBlocked) {
            setMintMode('manual');
        }
    }, [toChainName, isDestForwarderBlocked]);

    // Whether the forwarder is actually active for the current route
    const isForwarderActive =
        FORWARDING_CONFIG.isForwardingEnabled &&
        mintMode === 'auto' &&
        !isDestForwarderBlocked;
    // ────────────────────────────────────────────────────────────────────────

    const fromChain = useMemo(() => getChainByName(fromChainName), [fromChainName]);
    const destChain = useMemo(() => getChainByName(toChainName), [toChainName]);

    const isEthSwap = selectedToken === 'ETH' && fromChainName === 'Ethereum Sepolia';

    // Real Balances

    const { data: sourceBalanceData } = useBalance({
        address: currentAddress,
        token: selectedToken === 'USDC' ? USDC_ADDRESSES[fromChain.bridgeKitName] : undefined,
        chainId: fromChain.chainId,
        watch: true,
    });

    const { data: destBalanceData } = useBalance({
        address: currentAddress,
        token: USDC_ADDRESSES[destChain.bridgeKitName],
        chainId: destChain.chainId,
        watch: true,
    });

    const sourceBalance = useMemo(() => {
        if (!isConnected) return '0';
        return sourceBalanceData ? parseFloat(sourceBalanceData.formatted).toFixed(6) : '0';
    }, [isConnected, sourceBalanceData]);

    const destBalance = useMemo(() => {
        if (!isConnected) return '0';
        return destBalanceData ? parseFloat(destBalanceData.formatted).toFixed(6) : '0';
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
        return (parseFloat(baseFee) + parseFloat(forwardingFee)).toFixed(2);
    }, [amount, isEthSwap, swapQuote, forwardingFee]);

    const receiveAmount = useMemo(() => {
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return '0.00';
        if (isEthSwap && swapQuote) {
            // Deduct displayed fee + hidden swap fee from swap output
            const hiddenSwapFee = (parseFloat(swapQuote.amountOut) * SWAP_FEE_PERCENTAGE).toFixed(2);
            return (parseFloat(swapQuote.amountOut) - parseFloat(fee) - parseFloat(hiddenSwapFee)).toFixed(2);
        }
        return (parseFloat(amount) - parseFloat(fee)).toFixed(2);
    }, [amount, fee, isEthSwap, swapQuote]);

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
            ? { key: 'mint', label: 'Circle Minting (Automatic)', icon: '⚡' }
            : { key: 'mint', label: 'Mint USDC', icon: '✨' };

        if (isEthSwap) {
            return [
                { key: 'swap', label: 'Swap ETH → USDC', icon: '🔄' },
                { key: 'approve', label: 'Approve USDC', icon: '✅' },
                { key: 'burn', label: 'Burn USDC', icon: '🔥' },
                { key: 'attestation', label: 'Attestation', icon: '📡' },
                mintStep,
            ];
        }
        return [
            { key: 'approve', label: 'Approve USDC', icon: '✅' },
            { key: 'burn', label: 'Burn USDC', icon: '🔥' },
            { key: 'attestation', label: 'Attestation', icon: '📡' },
            mintStep,
        ];
    }, [isEthSwap, isForwarderActive]);

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
        }
        setSwapQuote(null);
        setBridgeStep(null);
        setBridgeError(null);
        setIsSelectorOpen(false);
    }, [selectorTarget, toChainName, fromChainName, selectedToken]);

    const handleAssetSelect = useCallback((chainName, tokenSymbol) => {
        if (selectorTarget === 'from') {
            setFromChainName(chainName);
            if (chainName === toChainName) {
                setToChainName(fromChainName);
            }
        } else {
            setToChainName(chainName);
            if (chainName === fromChainName) {
                setFromChainName(toChainName);
            }
        }

        // Only allow non-USDC if it's not Arc or if it's a specific supported route (e.g. ETH swap)
        // For simplicity and matching current logic, we default to USDC for most things
        if (chainName === ARC_CHAIN.name) {
            setSelectedToken('USDC');
        } else {
            setSelectedToken(tokenSymbol);
        }

        setSwapQuote(null);
        setBridgeStep(null);
        setStepStatuses({});
        setBridgeError(null);
        setIsSelectorOpen(false);
    }, [selectorTarget, fromChainName, toChainName]);

    const openSelector = useCallback((mode, target = 'from') => {
        setSelectorMode(mode);
        setSelectorTarget(target);
        setIsSelectorOpen(true);
    }, []);

    const handleAmountChange = useCallback(async (e) => {
        const val = e.target.value;
        if (val === '' || /^\d*\.?\d*$/.test(val)) {
            setAmount(val);
            setSwapQuote(null);

            if (val && parseFloat(val) > 0 && selectedToken === 'ETH') {
                try {
                    const quote = await getSwapQuote(val);
                    setSwapQuote(quote);
                } catch {
                    setSwapQuote(null);
                }
            }
        }
    }, [selectedToken]);

    const toggleDirection = useCallback(() => {
        const oldFrom = fromChainName;
        setFromChainName(toChainName);
        setToChainName(oldFrom);
        setSelectedToken('USDC');
        setSwapQuote(null);
        setBridgeStep(null);
        setBridgeError(null);
    }, [fromChainName, toChainName]);

    const handleConnect = useCallback(() => {
        if (openConnectModal) {
            openConnectModal();
        }
    }, [openConnectModal]);

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

        const hasBurnTxRef = { current: false };
        const isCancelledRef = { current: false };

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

        // Helper to update this entry in localStorage
        const updateHistory = (updates) => {
            const history = JSON.parse(localStorage.getItem('bridgeHistory') || '[]');
            const idx = history.findIndex(h => h.id === txId);
            if (idx >= 0) {
                history[idx] = { ...history[idx], ...updates };
            } else {
                history.unshift({ ...historyEntry, ...updates });
            }
            localStorage.setItem('bridgeHistory', JSON.stringify(history.slice(0, 50)));
            // Dispatch storage event so Activity tab updates in real-time
            window.dispatchEvent(new Event('storage'));
        };

        // Save the initial processing entry
        updateHistory({});

        try {
            let bridgeAmount = amount;
            const fromChainKit = fromChain.bridgeKitName;
            const toChainKit = destChain.bridgeKitName;

            if (isEthSwap) {
                setBridgeStep('swap');
                setStepStatuses(prev => ({ ...prev, swap: 'pending' }));
                const swapResult = await executeSwap(amount, swapQuote?.amountOut || '0', currentAddress);
                bridgeAmount = swapResult.usdcReceived;
                setBridgeStep('approve');
                setStepStatuses(prev => ({ ...prev, swap: 'completed' }));
                updateHistory({ lastStep: 'approve' });
            }

            const result = await executeBridge({
                fromChain: fromChainKit,
                toChain: toChainKit,
                amount: bridgeAmount,
                recipientAddress: currentAddress,
                forwardingFee,
                isSwapRoute: isEthSwap,
                mintMode,
                onStatusUpdate: (update) => {
                    if (update.step === 'error') {
                        setBridgeError(update.error);
                    } else if (update.step === 'cancelled') {
                        isCancelledRef.current = true;
                        if (update.failedStep) {
                            setBridgeStep(update.failedStep);
                            setStepStatuses(prev => ({ ...prev, [update.failedStep]: 'error' }));
                            updateHistory({ lastStep: update.failedStep });
                        }
                        setBridgeError('CANCELLED');

                    } else if (update.step === 'complete') {
                        // All done — handled after executeBridge resolves

                    } else if (update.status === 'completed') {
                        // ── Step finished ──
                        console.log(`[Bridge] ✅ Step [${update.step}] COMPLETED (forced=${!!update.forced}, txHash=${update.txHash})`);
                        setStepStatuses(prev => ({ ...prev, [update.step]: 'completed' }));
                        // IMPORTANT: Only advance bridgeStep for REAL completions (txHash present).
                        // Forced completions (prevStep fallback, txHash=null) must NOT call setBridgeStep
                        // because that pulls the UI BACKWARD (e.g. 'attestation' → 'burn') and resets the timer.
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
                            }
                            if (update.step === 'mint') {
                                setTxData(prev => ({ ...prev, destHash: update.txHash }));
                                updateHistory({ txHashes: { dest: update.txHash }, lastStep: 'complete' });
                            }
                        }

                    } else if (update.status === 'pending' || update.status === 'started') {
                        // ── Next step starting ──
                        if (!isCancelledRef.current) {
                            console.log(`[Bridge] 🔄 Step [${update.step}] starting`);
                            setStepStatuses(prev => {
                                // Don't overwrite a 'completed' status with 'pending'
                                if (prev[update.step] === 'completed') return prev;
                                return { ...prev, [update.step]: 'pending' };
                            });

                            // REGRESSION GUARD & STEP FORWARDER
                            setBridgeStep(current => {
                                const stepOrder = ['approve', 'burn', 'attestation', 'mint'];
                                const currentIndex = stepOrder.indexOf(current);
                                const nextIndex = stepOrder.indexOf(update.step);

                                // Always advance, never pull back
                                if (nextIndex > currentIndex) {
                                    // SWEEP: When advancing, ensure all steps BEFORE the new step 
                                    // are marked as completed too (just in case signals were missed)
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

            // Log SDK result for debugging
            console.log('[Bridge] executeBridge resolved:', {
                resultState: result.state,
                isActuallyCancelled: isCancelledRef.current,
                hasBurnTx: hasBurnTxRef.current
            });

            // If the SDK resolved but no burn tx was recorded,
            // the user cancelled and the SDK swallowed the error
            if (!hasBurnTxRef.current && !isCancelledRef.current && result.state !== 'completed') {
                console.log('[Bridge] No burn tx detected — treating as user cancellation');
                isCancelledRef.current = true;
                setBridgeError('CANCELLED');
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
            // Determine user-facing error message
            let displayError = err.shortMessage || err.message || 'Bridge execution failed';

            // Map specific error codes for production clarity
            if (err.code === 9002 || err.message?.includes('9002')) {
                const currentChain = bridgeStep === 'mint' ? toChainName : fromChainName;
                displayError = `Insufficient gas funds on ${currentChain}`;
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
                isActuallyCancelled = true;
                setBridgeError('CANCELLED');
                const finalStatus = hasBurnTx ? 'mint_failed' : 'cancelled';
                updateHistory({ status: finalStatus });
            } else {
                setBridgeError(displayError);
                updateHistory({ status: 'failed' });
            }
        } finally {
            setIsBridging(false);
        }
    }, [isConnected, amount, fromChainName, toChainName, fromChain, destChain, isEthSwap, swapQuote, currentAddress, selectedToken, fee, receiveAmount, forwardingFee, mintMode, handleConnect]);

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

    const getButtonLabel = () => {
        if (!isConnected) return t.connectWallet;
        if (isBridging) return t.bridging;
        if (hasInsufficientBalance) return t.insufficientBalance;
        if (isEthSwap) return `${t.swapAndBridge} ${amount || '0'} ETH`;
        return `${t.bridge} ${amount || '0'} USDC`;
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
            } else {
                setSwapQuote(null);
            }
        };

        const timer = setTimeout(fetchQuote, 500); // Debounce
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
                <div className="bridge-top-controls desktop-only">
                    <div className="menu-container">
                        <button
                            className="settings-btn floating"
                            onClick={onOpenSettings}
                            title="Settings"
                        >
                            <Settings size={20} />
                        </button>
                    </div>
                </div>

                {/* Cards Navigation Row (Mobile Only) */}
                <div className="bridge-nav-row mobile-only">
                    <button
                        className="activity-btn-mobile"
                        onClick={() => setActiveTab('activity')}
                        title="Activity"
                    >
                        <Clock size={20} />
                    </button>
                    <button
                        className="settings-btn-mobile"
                        onClick={onOpenSettings}
                        title="Settings"
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
                            <span className="relay-amount-display">{receiveAmount || '0'}</span>
                            <div className="relay-fiat-sub">
                                <span className="fiat-val">{c.symbol}{(fiatValue * c.rate * 0.999).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (-0.01%)</span>
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
                                        src={TOKEN_INFO['USDC']?.icon}
                                        alt=""
                                        className="token-img"
                                    />
                                    <img src={destChain.icon} alt="" className="chain-badge-overlay" />
                                </div>
                                <div className="token-selector-info">
                                    <span className="token-sym">USDC</span>
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
                    </div>
                </div>

                {/* CARD 3: INFO */}
                <div className="bridge-card-relay info-card">
                    <div className="info-row">
                        <span className="info-label">{t.bridgeFee}</span>
                        <div className="slippage-controls">
                            <span className="val">0.3% ({c.symbol}{(parseFloat(fee) * c.rate).toFixed(2)})</span>
                        </div>
                    </div>

                    {/* ── Mint Mode Toggle ───────────────────────────────────────────────
                        Shows for all chains. For chains that block the forwarder (Arc),
                        the toggle is locked on Manual with a tooltip explaining why.
                        Default is Manual — user opts in to Auto (gasless).
                    ──────────────────────────────────────────────────────────────────── */}
                    <div className="info-row mint-mode-row">
                        <span className="info-label">
                            Mint Mode
                            {isDestForwarderBlocked && (
                                <span
                                    className="mint-mode-locked-hint"
                                    title={`${toChainName} doesn't support auto-minting`}
                                >
                                    {' '}🔒
                                </span>
                            )}
                        </span>
                        <div className={`mint-mode-toggle ${isDestForwarderBlocked ? 'mint-mode-toggle--locked' : ''}`} data-mode={mintMode}>
                            <button
                                className={`mint-mode-btn ${mintMode === 'manual' ? 'mint-mode-btn--active' : ''}`}
                                onClick={() => !isDestForwarderBlocked && setMintMode('manual')}
                                disabled={isDestForwarderBlocked}
                                title="You sign the mint transaction on the destination chain"
                            >
                                Manual
                            </button>
                            <button
                                className={`mint-mode-btn ${mintMode === 'auto' ? 'mint-mode-btn--active' : ''}`}
                                onClick={() => !isDestForwarderBlocked && setMintMode('auto')}
                                disabled={isDestForwarderBlocked}
                                title={
                                    isDestForwarderBlocked
                                        ? `${toChainName} doesn't support auto-minting`
                                        : 'Circle mints for you — no destination gas needed'
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
                            <div className="stat-item" title="Estimated Time">
                                <Clock size={14} color="#10b981" />
                                <span>{expectedTime}</span>
                            </div>
                            {isForwarderActive && (
                                <div className="stat-item gasless-stat" title="Gasless Destination — Circle mints for you">
                                    <Zap size={14} color="#fbbf24" />
                                    <span>Gasless Dest.</span>
                                </div>
                            )}
                        </div>
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
                            disabled={isBridging || (!amount || parseFloat(amount) <= 0) || hasInsufficientBalance}
                        >
                            {getButtonLabel()}
                        </button>
                    )}
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
                onClose={() => setIsTxModalOpen(false)}
                bridgeStep={bridgeStep}
                stepStatuses={stepStatuses}
                bridgeSteps={bridgeSteps}
                error={bridgeError}
                txData={txData}
                amount={amount}
                selectedToken={selectedToken}
                fromChain={fromChainName}
                toChain={toChainName}
                destAddress={currentAddress}
                isSwapAndBridge={isEthSwap}
            />
        </>
    );
}
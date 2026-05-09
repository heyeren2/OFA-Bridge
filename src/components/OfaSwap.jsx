import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowUpDown, Zap, ExternalLink, ChevronDown, ChevronRight, ScrollText, User, Wallet, Settings, Pen, Check, ArrowLeft } from 'lucide-react';
import { useAccount, useBalance, useReadContract } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { parseUnits } from 'viem';
import { appKitSwap, estimateSwapStats, getSwapQuote } from '../services/appKitSwapService';
import { USDC_ADDRESSES, EURC_ADDRESSES, CIRBTC_ADDRESSES, TOKEN_INFO, SWAP_FEE_PERCENTAGE, SWAP_FEE_RECIPIENT, ARC_SWAP_SPENDER, ERC20_ABI } from '../config/contracts';
import OfaReceive from './OfaReceive';
import OfaModal from './OfaModal';
import './OfaSwap.css';
import './OfaModal.css';

// Arc Testnet chain ID
const ARC_CHAIN_ID = 5042002;

const DIRECTION_MAP = {
    eurc_to_usdc: { in: 'EURC', out: 'USDC' },
    usdc_to_eurc: { in: 'USDC', out: 'EURC' },
    usdc_to_cirbtc: { in: 'USDC', out: 'cirBTC' },
    cirbtc_to_usdc: { in: 'cirBTC', out: 'USDC' },
    eurc_to_cirbtc: { in: 'EURC', out: 'cirBTC' },
    cirbtc_to_eurc: { in: 'cirBTC', out: 'EURC' },
};



export default function OfaSwap({ setActiveTab }) {
    const { address, isConnected, connector } = useAccount();
    const { openConnectModal } = useConnectModal();

    const [direction, setDirection] = useState('eurc_to_usdc'); // see DIRECTION_MAP
    const [amount, setAmount] = useState('');
    const [isSwapping, setIsSwapping] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [statusType, setStatusType] = useState(''); // 'success' | 'error'
    const [lastTx, setLastTx] = useState(null);
    const [isFetchingQuote, setIsFetchingQuote] = useState(false);
    const [quote, setQuote] = useState(null);
    const [quoteError, setQuoteError] = useState('');

    // Dynamic Recipient Logic
    const [recipientAddress, setRecipientAddress] = useState('');
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [isRecipientDropdownOpen, setIsRecipientDropdownOpen] = useState(false);

    // Slippage Settings State
    const [slippage, setSlippage] = useState(1.0);
    const [isSlippageOpen, setIsSlippageOpen] = useState(false);
    const [isEditingSlippage, setIsEditingSlippage] = useState(false);
    const [customSlippageValue, setCustomSlippageValue] = useState('1.0');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalStep, setModalStep] = useState('approving');
    const [modalStats, setModalStats] = useState({
        gasFee: '< $0.01',
        estTime: '~2-3s',
        slippage: '1.0%', // Pull from settings if available
        rate: 'Calculating...'
    });
    const [modalError, setModalError] = useState('');

    const [isTokenInDropdownOpen, setIsTokenInDropdownOpen] = useState(false);
    const [isTokenOutDropdownOpen, setIsTokenOutDropdownOpen] = useState(false);

    const tokenInDropdownRef = useRef(null);
    const tokenOutDropdownRef = useRef(null);
    const dropdownRef = useRef(null);

    const isCustomRecipient = isConnected && address && recipientAddress &&
        recipientAddress.toLowerCase() !== address.toLowerCase();

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsRecipientDropdownOpen(false);
            }
            if (tokenInDropdownRef.current && !tokenInDropdownRef.current.contains(e.target)) {
                setIsTokenInDropdownOpen(false);
            }
            if (tokenOutDropdownRef.current && !tokenOutDropdownRef.current.contains(e.target)) {
                setIsTokenOutDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isConnected && address && !recipientAddress) {
            setRecipientAddress(address);
        }
    }, [isConnected, address, recipientAddress]);

    // ── Pre-swap Quote Effect ────────────────────────────────────────────────
    useEffect(() => {
        const fetchQuote = async () => {
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                setQuote(null);
                setQuoteError('');
                return;
            }

            setIsFetchingQuote(true);
            setQuoteError('');
            try {
                const q = await getSwapQuote({
                    tokenIn,
                    tokenOut,
                    amountIn: amount,
                    connector
                });
                if (!q && (tokenIn === 'cirBTC' || tokenOut === 'cirBTC')) {
                    setQuoteError('Quote unavailable, try a smaller amount');
                }
                setQuote(q);
            } catch (err) {
                console.warn('[OfaSwap] Quote effect failed:', err);
                setQuote(null);
                if (tokenIn === 'cirBTC' || tokenOut === 'cirBTC') {
                    setQuoteError('Quote failed, try a smaller amount');
                }
            } finally {
                setIsFetchingQuote(false);
            }
        };

        const timer = setTimeout(fetchQuote, 600);
        return () => clearTimeout(timer);
    }, [amount, direction, connector]);

    const abbreviateAddress = (addr) => {
        if (!addr) return 'Connect Wallet';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    const tokenIn = DIRECTION_MAP[direction].in;
    const tokenOut = DIRECTION_MAP[direction].out;
    const tokenInInfo = TOKEN_INFO[tokenIn];
    const tokenOutInfo = TOKEN_INFO[tokenOut];

    // Source/Dest balance on Arc Testnet
    const { data: usdcData } = useBalance({
        address,
        token: USDC_ADDRESSES.Arc_Testnet,
        chainId: ARC_CHAIN_ID,
        watch: true,
    });

    const { data: eurcData } = useBalance({
        address,
        token: EURC_ADDRESSES.Arc_Testnet,
        chainId: ARC_CHAIN_ID,
        watch: true,
    });

    const { data: cirbtcData } = useBalance({
        address,
        token: CIRBTC_ADDRESSES.Arc_Testnet,
        chainId: ARC_CHAIN_ID,
        watch: true,
    });

    const fmt = (data) => {
        if (!data) return '0.00';
        const [int, frac] = data.formatted.split('.');
        return `${int}.${(frac || '00').padEnd(2, '0').slice(0, 2)}`;
    };

    const usdcBalance = fmt(usdcData);
    const eurcBalance = fmt(eurcData);
    const cirbtcBalance = (() => {
        if (!cirbtcData) return '0.0000';
        const val = parseFloat(cirbtcData.formatted);
        if (val === 0) return '0.0000';
        return val >= 1 ? val.toFixed(2) : val.toFixed(4);
    })();

    const getBalanceData = (token) => {
        if (token === 'USDC') return usdcData;
        if (token === 'EURC') return eurcData;
        if (token === 'cirBTC') return cirbtcData;
        return null;
    };

    const fmtBalance = (token) => {
        if (token === 'cirBTC') return cirbtcBalance;
        return fmt(getBalanceData(token));
    };

    const sourceBalanceFormatted = fmtBalance(tokenIn);
    const destBalanceFormatted = fmtBalance(tokenOut);

    // Allowance check for dynamic button text
    const { data: allowance } = useReadContract({
        address: tokenIn === 'EURC' ? EURC_ADDRESSES.Arc_Testnet
            : tokenIn === 'cirBTC' ? CIRBTC_ADDRESSES.Arc_Testnet
                : USDC_ADDRESSES.Arc_Testnet,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, ARC_SWAP_SPENDER],
        query: {
            enabled: !!address && !!ARC_SWAP_SPENDER,
            refetchInterval: 5000
        }
    });

    const tokenInDecimals = tokenIn === 'cirBTC' ? 8 : 6;

    const hasAllowance = (() => {
        if (!amount || isNaN(parseFloat(amount))) return false;
        if (allowance === undefined || allowance === null) return false;
        try {
            const required = parseUnits(amount, tokenInDecimals);
            return BigInt(allowance) >= required;
        } catch (e) {
            return false;
        }
    })();

    const handleToggle = () => {
        setDirection(`${tokenOut.toLowerCase()}_to_${tokenIn.toLowerCase()}`);
        setAmount('');
        setQuote(null);
    };

    const handleTokenChange = (type, token) => {
        if (type === 'in') {
            if (token === tokenOut) {
                // Swap tokens if same selected
                setDirection(`${tokenOut.toLowerCase()}_to_${tokenIn.toLowerCase()}`);
            } else {
                setDirection(`${token.toLowerCase()}_to_${tokenOut.toLowerCase()}`);
            }
            setIsTokenInDropdownOpen(false);
        } else {
            if (token === tokenIn) {
                // Swap tokens if same selected
                setDirection(`${tokenOut.toLowerCase()}_to_${tokenIn.toLowerCase()}`);
            } else {
                setDirection(`${tokenIn.toLowerCase()}_to_${token.toLowerCase()}`);
            }
            setIsTokenOutDropdownOpen(false);
        }
        setAmount('');
        setQuote(null);
    };

    const handlePercentageClick = (pct) => {
        const balanceObj = getBalanceData(tokenIn);
        if (!balanceObj) return;
        const fullAmount = parseFloat(balanceObj.formatted);
        if (pct === 100) {
            setAmount(balanceObj.formatted);
        } else {
            setAmount(((fullAmount * pct) / 100).toFixed(tokenInDecimals));
        }
    };

    const handleSwap = useCallback(async () => {
        if (!isConnected) { openConnectModal?.(); return; }
        if (!amount || parseFloat(amount) <= 0) return;

        // Reset and Open Modal
        setModalStep('approving');
        setModalError('');
        setLastTx(null);
        setIsModalOpen(true);
        setIsSwapping(true);

        try {
            // 1. Fetch real-time stats for the modal
            const stats = await estimateSwapStats();

            // Use quote data if available, else show a neutral fallback
            const finalToAmount = quote ? quote.amountOut : '--';
            const finalRate = quote
                ? `1 ${tokenIn} = ${quote.rate} ${tokenOut}`
                : 'Calculated by SDK';

            setModalStats(prev => ({
                ...prev,
                ...stats,
                slippage: `${slippage}%`,
                rate: finalRate,
                toAmount: finalToAmount
            }));

            // 2. Prepare Fee Logic (SDK Handles Fees)
            const customFeeConfig = {
                percentageBps: Math.round(SWAP_FEE_PERCENTAGE * 10000), // 20 BPS
                recipientAddress: SWAP_FEE_RECIPIENT
            };

            // 3. Start Swap
            const result = await appKitSwap(
                tokenIn,
                tokenOut,
                amount,
                amount,
                connector,
                slippage,
                ({ step }) => {
                    if (step === 'approving') setModalStep('approving');
                    else if (step === 'swapping') setModalStep('swapping');
                },
                customFeeConfig
            );

            // 3. Finalize — capture amounts BEFORE clearing the input
            const capturedAmountIn = amount;
            const capturedAmountOut = result?.amountOut
                ?? (quote ? quote.amountOut : (parseFloat(amount) * (1 - SWAP_FEE_PERCENTAGE)).toFixed(4));

            setLastTx({
                ...result,
                amountIn: capturedAmountIn,
                amountOut: capturedAmountOut
            });
            setModalStep('success');
            setAmount('');
        } catch (err) {
            console.error('Swap Error:', err);
            setModalError(err.message || 'Swap failed');
        } finally {
            setIsSwapping(false);
        }
    }, [isConnected, amount, direction, connector, openConnectModal, quote, slippage]);

    const kitKeyMissing = !import.meta.env.VITE_CIRCLE_KIT_KEY ||
        import.meta.env.VITE_CIRCLE_KIT_KEY === 'your_kit_key_here';

    const isInsufficientBalance = (() => {
        if (!amount || isNaN(parseFloat(amount)) || !isConnected) return false;
        const balanceObj = getBalanceData(tokenIn);
        if (!balanceObj) return false;
        try {
            const required = parseUnits(amount, balanceObj.decimals);
            return balanceObj.value < required;
        } catch (e) {
            return false;
        }
    })();

    const btnLabel = !isConnected
        ? 'Connect Wallet'
        : !amount || parseFloat(amount) <= 0
            ? 'Enter Amount'
            : isInsufficientBalance
                ? 'Insufficient Balance'
        : quoteError
            ? 'Quote Unavailable'
            : isSwapping
                ? `Swapping...`
                : hasAllowance
                    ? `Swap`
                    : `Approve & Swap`;

    const canSwap = isConnected && amount && parseFloat(amount) > 0 && !isSwapping && !kitKeyMissing && !isInsufficientBalance && !quoteError && !!quote;

    return (
        <div className="ofa-swap-page">
            <div className="swap-mobile-header mobile-only">
                <div className="swap-header-center-wrap">
                    <button className="swap-back-arrow" onClick={() => setActiveTab('bridge')}>
                        <ArrowLeft size={18} />
                    </button>
                    <h1>Swap</h1>
                </div>
            </div>

            <div className="ofa-bal-card">
                <div className="ofa-bal-horizontal-row">
                    <div className="ofa-bal-group">
                        <img src="/icons/euro.png" alt="EURC" className="ofa-bal-token-icon" />
                        <span className="ofa-bal-sym">EURC</span>
                        <span className="ofa-bal-amount">{eurcBalance}</span>
                    </div>
                    <div className="ofa-bal-sep" />
                    <div className="ofa-bal-group">
                        <img src="/icons/usdc.png" alt="USDC" className="ofa-bal-token-icon" />
                        <span className="ofa-bal-sym">USDC</span>
                        <span className="ofa-bal-amount">{usdcBalance}</span>
                    </div>
                    <div className="ofa-bal-sep" />
                    <div className="ofa-bal-group">
                        <img src="/icons/cirBTC.png" alt="cirBTC" className="ofa-bal-token-icon ofa-cirbtc-icon" />
                        <span className="ofa-bal-sym">cirBTC</span>
                        <span className="ofa-bal-amount">{cirbtcBalance}</span>
                    </div>
                </div>
            </div>

            <div className="ofa-swap-card-container">

                <div className="ofa-card-relay ofa-card-wrap ofa-pay-card" id="ofa-pay-card">
                    <div className="ofa-label-row">
                        <span className="ofa-relay-card-label">Pay</span>
                        <div className="ofa-user-chain-info">
                            <img src="/icons/Arc.png" alt="Arc" className="ofa-mini-chain-logo" />
                            <span className="ofa-user-handle">Arc Testnet</span>
                            <ChevronDown size={14} />
                        </div>
                    </div>

                    <div className="ofa-relay-input-row">
                        <div className="ofa-input-group">
                            <input
                                className="ofa-amount-input"
                                type="number"
                                placeholder="0"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                disabled={isSwapping}
                            />
                            <div className="ofa-fiat-sub">
                                <span className="ofa-fiat-val">
                                    {tokenIn === 'cirBTC'
                                        ? (quote ? `$${parseFloat(quote.amountOut).toFixed(2)}` : '$0.00')
                                        : tokenIn === 'USDC'
                                            ? `$${parseFloat(amount || 0).toFixed(2)}`
                                            : tokenIn === 'EURC'
                                                ? `$${(parseFloat(amount || 0) * 1.08).toFixed(2)}`
                                                : '$0.00'
                                    }
                                </span>
                            </div>
                        </div>

                        <div className="ofa-selector-group" ref={tokenInDropdownRef}>
                            <button className={`ofa-token-selector-btn ${tokenIn === 'cirBTC' ? 'ofa-token-selector-btn-cirbtc' : ''}`} onClick={() => setIsTokenInDropdownOpen(!isTokenInDropdownOpen)}>
                                <div className={`ofa-token-icon-wrap ${tokenIn === 'cirBTC' ? 'ofa-cirbtc-wrap' : ''}`}>
                                    <img src={tokenInInfo.icon} alt={tokenIn} className={`ofa-token-icon ${tokenIn === 'cirBTC' ? 'ofa-cirbtc-icon' : ''}`} />
                                    <img src="/icons/Arc.png" alt="" className={`ofa-chain-badge ${tokenIn === 'cirBTC' ? 'ofa-chain-badge-cirbtc' : ''}`} />
                                </div>
                                <div className="ofa-token-selector-info">
                                    <span className="ofa-token-sym">{tokenIn}</span>
                                    <span className="ofa-chain-name-sub">Arc</span>
                                </div>
                                <ChevronRight size={18} className={isTokenInDropdownOpen ? 'ofa-rotate-90' : ''} />
                            </button>

                            {isTokenInDropdownOpen && (
                                <div className="ofa-token-dropdown">
                                    {Object.keys(TOKEN_INFO).filter(sym => sym !== 'ETH').map((sym) => (
                                        <div
                                            key={sym}
                                            className={`ofa-dropdown-item ${tokenIn === sym ? 'active' : ''}`}
                                            onClick={() => handleTokenChange('in', sym)}
                                        >
                                            <div className="ofa-dropdown-icon">
                                                <img src={TOKEN_INFO[sym].icon} alt={sym} className={sym === 'cirBTC' ? 'ofa-cirbtc-icon' : ''} />
                                            </div>
                                            <div className="ofa-dropdown-text">
                                                <span className="ofa-dropdown-label">{TOKEN_INFO[sym].symbol}</span>
                                                <span className="ofa-dropdown-sub">{TOKEN_INFO[sym].name}</span>
                                            </div>
                                            {tokenIn === sym && <span className="ofa-dropdown-check">✓</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="ofa-card-footer">
                        <div className="ofa-balance-info">
                            <span className="ofa-balance-label">Balance: {sourceBalanceFormatted}</span>
                        </div>
                        <div className="ofa-pct-buttons">
                            <button onClick={() => handlePercentageClick(20)}>20%</button>
                            <button onClick={() => handlePercentageClick(50)}>50%</button>
                            <button onClick={() => handlePercentageClick(100)}>MAX</button>
                        </div>
                    </div>
                </div>

                <div className="ofa-relay-connector ofa-arrow-wrap">
                    <button
                        className="ofa-swap-btn-icon"
                        onClick={handleToggle}
                        disabled={isSwapping}
                    >
                        <ArrowUpDown size={16} />
                    </button>
                </div>

                <div className="ofa-card-relay ofa-card-wrap ofa-receive-card" id="ofa-receive-card">
                    <div className="ofa-label-row">
                        <span className="ofa-relay-card-label">Receive</span>

                        <div className="ofa-dropdown-anchor" ref={dropdownRef}>
                            <div
                                className={`ofa-user-chain-info ${isCustomRecipient ? 'ofa-recipient-pill-yellow' : ''}`}
                                onClick={() => setIsRecipientDropdownOpen(!isRecipientDropdownOpen)}
                            >
                                <div className="ofa-recipient-icon-wrap" style={{ display: 'flex', alignItems: 'center' }}>
                                    {isCustomRecipient ? (
                                        <ScrollText size={14} className="ofa-color-yellow" />
                                    ) : (
                                        connector?.icon ? (
                                            <img src={connector.icon} alt={connector.name} className="ofa-mini-chain-logo" />
                                        ) : (
                                            <Wallet size={14} className={isCustomRecipient ? '' : 'ofa-color-vanilla'} />
                                        )
                                    )}
                                </div>
                                <span className={`ofa-user-handle ${isCustomRecipient ? 'ofa-color-yellow' : ''}`}>
                                    {abbreviateAddress(recipientAddress)}
                                </span>
                                <ChevronDown size={14} className={isCustomRecipient ? 'ofa-color-yellow' : ''} />
                            </div>

                            {isRecipientDropdownOpen && (
                                <div className="ofa-recipient-dropdown">
                                    <div
                                        className={`ofa-dropdown-item ${!isCustomRecipient ? 'active' : ''}`}
                                        onClick={() => {
                                            setRecipientAddress(address);
                                            setIsRecipientDropdownOpen(false);
                                        }}
                                    >
                                        <div className="ofa-dropdown-icon">
                                            {connector?.icon ? (
                                                <img src={connector.icon} alt="" />
                                            ) : (
                                                <Wallet size={16} />
                                            )}
                                        </div>
                                        <div className="ofa-dropdown-text">
                                            <span className="ofa-dropdown-label">{abbreviateAddress(address)}</span>
                                            <span className="ofa-dropdown-sub">Connected Wallet</span>
                                        </div>
                                        {!isCustomRecipient && <span className="ofa-dropdown-check">✓</span>}
                                    </div>

                                    <div className="ofa-dropdown-divider" />

                                    <div
                                        className="ofa-dropdown-item"
                                        onClick={() => {
                                            setIsReceiveModalOpen(true);
                                            setIsRecipientDropdownOpen(false);
                                        }}
                                    >
                                        <div className="ofa-dropdown-icon">
                                            <ScrollText size={16} />
                                        </div>
                                        <div className="ofa-dropdown-text">
                                            <span className="ofa-dropdown-label">
                                                {isCustomRecipient ? 'Change address' : 'Paste wallet address'}
                                            </span>
                                            <span className="ofa-dropdown-sub">Send to other address</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="ofa-relay-input-row">
                        <div className="ofa-input-group">
                            <div className="ofa-amount-input" style={{ height: '32px', display: 'flex', alignItems: 'center' }}>
                                {isFetchingQuote ? (
                                    <span className="ofa-animate-pulse" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '18px' }}>...</span>
                                ) : quoteError && amount ? (
                                    <span style={{ fontSize: '12px', color: 'rgba(251,191,36,0.8)', fontWeight: 500 }}>{quoteError}</span>
                                ) : (
                                    <>{amount ? (quote ? quote.amountOut : '...') : '0.0000'}</>
                                )}
                            </div>
                            <div className="ofa-fiat-sub">
                                {quote && amount ? (
                                    <span className="ofa-fiat-val">
                                        {(() => {
                                            if (!amount || !quote) return '$0.00';
                                            const fiat = tokenOut === 'USDC'
                                                ? parseFloat(quote.amountOut)
                                                : tokenOut === 'EURC'
                                                    ? parseFloat(quote.amountOut) * 1.08
                                                    : parseFloat(amount) * 0.998; // Fallback estimate
                                            return `$${fiat.toFixed(2)}`;
                                        })()}
                                    </span>
                                ) : (
                                    <span className="ofa-fiat-val">$0.00</span>
                                )}
                            </div>
                        </div>

                        <div className="ofa-selector-group" ref={tokenOutDropdownRef}>
                            <button className={`ofa-token-selector-btn ${tokenOut === 'cirBTC' ? 'ofa-token-selector-btn-cirbtc' : ''}`} onClick={() => setIsTokenOutDropdownOpen(!isTokenOutDropdownOpen)}>
                                <div className={`ofa-token-icon-wrap ${tokenOut === 'cirBTC' ? 'ofa-cirbtc-wrap' : ''}`}>
                                    <img src={tokenOutInfo.icon} alt={tokenOut} className={`ofa-token-icon ${tokenOut === 'cirBTC' ? 'ofa-cirbtc-icon' : ''}`} />
                                    <img src="/icons/Arc.png" alt="" className={`ofa-chain-badge ${tokenOut === 'cirBTC' ? 'ofa-chain-badge-cirbtc' : ''}`} />
                                </div>
                                <div className="ofa-token-selector-info">
                                    <span className="ofa-token-sym">{tokenOut}</span>
                                    <span className="ofa-chain-name-sub">Arc</span>
                                </div>
                                <ChevronRight size={18} className={isTokenOutDropdownOpen ? 'ofa-rotate-90' : ''} />
                            </button>

                            {isTokenOutDropdownOpen && (
                                <div className="ofa-token-dropdown">
                                    {Object.keys(TOKEN_INFO).filter(sym => sym !== 'ETH').map((sym) => (
                                        <div
                                            key={sym}
                                            className={`ofa-dropdown-item ${tokenOut === sym ? 'active' : ''}`}
                                            onClick={() => handleTokenChange('out', sym)}
                                        >
                                            <div className="ofa-dropdown-icon">
                                                <img src={TOKEN_INFO[sym].icon} alt={sym} className={sym === 'cirBTC' ? 'ofa-cirbtc-icon' : ''} />
                                            </div>
                                            <div className="ofa-dropdown-text">
                                                <span className="ofa-dropdown-label">{TOKEN_INFO[sym].symbol}</span>
                                                <span className="ofa-dropdown-sub">{TOKEN_INFO[sym].name}</span>
                                            </div>
                                            {tokenOut === sym && <span className="ofa-dropdown-check">✓</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="ofa-card-footer">
                        <div className="ofa-balance-info">
                            <span className="ofa-balance-label">Balance: {destBalanceFormatted}</span>
                        </div>
                    </div>
                </div>

                <div className="ofa-card-relay ofa-info-wrap ofa-fee-card" id="ofa-fee-card">
                    <div className="ofa-info-row">
                        <span className="ofa-info-label">Swap Fee</span>
                        <span className="ofa-val" style={{ fontWeight: 700, fontSize: '13px' }}>
                            0.2%
                            <span style={{ fontSize: '11px', opacity: 0.6, marginLeft: '6px' }}>
                                {(() => {
                                    const rawFee = parseFloat(amount || 0) * SWAP_FEE_PERCENTAGE;
                                    // For BTC/low amounts, we need more decimals
                                    const feeDisplay = rawFee < 0.01 && rawFee > 0 ? rawFee.toFixed(4) : rawFee.toFixed(2);
                                    return `($${feeDisplay})`;
                                })()}
                            </span>
                        </span>
                    </div>

                    <div className="ofa-info-divider" />

                    <div className="ofa-info-sub-row">
                        <span className="ofa-exchange-rate-text">
                            {quote
                                ? `1 ${tokenIn} = ${quote.rate} ${tokenOut}`
                                : `1 ${tokenIn} = ... ${tokenOut}`
                            }
                        </span>

                        {/* Slippage Settings Container */}
                        <div className="ofa-slippage-settings">
                            {!isSlippageOpen ? (
                                <div className="ofa-settings-trigger" onClick={() => setIsSlippageOpen(true)}>
                                    <Settings size={12} />
                                    <span className="ofa-slippage-val">{slippage}% Slippage</span>
                                </div>
                            ) : (
                                <div className={`ofa-slippage-menu ${isSlippageOpen ? 'open' : ''}`}>
                                    {!isEditingSlippage ? (
                                        <>
                                            {[0.1, 1.0, 5.0].map(val => (
                                                <div
                                                    key={val}
                                                    className={`ofa-slippage-preset ${slippage === val ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setSlippage(val);
                                                        setIsSlippageOpen(false);
                                                    }}
                                                >
                                                    {val}%
                                                </div>
                                            ))}
                                            <button className="ofa-pen-btn" onClick={() => setIsEditingSlippage(true)}>
                                                <Pen size={12} />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="ofa-custom-slippage-wrap">
                                            <input
                                                className="ofa-custom-slippage-input"
                                                type="number"
                                                value={customSlippageValue}
                                                onChange={e => setCustomSlippageValue(e.target.value)}
                                                autoFocus
                                            />
                                            <span style={{ fontSize: '10px', color: 'inherit' }}>%</span>
                                            <button
                                                className="ofa-check-btn"
                                                onClick={() => {
                                                    const val = parseFloat(customSlippageValue);
                                                    if (!isNaN(val)) setSlippage(val);
                                                    setIsEditingSlippage(false);
                                                    setIsSlippageOpen(false);
                                                }}
                                            >
                                                <Check size={12} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Status messages removed in favor of OfaModal */}

                {/* ACTION BUTTON */}
                <div className="ofa-action-wrap">
                    <button
                        className={`ofa-action-btn ${canSwap ? 'active' : ''}`}
                        onClick={handleSwap}
                        disabled={!isConnected ? false : !canSwap || !!quoteError}
                    >
                        {btnLabel}
                    </button>
                </div>

            </div>

            <OfaReceive
                isOpen={isReceiveModalOpen}
                initialValue={isCustomRecipient ? recipientAddress : ''}
                onClose={() => setIsReceiveModalOpen(false)}
                onConfirm={(addr) => setRecipientAddress(addr)}
            />

            <OfaModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onRetry={handleSwap}
                step={modalStep}
                fromAmount={lastTx?.amountIn ?? amount ?? '0'}
                fromToken={tokenInInfo}
                toAmount={lastTx?.amountOut ?? modalStats?.toAmount ?? '--'}
                toToken={tokenOutInfo}
                txHash={lastTx?.txHash}
                explorerUrl={lastTx?.explorerUrl}
                recipientAddress={recipientAddress}
                error={modalError}
                stats={modalStats}
            />
        </div>
    );
}

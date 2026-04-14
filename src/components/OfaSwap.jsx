import { useState, useCallback } from 'react';
import { ArrowUpDown, Zap, ExternalLink } from 'lucide-react';
import { useAccount, useBalance } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { appKitSwapEurc, appKitSwapToEurc } from '../services/appKitSwapService';
import { USDC_ADDRESSES, EURC_ADDRESSES, TOKEN_INFO } from '../config/contracts';
import './OfaSwap.css';

// Arc Testnet chain ID
const ARC_CHAIN_ID = 5042002;

export default function OfaSwap() {
    const { address, isConnected, connector } = useAccount();
    const { openConnectModal } = useConnectModal();

    const [direction, setDirection] = useState('eurc_to_usdc'); // 'eurc_to_usdc' | 'usdc_to_eurc'
    const [amount, setAmount] = useState('');
    const [isSwapping, setIsSwapping] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [statusType, setStatusType] = useState(''); // '' | 'success' | 'error'
    const [lastTx, setLastTx] = useState(null);

    const tokenIn  = direction === 'eurc_to_usdc' ? 'EURC' : 'USDC';
    const tokenOut = direction === 'eurc_to_usdc' ? 'USDC' : 'EURC';
    const tokenInInfo  = TOKEN_INFO[tokenIn];
    const tokenOutInfo = TOKEN_INFO[tokenOut];

    // USDC balance on Arc Testnet
    const { data: usdcData } = useBalance({
        address,
        token: USDC_ADDRESSES.Arc_Testnet,
        chainId: ARC_CHAIN_ID,
        watch: true,
    });

    // EURC balance on Arc Testnet
    const { data: eurcData } = useBalance({
        address,
        token: EURC_ADDRESSES.Arc_Testnet,
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
    const sourceBalance = direction === 'eurc_to_usdc' ? eurcBalance : usdcBalance;

    const handleToggle = () => {
        setDirection(prev => prev === 'eurc_to_usdc' ? 'usdc_to_eurc' : 'eurc_to_usdc');
        setAmount('');
        setStatusMsg('');
        setStatusType('');
    };

    const handleMax = () => setAmount(
        direction === 'eurc_to_usdc' ? eurcData?.formatted || '0' : usdcData?.formatted || '0'
    );

    const handleSwap = useCallback(async () => {
        if (!isConnected) { openConnectModal?.(); return; }
        if (!amount || parseFloat(amount) <= 0) return;

        setIsSwapping(true);
        setStatusMsg('');
        setStatusType('');
        setLastTx(null);

        try {
            const fn = direction === 'eurc_to_usdc' ? appKitSwapEurc : appKitSwapToEurc;
            const result = await fn(
                amount,
                connector,
                ({ message }) => setStatusMsg(message)
            );
            setLastTx(result);
            setStatusMsg(`✓ Received ${result.amountOut} ${tokenOut}`);
            setStatusType('success');
            setAmount('');
        } catch (err) {
            setStatusMsg(err.message || 'Swap failed');
            setStatusType('error');
        } finally {
            setIsSwapping(false);
        }
    }, [isConnected, amount, direction, connector, openConnectModal, tokenOut]);

    const kitKeyMissing = !import.meta.env.VITE_CIRCLE_KIT_KEY ||
        import.meta.env.VITE_CIRCLE_KIT_KEY === 'your_kit_key_here';

    const btnLabel = !isConnected
        ? 'Connect Wallet'
        : isSwapping
            ? `Swapping ${tokenIn} → ${tokenOut}…`
            : `Swap ${amount || '0'} ${tokenIn} → ${tokenOut}`;

    const btnDisabled = isSwapping || kitKeyMissing || (!isConnected ? false : !amount || parseFloat(amount) <= 0);

    return (
        <div className="ofa-swap-page">
            <div className="ofa-swap-card">
                {/* Header */}
                <div className="ofa-swap-header">
                    <div className="ofa-swap-title-row">
                        <div className="ofa-swap-icon-pair">
                            <img src="/icons/euro.png" alt="EURC" className="ofa-swap-token-icon" />
                            <img src="/icons/usdc.png"  alt="USDC" className="ofa-swap-token-icon overlap" />
                        </div>
                        <div>
                            <h2 className="ofa-swap-title">EURC ↔ USDC</h2>
                            <p className="ofa-swap-sub">Same-chain swap on Arc Testnet</p>
                        </div>
                    </div>
                    <div className="ofa-swap-badge">
                        <img src="/icons/Arc.png" alt="Arc" className="ofa-swap-badge-icon" />
                        <span>Arc Testnet</span>
                    </div>
                </div>

                {/* Kit key warning */}
                {kitKeyMissing && (
                    <div className="ofa-swap-warning">
                        ⚠️ Circle Kit Key not configured. Add <code>VITE_CIRCLE_KIT_KEY</code> to your .env file.
                    </div>
                )}

                {/* Balances row */}
                <div className="ofa-swap-balances">
                    <div className="ofa-bal-item">
                        <img src="/icons/euro.png" alt="EURC" className="ofa-bal-icon" />
                        <span className="ofa-bal-label">EURC</span>
                        <span className="ofa-bal-val">{isConnected ? eurcBalance : '—'}</span>
                    </div>
                    <div className="ofa-bal-divider" />
                    <div className="ofa-bal-item">
                        <img src="/icons/usdc.png" alt="USDC" className="ofa-bal-icon" />
                        <span className="ofa-bal-label">USDC</span>
                        <span className="ofa-bal-val">{isConnected ? usdcBalance : '—'}</span>
                    </div>
                </div>

                {/* Swap input section */}
                <div className="ofa-swap-body">

                    {/* FROM token */}
                    <div className="ofa-swap-input-card">
                        <div className="ofa-swap-input-label">
                            <span>You pay</span>
                            <span className="ofa-swap-bal-hint">
                                Balance: {isConnected ? sourceBalance : '—'}
                                <button className="ofa-swap-max-btn" onClick={handleMax}>MAX</button>
                            </span>
                        </div>
                        <div className="ofa-swap-input-row">
                            <input
                                className="ofa-swap-amount-input"
                                type="number"
                                placeholder="0.00"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                disabled={isSwapping}
                                min="0"
                            />
                            <div className="ofa-swap-token-pill">
                                <img src={tokenInInfo.icon} alt={tokenIn} className="ofa-pill-icon" />
                                <span>{tokenIn}</span>
                            </div>
                        </div>
                    </div>

                    {/* Direction toggle */}
                    <div className="ofa-swap-arrow-row">
                        <button
                            className="ofa-swap-direction-btn"
                            onClick={handleToggle}
                            disabled={isSwapping}
                            title="Reverse direction"
                        >
                            <ArrowUpDown size={16} />
                        </button>
                    </div>

                    {/* TO token */}
                    <div className="ofa-swap-input-card ofa-swap-output-card">
                        <div className="ofa-swap-input-label">
                            <span>You receive <span className="ofa-swap-approx">(approx.)</span></span>
                        </div>
                        <div className="ofa-swap-input-row">
                            <span className="ofa-swap-amount-display">
                                {amount && parseFloat(amount) > 0
                                    ? (parseFloat(amount) * 0.999).toFixed(4)
                                    : '0.00'}
                            </span>
                            <div className="ofa-swap-token-pill">
                                <img src={tokenOutInfo.icon} alt={tokenOut} className="ofa-pill-icon" />
                                <span>{tokenOut}</span>
                            </div>
                        </div>
                    </div>

                    {/* Fee note */}
                    <div className="ofa-swap-fee-note">
                        <Zap size={12} />
                        <span>~0.1% swap fee • Powered by Circle App Kit</span>
                    </div>
                </div>

                {/* Status message */}
                {statusMsg && (
                    <div className={`ofa-swap-status ${statusType}`}>
                        <span>{statusMsg}</span>
                        {lastTx?.explorerUrl && (
                            <a
                                href={lastTx.explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ofa-swap-tx-link"
                            >
                                View <ExternalLink size={12} />
                            </a>
                        )}
                    </div>
                )}

                {/* Swap button */}
                <button
                    className="ofa-swap-btn"
                    onClick={handleSwap}
                    disabled={btnDisabled}
                >
                    {btnLabel}
                </button>
            </div>
        </div>
    );
}

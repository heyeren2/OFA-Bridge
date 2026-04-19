import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowUpDown, Zap, ExternalLink, ChevronDown, ChevronRight, ScrollText, User, Wallet } from 'lucide-react';
import { useAccount, useBalance } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { appKitSwapEurc, appKitSwapToEurc } from '../services/appKitSwapService';
import { USDC_ADDRESSES, EURC_ADDRESSES, TOKEN_INFO } from '../config/contracts';
import OfaReceive from './OfaReceive';
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

    // Dynamic Recipient Logic
    const [recipientAddress, setRecipientAddress] = useState('');
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [isRecipientDropdownOpen, setIsRecipientDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const isCustomRecipient = isConnected && address && recipientAddress &&
        recipientAddress.toLowerCase() !== address.toLowerCase();

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsRecipientDropdownOpen(false);
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

    const abbreviateAddress = (addr) => {
        if (!addr) return 'Connect Wallet';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    const tokenIn = direction === 'eurc_to_usdc' ? 'EURC' : 'USDC';
    const tokenOut = direction === 'eurc_to_usdc' ? 'USDC' : 'EURC';
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

    const fmt = (data) => {
        if (!data) return '0.00';
        const [int, frac] = data.formatted.split('.');
        return `${int}.${(frac || '00').padEnd(2, '0').slice(0, 2)}`;
    };

    const usdcBalance = fmt(usdcData);
    const eurcBalance = fmt(eurcData);
    const sourceBalanceFormatted = direction === 'eurc_to_usdc' ? eurcBalance : usdcBalance;
    const destBalanceFormatted = direction === 'eurc_to_usdc' ? usdcBalance : eurcBalance;

    const handleToggle = () => {
        setDirection(prev => prev === 'eurc_to_usdc' ? 'usdc_to_eurc' : 'eurc_to_usdc');
        setAmount('');
        setStatusMsg('');
        setStatusType('');
    };

    const handlePercentageClick = (pct) => {
        const balanceObj = direction === 'eurc_to_usdc' ? eurcData : usdcData;
        if (!balanceObj) return;
        const fullAmount = parseFloat(balanceObj.formatted);
        if (pct === 100) {
            setAmount(balanceObj.formatted);
        } else {
            setAmount(((fullAmount * pct) / 100).toFixed(6));
        }
    };

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
            ? `Swapping...`
            : `Swap ${tokenIn}`;

    const canSwap = isConnected && amount && parseFloat(amount) > 0 && !isSwapping && !kitKeyMissing;

    return (
        <div className="ofa-swap-page">

            {/* 1. SLIM BALANCE CARD (Top Hero) - MOVED OUTSIDE FOR 15PX GAP */}
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
                </div>
            </div>

            <div className="ofa-swap-card-container">

                {/* 2. YOU PAY CARD - Unbundled and unique id/class */}
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
                                <span className="ofa-fiat-val">${(parseFloat(amount || 0) * 1).toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="ofa-selector-group">
                            <button className="ofa-token-selector-btn">
                                <div className="ofa-token-icon-wrap">
                                    <img src={tokenInInfo.icon} alt={tokenIn} className="ofa-token-icon" />
                                    <img src="/icons/Arc.png" alt="" className="ofa-chain-badge" />
                                </div>
                                <div className="ofa-token-selector-info">
                                    <span className="ofa-token-sym">{tokenIn}</span>
                                    <span className="ofa-chain-name-sub">Arc</span>
                                </div>
                                <ChevronRight size={18} />
                            </button>
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

                {/* SWAP ARROW */}
                <div className="ofa-relay-connector ofa-arrow-wrap">
                    <button
                        className="ofa-swap-btn-icon"
                        onClick={handleToggle}
                        disabled={isSwapping}
                    >
                        <ArrowUpDown size={16} />
                    </button>
                </div>

                {/* 3. YOU RECEIVE CARD - Unbundled and unique id/class */}
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
                                    {/* Own Wallet Option */}
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

                                    {/* Custom Address Option */}
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
                            <span className="ofa-amount-display">
                                {amount && parseFloat(amount) > 0
                                    ? (parseFloat(amount) * 0.999).toFixed(4)
                                    : '0.00'}
                            </span>
                            <div className="ofa-fiat-sub">
                                <span className="ofa-fiat-val">${(parseFloat(amount || 0) * 0.999).toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="ofa-selector-group">
                            <button className="ofa-token-selector-btn">
                                <div className="ofa-token-icon-wrap">
                                    <img src={tokenOutInfo.icon} alt={tokenOut} className="ofa-token-icon" />
                                    <img src="/icons/Arc.png" alt="" className="ofa-chain-badge" />
                                </div>
                                <div className="ofa-token-selector-info">
                                    <span className="ofa-token-sym">{tokenOut}</span>
                                    <span className="ofa-chain-name-sub">Arc</span>
                                </div>
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="ofa-card-footer">
                        <div className="ofa-balance-info">
                            <span className="ofa-balance-label">Balance: {destBalanceFormatted}</span>
                        </div>
                    </div>
                </div>

                {/* 4. INFO CARD (Swap Fee) - Unbundled and unique id/class */}
                <div className="ofa-card-relay ofa-info-wrap ofa-fee-card" id="ofa-fee-card">
                    <div className="ofa-info-row">
                        <span className="ofa-info-label">Swap Fee</span>
                        <span className="ofa-val" style={{ fontWeight: 700, fontSize: '13px' }}>~0.1%</span>
                    </div>
                    <div className="ofa-info-row">
                        <span className="ofa-info-label">Route</span>
                        <span className="ofa-val" style={{ fontWeight: 700, fontSize: '13px' }}>Arc Direct</span>
                    </div>
                </div>

                {/* STATUS MESSAGES */}
                {kitKeyMissing && (
                    <div className="ofa-status-msg error">
                        ⚠️ Config Error: Circle Kit Key is missing
                    </div>
                )}

                {statusMsg && (
                    <div className={`ofa-status-msg ${statusType}`}>
                        <span>{statusMsg}</span>
                        {lastTx?.explorerUrl && (
                            <a href={lastTx.explorerUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px', color: 'inherit' }}>
                                <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                            </a>
                        )}
                    </div>
                )}

                {/* ACTION BUTTON */}
                <div className="ofa-action-wrap">
                    <button
                        className={`ofa-action-btn ${canSwap ? 'active' : ''}`}
                        onClick={handleSwap}
                        disabled={!isConnected ? false : !canSwap}
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
        </div>
    );
}

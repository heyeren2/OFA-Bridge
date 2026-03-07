import React from 'react';
import { X, ArrowRight, Loader } from 'lucide-react';
import { getChainByName } from '../config/chains';

export const RemintModal = ({ isOpen, onClose, onConfirm, tx, isMinting }) => {
    if (!isOpen || !tx) return null;

    const fromChain = getChainByName(tx.fromChain);
    const toChain = getChainByName(tx.toChain);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content remint-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>
                    <X size={20} />
                </button>

                {/* Helper to show 2 decimal truncated amount */}
                {(() => {
                    const formatAmount = (val) => {
                        if (!val || isNaN(parseFloat(val))) return '0.00';
                        const [int, frac] = val.toString().split('.');
                        return `${int}.${(frac || '00').padEnd(2, '0').slice(0, 2)}`;
                    };
                    tx.amountFormatted = formatAmount(tx.amountDisplay);
                    return null;
                })()}

                <h3 className="modal-title">Complete Bridge</h3>
                <p className="modal-subtitle">Your funds are burned on the source chain. Use this to mint them on the destination.</p>

                <div className="remint-route">
                    <div className="chain-info">
                        <img src={fromChain?.icon} alt={tx.fromChain} className="chain-icon-lg" />
                        <span>{tx.fromChain}</span>
                    </div>
                    <ArrowRight className="route-arrow" />
                    <div className="chain-info">
                        <img src={toChain?.icon} alt={tx.toChain} className="chain-icon-lg" />
                        <span>{tx.toChain}</span>
                    </div>
                </div>

                <div className="remint-details">
                    <div className="detail-row">
                        <span>Amount</span>
                        <span className="value">{tx.amountFormatted} USDC</span>
                    </div>
                    <div className="detail-row">
                        <span>Transaction Hash</span>
                        <span className="value hash">{tx.sourceTxHash.slice(0, 6)}...{tx.sourceTxHash.slice(-4)}</span>
                    </div>
                </div>

                <div className="modal-actions">
                    <button
                        className="bridge-btn primary"
                        disabled={isMinting}
                        onClick={() => onConfirm(tx)}
                    >
                        {isMinting ? (
                            <>
                                <Loader className="spin" size={18} />
                                <span>Minting...</span>
                            </>
                        ) : (
                            'Mint Now'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

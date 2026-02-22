import { ARC_CHAIN, getChainByName } from '../config/chains';

export default function ChainSelector({ value, onOpen, direction, disabled, showArrow = true }) {
    const chainConfig = direction === 'TO_ARC'
        ? getChainByName(value)
        : ARC_CHAIN;

    return (
        <div className="chain-selector-wrapper">
            <button
                className={`chain-selector-trigger ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && onOpen()}
                disabled={disabled}
            >
                <span className="chain-icon">
                    {chainConfig?.icon && <img src={chainConfig.icon} alt={chainConfig.name} />}
                </span>
                <span className="chain-name">{chainConfig?.name}</span>
                {showArrow && !disabled && <span className="chain-arrow">▾</span>}
            </button>
        </div>
    );
}

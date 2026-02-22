import { TOKEN_INFO } from '../config/contracts';

export default function TokenSelector({ value, onOpen, disabled, showArrow = true }) {
    const token = TOKEN_INFO[value] || TOKEN_INFO.USDC;

    return (
        <div className="token-selector-wrapper">
            <button
                className={`token-selector-trigger ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && onOpen()}
                disabled={disabled}
            >
                <span className="token-icon">
                    <img src={token.icon} alt={token.symbol} />
                </span>
                <span className="token-symbol">{token.symbol}</span>
                {showArrow && !disabled && <span className="token-arrow">▾</span>}
            </button>
        </div>
    );
}

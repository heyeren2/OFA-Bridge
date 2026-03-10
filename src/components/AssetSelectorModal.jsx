import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SUPPORTED_CHAINS, ARC_CHAIN } from '../config/chains';
import { TOKEN_INFO, USDC_ADDRESSES } from '../config/contracts';

export default function AssetSelectorModal({ isOpen, onClose, onSelect, currentChain, currentToken, mode = 'chain' }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeChainId, setActiveChainId] = useState(currentChain || null); // null means "All Chains"
    const [mobileSubView, setMobileSubView] = useState('tokens'); // 'tokens' or 'chains'
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const starredChains = useMemo(() => {
        const starredNames = ['Arc Testnet', 'Ethereum Sepolia', 'Avalanche Fuji', 'Base Sepolia', 'Optimism Sepolia'];
        return starredNames
            .map(name => SUPPORTED_CHAINS.find(c => c.name === name))
            .filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, []);

    const alphabeticalChains = useMemo(() => {
        return [...SUPPORTED_CHAINS].sort((a, b) => a.name.localeCompare(b.name));
    }, []);

    const getShortenedChainName = (name) => {
        if (name.includes('Ethereum Sepolia')) return 'Sepolia';
        if (name.includes('Arc Testnet')) return 'Arc';
        if (name.includes('Base Sepolia')) return 'Base';
        if (name.includes('Optimism Sepolia')) return 'Optimism';
        if (name.includes('Arbitrum Sepolia')) return 'Arbitrum';
        if (name.includes('HyperEVM Testnet')) return 'HyperEVM';
        if (name.includes('Ink Testnet')) return 'Ink';
        if (name.includes('Soneium Minato')) return 'Soneium';
        if (name.includes('Berachain Artio')) return 'Berachain';
        if (name.includes('Avalanche Fuji')) return 'Avalanche';
        return name.replace(' Testnet', '').replace(' Sepolia', '').replace(' Fuji', '');
    };

    const tokensToDisplay = useMemo(() => {
        let results = [];

        if (!activeChainId) {
            // "All Chains" mode: Show tokens across all supported chains
            SUPPORTED_CHAINS.forEach(chain => {
                chain.tokens.forEach(symbol => {
                    const info = TOKEN_INFO[symbol];
                    if (info) {
                        results.push({
                            ...info,
                            chain: chain.name,
                            chainIcon: chain.icon,
                            bridgeKitName: chain.bridgeKitName
                        });
                    }
                });
            });
        } else {
            // Specific Chain mode
            const chain = SUPPORTED_CHAINS.find(c => c.name === activeChainId) || (activeChainId === ARC_CHAIN.name ? ARC_CHAIN : null);
            if (chain && chain.tokens) {
                chain.tokens.forEach(symbol => {
                    const info = TOKEN_INFO[symbol];
                    if (info) {
                        results.push({
                            ...info,
                            chain: chain.name,
                            chainIcon: chain.icon,
                            bridgeKitName: chain.bridgeKitName
                        });
                    }
                });
            }
        }

        if (!searchQuery) return results;

        const lowQuery = searchQuery.toLowerCase();
        return results.filter(t =>
            t.symbol.toLowerCase().includes(lowQuery) ||
            t.name.toLowerCase().includes(lowQuery) ||
            t.chain.toLowerCase().includes(lowQuery)
        );
    }, [activeChainId, searchQuery]);

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="asset-selector-modal" onClick={e => e.stopPropagation()}>
                <header className="modal-header">
                    {isMobile && mobileSubView === 'chains' && (
                        <button className="back-btn" onClick={() => setMobileSubView('tokens')}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}
                    {isMobile && mobileSubView === 'tokens' && (
                        <button className="back-btn" onClick={onClose}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}
                    <h3>
                        {isMobile
                            ? (mobileSubView === 'tokens' ? 'Bridge from' : 'Select chain')
                            : `Select ${mode === 'chain' ? 'Chain' : 'Token'}`
                        }
                    </h3>
                    {!isMobile && <button className="close-btn" onClick={onClose}>&times;</button>}
                </header>

                <div className="modal-layout">
                    {/* Mobile View: Chain Grid */}
                    {isMobile && mobileSubView === 'tokens' && (
                        <div className="mobile-chain-grid">
                            <button
                                className={`grid-item ${activeChainId === null ? 'active' : ''}`}
                                onClick={() => setActiveChainId(null)}
                            >
                                <div className="all-chains-icon-grid">
                                    <img src="/icons/Arc.png" alt="" />
                                    <img src="/icons/Base.png" alt="" />
                                    <img src="/icons/ethereum.png" alt="" />
                                    <img src="/icons/optimism.png" alt="" />
                                </div>
                            </button>
                            {SUPPORTED_CHAINS.slice(0, 7).map(chain => (
                                <button
                                    key={chain.name}
                                    className={`grid-item ${activeChainId === chain.name ? 'active' : ''}`}
                                    onClick={() => setActiveChainId(chain.name)}
                                >
                                    <img src={chain.icon} alt={chain.name} />
                                </button>
                            ))}
                            <button className="grid-item more-chains" onClick={() => setMobileSubView('chains')}>
                                +{SUPPORTED_CHAINS.length - 7}
                            </button>
                        </div>
                    )}

                    {/* Left Sidebar: Chains */}
                    {(!isMobile || mobileSubView === 'chains') && (
                        <aside className="modal-sidebar">
                            <div className="search-container">
                                <div className="search-input-wrapper">
                                    <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8"></circle>
                                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder={isMobile ? "Search network" : "Search chains"}
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="sidebar-scrollable">
                                <div className="sidebar-section">
                                    <button
                                        className={`sidebar-item ${activeChainId === null ? 'active' : ''}`}
                                        onClick={() => {
                                            setActiveChainId(null);
                                            if (isMobile) setMobileSubView('tokens');
                                        }}
                                    >
                                        <div className="all-chains-icon-grid">
                                            <img src="/icons/Arc.png" alt="" />
                                            <img src="/icons/Base.png" alt="" />
                                            <img src="/icons/ethereum.png" alt="" />
                                            <img src="/icons/optimism.png" alt="" />
                                        </div>
                                        All Chains
                                    </button>
                                </div>

                                {!isMobile && (
                                    <div className="sidebar-section">
                                        <label>Starred Chains</label>
                                        {starredChains.map(chain => (
                                            <button
                                                key={chain.name}
                                                className={`sidebar-item ${activeChainId === chain.name ? 'active' : ''}`}
                                                onClick={() => {
                                                    setActiveChainId(chain.name);
                                                    if (mode === 'chain') {
                                                        onSelect(chain.name, 'USDC');
                                                    }
                                                }}
                                            >
                                                <img src={chain.icon} alt={chain.name} className="sidebar-icon" />
                                                <span className="chain-name-text">{chain.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="sidebar-section">
                                    {!isMobile && <label>Chains A-Z</label>}
                                    {alphabeticalChains.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map(chain => (
                                        <button
                                            key={chain.name}
                                            className={`sidebar-item ${activeChainId === chain.name ? 'active' : ''}`}
                                            onClick={() => {
                                                setActiveChainId(chain.name);
                                                if (isMobile) setMobileSubView('tokens');
                                                if (mode === 'chain') {
                                                    onSelect(chain.name, 'USDC');
                                                }
                                            }}
                                        >
                                            <img src={chain.icon} alt={chain.name} className="sidebar-icon" />
                                            <span className="chain-name-text">{chain.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </aside>
                    )}

                    {/* Right Content: Tokens */}
                    {(!isMobile || mobileSubView === 'tokens') && (
                        <main className="modal-content">
                            {isMobile && (
                                <div className="search-container">
                                    <div className="search-input-wrapper">
                                        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="11" cy="11" r="8"></circle>
                                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                        </svg>
                                        <input
                                            type="text"
                                            placeholder="Search by token or address"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                            <div className="content-header">
                                {!activeChainId && !isMobile && <div className="volume-label">All Chain Tokens</div>}
                            </div>
                            <div className="token-list">
                                {tokensToDisplay.map((token, idx) => (
                                    <button
                                        key={`${token.chain}-${token.symbol}-${idx}`}
                                        className="token-item"
                                        onClick={() => onSelect(token.chain, token.symbol)}
                                    >
                                        <div className="token-info-main">
                                            <div className="token-icon-col">
                                                <div className="token-icon-wrapper">
                                                    <img src={token.icon} alt={token.symbol} className="token-icon" />
                                                    <img src={token.chainIcon} alt={token.chain} className="chain-badge" />
                                                </div>
                                            </div>
                                            <div className="token-symbol-col">
                                                <span className="token-symbol">{token.symbol}</span>
                                                <span className="token-chain-name">{getShortenedChainName(token.chain)}</span>
                                            </div>
                                            <div className="token-address-col">
                                                {token.symbol === 'USDC'
                                                    ? (USDC_ADDRESSES[token.bridgeKitName]?.slice(0, 6) + '...' + USDC_ADDRESSES[token.bridgeKitName]?.slice(-4))
                                                    : 'Native Asset'}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                                {tokensToDisplay.length === 0 && (
                                    <div className="no-results">
                                        <span>🔍</span>
                                        <p>No results found</p>
                                    </div>
                                )}
                            </div>
                        </main>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { useAccount } from 'wagmi';
import { Search, ExternalLink, ArrowRight, ArrowLeft, CheckCircle, XCircle, AlertTriangle, Loader, RefreshCw, Copy, ChevronLeft, ChevronRight, BarChart2, Zap, Wallet } from 'lucide-react';
import { getChainByName, ARC_CHAIN, SUPPORTED_CHAINS } from '../config/chains';
import { TOKEN_INFO } from '../config/contracts';
import { retryMint } from '../services/bridgeService';
import { GET_TRANSACTIONS, GET_VOLUME_STATS, GET_DAILY_VOLUME, getSubgraphClient } from '../services/graphql';
import { RemintModal } from './RemintModal';
import './Activity.css';

const STATUS_CONFIG = {
    processing: { icon: Loader, className: 'status-processing', animate: true, label: 'Processing' },
    minting: { icon: Loader, className: 'status-processing', animate: true, label: 'Minting' },
    completed: { icon: CheckCircle, className: 'status-completed', animate: false, label: 'Success' },
    failed: { icon: XCircle, className: 'status-failed', animate: false, label: 'Failed' },
    mint_failed: { icon: AlertTriangle, className: 'status-mint-failed', animate: false, label: 'Action Needed' },
};

export default function Activity({ setActiveTab }) {
    const { chain, address } = useAccount();
    const [searchAddress, setSearchAddress] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [myTxnFilter, setMyTxnFilter] = useState(false);
    const [timeFilter, setTimeFilter] = useState('24h');
    const [copiedHash, setCopiedHash] = useState(null);
    const [fromChainFilter, setFromChainFilter] = useState('All Chains');
    const [toChainFilter, setToChainFilter] = useState('All Chains');

    // Dynamic Apollo Client based on connected network
    const activeClient = useMemo(() => {
        return getSubgraphClient(chain?.name || 'Ethereum Sepolia');
    }, [chain]);

    // Remint Modal State
    const [isRemintOpen, setIsRemintOpen] = useState(false);
    const [selectedTx, setSelectedTx] = useState(null);
    const [isMinting, setIsMinting] = useState(false);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchAddress);
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchAddress]);

    // Graph Queries
    const { data: txData, loading: txLoading, error: txError, refetch: refetchTx } = useQuery(GET_TRANSACTIONS, {
        client: activeClient,
        variables: {
            first: 100, // Load a bunch to filter in-memory if needed, but pagination handles it
            orderBy: 'timestamp',
            orderDirection: 'desc',
            where: debouncedSearch ? {
                or: [
                    { sender: debouncedSearch },
                    { receiver: debouncedSearch },
                    { sourceTxHash: debouncedSearch },
                    { destTxHash: debouncedSearch }
                ]
            } : undefined
        },
        pollInterval: 10000
    });

    const { data: volumeData, error: volumeError } = useQuery(GET_VOLUME_STATS, { client: activeClient });
    const { data: dailyData } = useQuery(GET_DAILY_VOLUME, { client: activeClient, variables: { first: 30 } });

    // Calculate Volume Stats based on Time Filter
    const stats = useMemo(() => {
        if (!dailyData?.volumeStats) return { volume: 0, count: 0 };

        const now = Math.floor(Date.now() / 1000);
        const daySeconds = 86400;
        let daysToInclude = 1;

        if (timeFilter === 'all') {
            return {
                volume: volumeData?.global?.totalVolumeDisplay || 0,
                count: volumeData?.global?.transactionCount || 0
            };
        }

        if (timeFilter === '7d') daysToInclude = 7;
        if (timeFilter === '30d') daysToInclude = 30;

        const cutoff = now - (daysToInclude * daySeconds);

        return dailyData.volumeStats.reduce((acc, Day) => {
            if (Day.date >= cutoff) {
                acc.volume += parseFloat(Day.totalVolumeDisplay);
                acc.count += parseInt(Day.transactionCount);
            }
            return acc;
        }, { volume: 0, count: 0 });

    }, [timeFilter, dailyData, volumeData]);

    // Filtered Transactions (Chain + Search filters)
    const filteredTxs = useMemo(() => {
        if (!txData?.bridgeTransactions) return [];
        return txData.bridgeTransactions.filter(tx => {
            const matchesFrom = fromChainFilter === 'All Chains' || tx.fromChain === fromChainFilter;
            const matchesTo = toChainFilter === 'All Chains' || tx.toChain === toChainFilter;
            const matchesSearch = !debouncedSearch ||
                tx.sender?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                tx.receiver?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                tx.sourceTxHash?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                tx.destTxHash?.toLowerCase().includes(debouncedSearch.toLowerCase());
            const matchesMyTxn = !myTxnFilter || !address ||
                tx.sender?.toLowerCase() === address.toLowerCase() ||
                tx.receiver?.toLowerCase() === address.toLowerCase();
            return matchesFrom && matchesTo && matchesSearch && matchesMyTxn;
        });
    }, [txData, fromChainFilter, toChainFilter, debouncedSearch, myTxnFilter, address]);

    // --- Dynamic Sizing ---
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 820);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 820);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const transactionsPerPage = isMobile ? 5 : 10;
    const [page, setPage] = useState(1);

    const totalPages = Math.ceil(filteredTxs.length / transactionsPerPage);
    const paginatedTxs = useMemo(() => {
        const start = (page - 1) * transactionsPerPage;
        return filteredTxs.slice(start, start + transactionsPerPage);
    }, [filteredTxs, page, transactionsPerPage]);

    const handleNextPage = () => {
        if (page < totalPages) setPage(page + 1);
        else setPage(1); // Cycle back
    };

    const handlePrevPage = () => {
        if (page > 1) setPage(page - 1);
        else setPage(totalPages); // Cycle back
    };

    const handleRemintClick = (tx, e) => {
        e.stopPropagation();
        setSelectedTx(tx);
        setIsRemintOpen(true);
    };

    const confirmRemint = async (tx) => {
        setIsMinting(true);
        try {
            await retryMint({
                burnTxHash: tx.sourceTxHash,
                fromChain: tx.fromChain,
                toChain: tx.toChain,
            });
            setIsRemintOpen(false);
            refetchTx();
        } catch (err) {
            console.error(err);
            alert('Mint failed: ' + err.message);
        } finally {
            setIsMinting(false);
        }
    };

    const formatAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '—';
    const formatAmount = (val) => {
        const num = parseFloat(val);
        if (isNaN(num) || num === 0) return '0.00';
        return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    };
    const timeAgo = (ts) => {
        const seconds = Math.floor(Date.now() / 1000) - parseInt(ts);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    const copyHash = (hash, e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(hash);
        setCopiedHash(hash);
        setTimeout(() => setCopiedHash(null), 2000);
    };

    const getExplorerUrl = (chainName, hash) => {
        const c = getChainByName(chainName);
        return c?.explorer ? `${c.explorer}/tx/${hash}` : '#';
    };

    return (
        <div className={`activity-tab-wrapper ${isMobile ? 'mobile-view' : 'desktop-view'}`}>
            <div className="activity-container">
                {/* --- HEADER (Only for Mobile) --- */}
                {isMobile && (
                    <div className="activity-header-section">
                        <button className="activity-back-arrow" onClick={() => setActiveTab('bridge')} title="Back to Bridge">
                            <ArrowLeft size={22} />
                        </button>
                        <div className="title-area">
                            <h1>Bridge Activity</h1>
                            <p>Real-time bridge analytics</p>
                        </div>
                    </div>
                )}

                {isMobile ? (
                    /* =========================================
                       MOBILE VIEW (HIGH-FIDELITY CARDS)
                       ========================================= */
                    <div className="mobile-activity-layout">
                        <div className="activity-stats-grid">
                            <div className="activity-stat-card">
                                <div className="stat-card-header">
                                    <BarChart2 size={16} />
                                    <span className="stat-label">Total Volume</span>
                                </div>
                                <div className="stat-value">
                                    ${(stats.volume || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M
                                </div>
                            </div>
                            <div className="activity-stat-card">
                                <div className="stat-card-header">
                                    <Zap size={16} />
                                    <span className="stat-label">Transactions</span>
                                </div>
                                <div className="stat-value">
                                    {(stats.count || 0).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        <div className="activity-search-row">
                            <div className="activity-search-box">
                                <Search size={18} className="activity-search-icon" />
                                <input
                                    type="text"
                                    className="activity-search-input"
                                    placeholder="Search..."
                                    value={searchAddress}
                                    onChange={(e) => setSearchAddress(e.target.value)}
                                />
                            </div>
                            <button
                                className={`my-txn-pill ${myTxnFilter ? 'my-txn-active' : ''}`}
                                onClick={() => setMyTxnFilter(!myTxnFilter)}
                                disabled={!address}
                                title={address ? 'Show only my transactions' : 'Connect wallet first'}
                            >
                                <Wallet size={14} />
                                My Tx
                            </button>
                        </div>

                        <div className="transactions-section-header">
                            <h2>Recent Activity</h2>
                            <div className="live-data-pill">
                                <div className="live-dot" />
                                LIVE DATA
                            </div>
                        </div>

                        <div className="transactions-list">
                            {txLoading ? (
                                <div className="activity-loading"><Loader className="spin" size={24} /></div>
                            ) : paginatedTxs.length === 0 ? (
                                <div className="activity-empty"><p>No transactions found</p></div>
                            ) : (
                                paginatedTxs.map((tx) => {
                                    const fromChain = getChainByName(tx.fromChain) || ARC_CHAIN;
                                    const toChain = getChainByName(tx.toChain) || ARC_CHAIN;
                                    const statusKey = tx.status === 'pending' ? 'processing' : tx.status;
                                    const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.processing;
                                    return (
                                        <div key={tx.id} className="transaction-card">
                                            <div className="tx-card-top">
                                                <div className="tx-amount">
                                                    {formatAmount(tx.amountDisplay)} <span className="tx-symbol">USDC</span>
                                                </div>
                                                <div className={`tx-status-pill ${statusConfig.className}`}>
                                                    {statusConfig.label}
                                                </div>
                                            </div>
                                            <div className="tx-card-route">
                                                <div className="route-item">
                                                    <img src={fromChain.icon} alt={fromChain.name} />
                                                    <span>{fromChain.name.split(' ')[0]}</span>
                                                </div>
                                                <div className="route-arrow-line"><ArrowRight size={12} className="route-arrow-icon" /></div>
                                                <div className="route-item">
                                                    <span>{toChain.name.split(' ')[0]}</span>
                                                    <img src={toChain.icon} alt={toChain.name} />
                                                </div>
                                            </div>
                                            <div className="tx-card-bottom">
                                                <div className="tx-address" onClick={(e) => copyHash(tx.sourceTxHash, e)}>{formatAddress(tx.sourceTxHash)}</div>
                                                <div className="tx-time">{timeAgo(tx.timestamp)}</div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {totalPages > 1 && (
                            <div className="activity-pagination-section">
                                <div className="pagination-pills-row">
                                    <button className="p-nav-btn" onClick={handlePrevPage}>
                                        <ChevronLeft size={16} />
                                    </button>
                                    <button className="pagination-count-pill" onClick={handleNextPage}>
                                        {Math.min(page * transactionsPerPage, filteredTxs.length)} of {filteredTxs.length}
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="floating-filter-bar">
                            <div className="time-filter-container">
                                {['24H', '7D', '30D', 'ALL'].map(f => (
                                    <button
                                        key={f}
                                        className={`time-filter-pill ${timeFilter === f.toLowerCase() ? 'active' : ''}`}
                                        onClick={() => setTimeFilter(f.toLowerCase())}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* =========================================
                       DESKTOP VIEW (ORIGINAL TABLE LAYOUT)
                       ========================================= */
                    <div className="desktop-activity-layout">
                        {/* --- 1. Global Activity Header Card --- */}
                        <div className="global-activity-card">
                            <div className="header-card-left">
                                <h1>Bridge Activity</h1>
                                <p>Real-time cross-chain transaction analytics</p>
                            </div>
                            <div className="header-card-stats">
                                <div className="h-stat-item">
                                    <div className="h-stat-icon vol-icon">
                                        <span>$</span>
                                    </div>
                                    <div className="h-stat-info">
                                        <span className="h-stat-label">TOTAL VOLUME</span>
                                        <span className="h-stat-value">${(stats.volume || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                                <div className="h-stat-item">
                                    <div className="h-stat-icon tx-icon">
                                        <BarChart2 size={18} />
                                    </div>
                                    <div className="h-stat-info">
                                        <span className="h-stat-label">TOTAL TRANSACTIONS</span>
                                        <span className="h-stat-value">{(stats.count || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="header-card-filters">
                                <div className="time-filter-pills">
                                    {['24H', '7D', '30D', 'ALL'].map(f => (
                                        <button
                                            key={f}
                                            className={`t-pill ${timeFilter === f.toLowerCase() ? 'active' : ''}`}
                                            onClick={() => setTimeFilter(f.toLowerCase())}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* --- 2. Toolbar (Search & Route Select) --- */}
                        <div className="desktop-toolbar">
                            <div className="toolbar-left">
                                <div className="desktop-search-wrapper">
                                    <Search size={18} className="search-icon" />
                                    <input
                                        placeholder="Filter by wallet address, or transaction hash"
                                        value={searchAddress}
                                        onChange={(e) => setSearchAddress(e.target.value)}
                                    />
                                </div>
                                <button
                                    className={`my-txn-pill-desktop ${myTxnFilter ? 'my-txn-active' : ''}`}
                                    onClick={() => setMyTxnFilter(!myTxnFilter)}
                                    disabled={!address}
                                    title={address ? 'Show only my transactions' : 'Connect wallet first'}
                                >
                                    <Wallet size={14} />
                                    My Tx
                                </button>
                            </div>
                            <div className="toolbar-right">
                                <div className="live-indicator">
                                    <div className="live-dot" />
                                    <span>LIVE</span>
                                </div>
                                <div className="route-select-wrapper">
                                    <span className="route-label">Route:</span>
                                    <div className="route-filters-d">
                                        <button className="chain-select-d">{fromChainFilter} <ChevronRight size={14} /></button>
                                        <RefreshCw size={14} className="route-swap-icon" />
                                        <button className="chain-select-d">{toChainFilter} <ChevronRight size={14} /></button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* --- 3. Transaction Table --- */}
                        <div className="desktop-table-card">
                            <table className="high-fidelity-table">
                                <thead>
                                    <tr>
                                        <th>FROM / SENDER</th>
                                        <th>TO / RECIPIENT</th>
                                        <th>DETAILS</th>
                                        <th>STATUS</th>
                                        <th>FILL TIME</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {txLoading ? (
                                        <tr><td colSpan="5" className="t-loading">Loading...</td></tr>
                                    ) : paginatedTxs.length === 0 ? (
                                        <tr><td colSpan="5" className="t-empty">No transactions found</td></tr>
                                    ) : (
                                        paginatedTxs.map((tx) => {
                                            const fromChain = getChainByName(tx.fromChain) || ARC_CHAIN;
                                            const toChain = getChainByName(tx.toChain) || ARC_CHAIN;
                                            const statusKey = tx.status === 'pending' ? 'processing' : tx.status;
                                            const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.processing;
                                            return (
                                                <tr key={tx.id}>
                                                    <td>
                                                        <div className="t-chain-info">
                                                            <div className="t-chain-main">
                                                                <img src={fromChain.icon} alt="" />
                                                                <span className="t-amount">{formatAmount(tx.amountDisplay)}</span>
                                                                <span className="t-token">USDT</span>
                                                            </div>
                                                            <div className="t-sub-info">
                                                                <span className="t-sub-label">Source:</span>
                                                                <span className="t-sub-value" onClick={(e) => copyHash(tx.sender, e)}>{formatAddress(tx.sender)}</span>
                                                                <Copy size={12} className="copy-icon" onClick={(e) => copyHash(tx.sender, e)} />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="t-chain-info">
                                                            <div className="t-chain-main">
                                                                <img src={toChain.icon} alt="" />
                                                                <span className="t-amount">{formatAmount(tx.amountDisplay)}</span>
                                                                <span className="t-token">USDC</span>
                                                            </div>
                                                            <div className="t-sub-info">
                                                                <span className="t-sub-label">Destination:</span>
                                                                <span className="t-sub-value" onClick={(e) => copyHash(tx.receiver, e)}>{formatAddress(tx.receiver)}</span>
                                                                <Copy size={12} className="copy-icon" onClick={(e) => copyHash(tx.receiver, e)} />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="t-details">
                                                            <span className="t-detail-label">Swap:</span>
                                                            <a href={getExplorerUrl(tx.fromChain, tx.sourceTxHash)} target="_blank" rel="noreferrer" className="t-hash-link">
                                                                {formatAddress(tx.sourceTxHash)} <ExternalLink size={12} />
                                                            </a>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="t-status-cell">
                                                            <div className={`t-status-pill-hf ${statusConfig.className}`}>
                                                                <CheckCircle size={14} />
                                                                <span>{statusConfig.label}</span>
                                                            </div>
                                                            <span className="t-timestamp">{timeAgo(tx.timestamp)}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="t-fill-time">{tx.status === 'completed' ? '1s' : '-'}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>

                            {/* --- 4. Table Pagination Footer --- */}
                            <div className="table-footer">
                                <span className="footer-count">
                                    Showing {(page - 1) * transactionsPerPage + 1}-
                                    {Math.min(page * transactionsPerPage, filteredTxs.length)} of
                                    {filteredTxs.length.toLocaleString()} transactions
                                </span>
                                <div className="footer-pagination">
                                    <button disabled={page === 1} onClick={() => setPage(page - 1)} className="p-btn"><ChevronLeft size={18} /></button>
                                    <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="p-btn"><ChevronRight size={18} /></button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <RemintModal
                isOpen={isRemintOpen}
                onClose={() => setIsRemintOpen(false)}
                onConfirm={confirmRemint}
                tx={selectedTx}
                isMinting={isMinting}
            />
        </div>
    );
}

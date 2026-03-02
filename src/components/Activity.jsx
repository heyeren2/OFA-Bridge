import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Search, ExternalLink, ArrowRight, ArrowLeft, CheckCircle, XCircle, AlertTriangle, Loader, RefreshCw, Copy, ChevronLeft, ChevronRight, BarChart2, Zap, Wallet } from 'lucide-react';
import { getChainByName, ARC_CHAIN, SUPPORTED_CHAINS } from '../config/chains';
import { TOKEN_INFO } from '../config/contracts';
import { retryMint } from '../services/bridgeService';
import { GET_TRANSACTIONS, GET_BRIDGE_STATS, GET_DAILY_VOLUMES, GET_HOURLY_VOLUMES, queryAllChains } from '../services/graphql';
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

    // Remint Modal State
    const [isRemintOpen, setIsRemintOpen] = useState(false);
    const [selectedTx, setSelectedTx] = useState(null);
    const [isMinting, setIsMinting] = useState(false);

    // Multi-chain aggregated state
    const [allTransactions, setAllTransactions] = useState([]);
    const [globalStats, setGlobalStats] = useState({ volume: 0, fees: 0, count: 0, users: 0 });
    const [dailyStats, setDailyStats] = useState([]);
    const [hourlyStats, setHourlyStats] = useState([]);
    const [txLoading, setTxLoading] = useState(true);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchAddress);
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchAddress]);

    // Multi-chain data fetcher
    const fetchAllChainData = useCallback(async () => {
        if (allTransactions.length === 0) {
            setTxLoading(true);
        }
        try {
            // 1. Transactions
            const txResults = await queryAllChains(GET_TRANSACTIONS, {
                first: 100,
                orderBy: 'timestamp',
                orderDirection: 'desc',
                where: {
                    // isOFA: true  ← removed. The JS filter below handles this correctly.
                    // Destination-chain completion records have isOFA: false and must be
                    // fetched so the merge can set status: "completed" on the source record.
                    ...(debouncedSearch ? {
                        or: [
                            { sender: debouncedSearch },
                            { receiver: debouncedSearch },
                            { sourceTxHash: debouncedSearch },
                            { destTxHash: debouncedSearch }
                        ]
                    } : {})
                },
            });

            const txMap = new Map();
            for (const result of txResults) {
                if (result.data?.bridgeTransactions) {
                    for (const tx of result.data.bridgeTransactions) {
                        const key = tx.id;
                        const existing = txMap.get(key);
                        if (!existing) {
                            txMap.set(key, tx);
                        } else {
                            const merged = {
                                ...existing,
                                ...tx,
                                isOFA: existing.isOFA || tx.isOFA,
                                status: (existing.status === 'completed' || tx.status === 'completed') ? 'completed' : tx.status,
                                fromChain: (existing.fromChain !== 'Unknown') ? existing.fromChain : tx.fromChain,
                                toChain: (existing.toChain !== 'Unknown') ? existing.toChain : tx.toChain,
                                sourceTxHash: existing.sourceTxHash || tx.sourceTxHash,
                                destTxHash: existing.destTxHash || tx.destTxHash,
                                mintTimestamp: existing.mintTimestamp || tx.mintTimestamp,
                            };
                            txMap.set(key, merged);
                        }
                    }
                }
            }
            setAllTransactions(
                Array.from(txMap.values())
                    .filter(tx => tx.isOFA === true) // Secondary safety filter
                    .sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))
            );

            // 2. Global Stats
            const statResults = await queryAllChains(GET_BRIDGE_STATS);
            let totalVol = BigInt(0);
            let totalFees = BigInt(0);
            let totalCount = BigInt(0);
            let totalUsers = BigInt(0);
            for (const result of statResults) {
                if (result.data?.bridgeStat) {
                    totalVol += BigInt(result.data.bridgeStat.totalVolume || '0');
                    totalFees += BigInt(result.data.bridgeStat.totalFees || '0');
                    totalCount += BigInt(result.data.bridgeStat.transactionCount || '0');
                    totalUsers += BigInt(result.data.bridgeStat.uniqueUsers || '0');
                }
            }
            // Convert to human readable
            const USDC_DIV = 1000000;
            setGlobalStats({
                volume: Number(totalVol) / USDC_DIV,
                fees: Number(totalFees) / USDC_DIV,
                count: Number(totalCount),
                users: Number(totalUsers)
            });

            // 3. Daily Stats (for 7d/30d)
            const dailyResults = await queryAllChains(GET_DAILY_VOLUMES, { first: 30 });
            const dMap = new Map();
            for (const result of dailyResults) {
                if (result.data?.dailyVolumes) {
                    for (const day of result.data.dailyVolumes) {
                        const existing = dMap.get(day.id);
                        if (existing) {
                            existing.volume = (BigInt(existing.volume) + BigInt(day.volume)).toString();
                            existing.fees = (BigInt(existing.fees) + BigInt(day.fees)).toString();
                            existing.transactionCount = (BigInt(existing.transactionCount) + BigInt(day.transactionCount)).toString();
                        } else {
                            dMap.set(day.id, { ...day });
                        }
                    }
                }
            }
            setDailyStats(Array.from(dMap.values()).sort((a, b) => parseInt(b.id) - parseInt(a.id)));

            // 4. Hourly Stats (for 24h)
            const hourlyResults = await queryAllChains(GET_HOURLY_VOLUMES, { first: 24 });
            const hMap = new Map();
            for (const result of hourlyResults) {
                if (result.data?.hourlyVolumes) {
                    for (const hour of result.data.hourlyVolumes) {
                        const existing = hMap.get(hour.id);
                        if (existing) {
                            existing.volume = (BigInt(existing.volume) + BigInt(hour.volume)).toString();
                            existing.fees = (BigInt(existing.fees) + BigInt(hour.fees)).toString();
                            existing.transactionCount = (BigInt(existing.transactionCount) + BigInt(hour.transactionCount)).toString();
                        } else {
                            hMap.set(hour.id, { ...hour });
                        }
                    }
                }
            }
            setHourlyStats(Array.from(hMap.values()).sort((a, b) => parseInt(b.id) - parseInt(a.id)));

        } catch (err) {
            console.error('[Activity] Multi-chain fetch error:', err);
        } finally {
            setTxLoading(false);
        }
    }, [debouncedSearch]);

    // Initial fetch + polling every 10 seconds
    useEffect(() => {
        // Disabled while Activity tab is "Coming Soon" and subgraphs are offline
        // fetchAllChainData();
        // const interval = setInterval(fetchAllChainData, 10000);
        // return () => clearInterval(interval);
    }, [fetchAllChainData]);

    // Refetch helper for remint
    const refetchTx = fetchAllChainData;

    // Calculate Volume Stats based on Time Filter
    const stats = useMemo(() => {
        const USDC_DIV = 1000000;
        if (timeFilter === 'all') {
            return globalStats;
        }

        if (timeFilter === '24h') {
            let volume = 0;
            let count = 0;
            let fees = 0;
            hourlyStats.forEach(h => {
                volume += Number(BigInt(h.volume)) / USDC_DIV;
                fees += Number(BigInt(h.fees)) / USDC_DIV;
                count += parseInt(h.transactionCount);
            });
            return { volume, count, fees, users: globalStats.users };
        }

        // 7d or 30d
        let volume = 0;
        let count = 0;
        let fees = 0;
        const limit = timeFilter === '7d' ? 7 : 30;
        dailyStats.slice(0, limit).forEach(d => {
            volume += Number(BigInt(d.volume)) / USDC_DIV;
            fees += Number(BigInt(d.fees)) / USDC_DIV;
            count += parseInt(d.transactionCount);
        });
        return { volume, count, fees, users: globalStats.users };
    }, [timeFilter, dailyStats, hourlyStats, globalStats]);


    // Filtered Transactions (Chain + Search filters)
    const filteredTxs = useMemo(() => {
        if (!allTransactions.length) return [];
        return allTransactions.filter(tx => {
            const matchesFrom = fromChainFilter === 'All Chains' || tx.fromChain === fromChainFilter;
            const matchesTo = toChainFilter === 'All Chains' || tx.toChain === toChainFilter;
            const matchesSearch = !debouncedSearch ||
                tx.sender?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                tx.receiver?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                tx.sourceTxHash?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                tx.destTxHash?.toLowerCase().includes(debouncedSearch.toLowerCase());
            const matchesMyTxn = !myTxnFilter || !address ||
                tx.sender?.toLowerCase().endsWith(address.toLowerCase()) ||
                tx.receiver?.toLowerCase().endsWith(address.toLowerCase());
            return matchesFrom && matchesTo && matchesSearch && matchesMyTxn;
        });
    }, [allTransactions, fromChainFilter, toChainFilter, debouncedSearch, myTxnFilter, address]);

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

    const formatAddress = (addr) => {
        if (!addr) return '—';
        // Handle 32-byte padded addresses (66 chars including 0x)
        const displayAddr = addr.length === 66 ? '0x' + addr.slice(-40) : addr;
        return `${displayAddr.slice(0, 6)}...${displayAddr.slice(-4)}`;
    };
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
                        <div className="coming-soon-wrapper">
                            <div className="blur-content">
                                <div className="activity-stats-grid">
                                    <div className="activity-stat-card">
                                        <div className="stat-card-header">
                                            <BarChart2 size={16} />
                                            <span className="stat-label">Total Volume</span>
                                        </div>
                                        <div className="stat-value">
                                            ${(stats.volume || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                            <div className="coming-soon-overlay">
                                <span>Coming Soon</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* =========================================
                       DESKTOP VIEW (ORIGINAL TABLE LAYOUT)
                       ========================================= */
                    <div className="desktop-activity-layout">
                        <div className="coming-soon-wrapper">
                            <div className="blur-content">
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
                                                <span className="h-stat-label">TRANSACTIONS</span>
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
                                                                        <span className="t-token">USDC</span>
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
                                                                    <span className="t-detail-label">Bridge:</span>
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
                            <div className="coming-soon-overlay">
                                <span>Coming Soon</span>
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

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { Search, ExternalLink, ArrowRight, ArrowLeft, CheckCircle, XCircle, AlertTriangle, Loader, RefreshCw, Copy, ChevronLeft, ChevronRight, BarChart2, Zap, Wallet } from 'lucide-react';
import { getChainByName, ARC_CHAIN, SUPPORTED_CHAINS } from '../config/chains';
import { TOKEN_INFO } from '../config/contracts';
import { retryMint } from '../services/bridgeService';
import { checkAttestationStatus } from '../services/attestationService';
import { sdk } from '../services/analyticsService';
import { RemintModal } from './RemintModal';
import { useStuckTxChecker } from '../hooks/useStuckTxChecker';
import './Activity.css';

const STATUS_CONFIG = {
    processing: { icon: Loader, className: 'status-processing', animate: true, label: 'Processing' },
    minting: { icon: Loader, className: 'status-processing', animate: true, label: 'Minting' },
    completed: { icon: CheckCircle, className: 'status-completed', animate: false, label: 'Success' },
    failed: { icon: XCircle, className: 'status-failed', animate: false, label: 'Failed' },
    mint_failed: { icon: AlertTriangle, className: 'status-mint-failed', animate: false, label: 'Action Needed' },
    attestation_failed: { icon: AlertTriangle, className: 'status-mint-failed', animate: false, label: 'Action Needed' },
};

export default function Activity({ setActiveTab }) {
    const { chain, address } = useAccount();
    const [searchAddress, setSearchAddress] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [myTxnFilter, setMyTxnFilter] = useState(false);
    const [timeFilter, setTimeFilter] = useState('24h');
    const [copiedHash, setCopiedHash] = useState(null);
    const [fromChainFilter, setFromChainFilter] = useState('3 Chains');
    const [toChainFilter, setToChainFilter] = useState('3 Chains');

    // Remint Modal State
    const [isRemintOpen, setIsRemintOpen] = useState(false);
    const [selectedTx, setSelectedTx] = useState(null);
    const [isMinting, setIsMinting] = useState(false);
    const [isRemintSuccess, setIsRemintSuccess] = useState(false);
    const [newMintHash, setNewMintHash] = useState(null);
    // Tracks which step is currently active: null | 'attestation' | 'mint'
    const [mintingStep, setMintingStep] = useState(null);

    // Multi-chain aggregated state
    const [allTransactions, setAllTransactions] = useState([]);
    const [globalStats, setGlobalStats] = useState({
        totalVolume: '0', totalTransactions: 0, uniqueWallets: 0,
        completedBridges: 0, pendingBridges: 0
    });
    const [txLoading, setTxLoading] = useState(false);
    const pollingTimerRef = useRef(null);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchAddress);
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchAddress]);

    // Helper to map raw transaction data to UI shape
    const mapTransactions = (transactions) => {
        return (transactions || []).map((tx, i) => {
            const searchName = (name) => {
                const clean = (s) => s?.toLowerCase().replace(/_/g, ' ') || '';
                const target = clean(name);
                return SUPPORTED_CHAINS.find(c =>
                    clean(c.name).includes(target) || target.includes(clean(c.name))
                )?.name || name;
            };

            // If the backend has a mintTxHash, the mint already happened — trust the DB.
            const alreadyMinted = !!tx.mintTxHash;

            let derivedStatus;
            if (alreadyMinted) {
                derivedStatus = 'completed';
            } else {
                derivedStatus = tx.status === 'minted' ? 'completed'
                    : tx.status === 'completed' ? 'completed'
                        : tx.status === 'attested' ? 'mint_failed'
                            : tx.status === 'burned' ? 'processing'
                                : tx.status === 'attestation_failed' ? 'mint_failed'
                                    : tx.status === 'failed' ? 'failed'
                                        : tx.status === 'mint_failed' ? 'mint_failed'
                                            : 'processing';
            }

            return {
                id: tx.burnTxHash || String(i),
                sender: tx.wallet,
                receiver: tx.wallet,
                amountDisplay: tx.amount,
                amountReceived: tx.amountReceived || null,
                fromChain: searchName(tx.sourceChain),
                toChain: searchName(tx.destinationChain),
                sourceTxHash: tx.burnTxHash,
                destTxHash: tx.mintTxHash || null,
                status: derivedStatus,
                timestamp: tx.timestamp
                    ? String(Math.floor(new Date(tx.timestamp).getTime() / 1000))
                    : String(Math.floor(Date.now() / 1000)),
                isOFA: true,
                rawStatus: alreadyMinted ? 'minted' : tx.status,
            };
        });
    };

    // Fetch global stats independently (always runs)
    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(import.meta.env.VITE_ANALYTICS_URL + `/analytics/stats?bridgeId=${import.meta.env.VITE_BRIDGE_ID}`);
            const data = await res.json();
            if (data && !data.error) setGlobalStats(data);
        } catch (err) {
            console.warn('[Activity] Stats fetch failed:', err.message);
        }
    }, []);

    // Fetch activity data
    const fetchData = useCallback(async () => {
        setTxLoading(true);
        try {
            if (myTxnFilter && address) {
                // "My Tx" mode: fetch only the connected wallet's transactions via SDK
                const activity = await sdk.getUserActivity(address);
                setAllTransactions(mapTransactions(activity?.transactions));
            } else {
                // "All" mode: fetch global activity directly from backend
                const res = await fetch(import.meta.env.VITE_ANALYTICS_URL + '/activity/all');
                if (res.ok) {
                    const data = await res.json();
                    setAllTransactions(mapTransactions(data?.transactions));
                } else {
                    // Fallback: if /activity/all isn't available yet, try wallet
                    if (address) {
                        const activity = await sdk.getUserActivity(address);
                        setAllTransactions(mapTransactions(activity?.transactions));
                    } else {
                        setAllTransactions([]);
                    }
                }
            }
        } catch (err) {
            console.warn('[Activity] activity fetch failed:', err.message);
            setAllTransactions([]);
        } finally {
            setTxLoading(false);
        }
    }, [address, myTxnFilter]);

    // Fetch stats on mount (once)
    useEffect(() => { fetchStats(); }, [fetchStats]);

    // Fetch activity on mount and when mode/address changes
    useEffect(() => { fetchData(); }, [fetchData]);

    // Auto-recover stuck "Processing" transactions for the connected wallet
    useStuckTxChecker(allTransactions, address, fetchData);

    // Refetch helper for remint
    const refetchTx = fetchData;

    // Background attestation expiry checker
    // Runs whenever allTransactions or the connected wallet changes.
    // For each mint_failed tx owned by the user, calls Circle Iris API + simulates receiveMessage
    // to determine if the attestation has simply expired (CCTP V2) or was already minted.
    // Updates the backend and local state silently — the button auto-changes to 'Re-Attest'.
    useEffect(() => {
        if (!address || !allTransactions.length) return;

        // Check both mint_failed AND attestation_failed txs:
        // mint_failed       → check if expired → show Re-Attest once
        // attestation_failed → check again  → if still expired → mark as failed permanently
        const myPendingTxs = allTransactions.filter(tx =>
            (tx.status === 'mint_failed' || tx.rawStatus === 'attestation_failed') &&
            tx.sender?.toLowerCase() === address.toLowerCase() &&
            tx.sourceTxHash &&
            !tx.destTxHash
        );

        if (!myPendingTxs.length) return;

        let cancelled = false;

        const runChecks = async () => {
            for (const tx of myPendingTxs) {
                if (cancelled) break;
                try {
                    const attestStatus = await checkAttestationStatus({
                        burnTxHash: tx.sourceTxHash,
                        fromChain: tx.fromChain,
                        toChain: tx.toChain,
                        walletAddress: address,
                    });

                    console.log(`[Activity] Attestation check for ${tx.sourceTxHash.slice(0, 10)}...: ${attestStatus}`);

                    if (attestStatus === 'expired') {
                        // Two-stage escalation matching the manual Re-Attest logic:
                        // mint_failed + expired        → attestation_failed (show Re-Attest once)
                        // attestation_failed + expired → failed (no protocol recovery possible)
                        const alreadyAttempted = tx.rawStatus === 'attestation_failed';
                        const nextStatus = alreadyAttempted ? 'failed' : 'attestation_failed';

                        // Silently update backend
                        fetch(import.meta.env.VITE_ANALYTICS_URL + '/track/status', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                burnTxHash: tx.sourceTxHash,
                                bridgeId: import.meta.env.VITE_BRIDGE_ID,
                                status: nextStatus,
                            }),
                        }).catch(() => {});

                        // Update local state immediately
                        if (!cancelled) {
                            setAllTransactions(prev => prev.map(t =>
                                t.id === tx.id
                                    ? { ...t, rawStatus: nextStatus, status: alreadyAttempted ? 'failed' : 'mint_failed' }
                                    : t
                            ));
                        }
                    } else if (attestStatus === 'already_minted') {
                        // Backend hasn't updated yet — trigger a re-fetch to get the real mint hash
                        if (!cancelled) fetchData();
                    }
                } catch {
                    // Silently ignore individual check errors
                }

                // Small delay between checks to avoid hammering Circle's API
                await new Promise(r => setTimeout(r, 800));
            }
        };

        runChecks();
        return () => { cancelled = true; };
    }, [allTransactions, address]);

    const stats = useMemo(() => ({
        volume: parseFloat(globalStats.totalVolume || '0'),
        count: globalStats.totalTransactions || 0,
        users: globalStats.uniqueWallets || 0,
        fees: 0,
    }), [globalStats]);


    // Filtered Transactions (Chain + Search filters only — My Tx filtering is handled by fetchData)
    const filteredTxs = useMemo(() => {
        if (!allTransactions.length) return [];
        return allTransactions.filter(tx => {
            const matchesFrom = fromChainFilter === '3 Chains' || tx.fromChain === fromChainFilter;
            const matchesTo = toChainFilter === '3 Chains' || tx.toChain === toChainFilter;
            const matchesSearch = !debouncedSearch ||
                tx.sender?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                tx.receiver?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                tx.sourceTxHash?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                tx.destTxHash?.toLowerCase().includes(debouncedSearch.toLowerCase());
            return matchesFrom && matchesTo && matchesSearch;
        });
    }, [allTransactions, fromChainFilter, toChainFilter, debouncedSearch]);

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
        // Start at attestation step if re-attesting, otherwise go straight to mint
        setMintingStep(tx.rawStatus === 'attestation_failed' ? 'attestation' : 'mint');
        try {
            // Note: retryMint should ideally return the result object containing the hash
            const result = await retryMint({
                burnTxHash: tx.sourceTxHash,
                fromChain: tx.fromChain,
                toChain: tx.toChain,
                onStatusUpdate: ({ step }) => {
                    // 'attestation_polling' — Iris API call in progress, keep spinner on attestation
                    if (step === 'attestation_polling') {
                        // Only show attestation spinner if we're in a re-attest flow
                        // (normal mint_failed goes straight to 'mint' step)
                        if (tx.rawStatus === 'attestation_failed') {
                            setMintingStep('attestation');
                        }
                    }
                    // 'attestation_done' — Circle confirmed, now transition to Mint step
                    if (step === 'attestation_done') setMintingStep('mint');
                },
            });

            const mintHash = result?.mintTxHash || result?.mintHash || result?.hash || null;
            if (mintHash) {
                setNewMintHash(mintHash);

                // Update selectedTx immediately so the success modal explorer link works right away
                setSelectedTx(prev => prev ? { ...prev, destTxHash: mintHash, status: 'completed' } : null);

                // Write the mint hash directly to the backend database.
                // This is the source of truth — no localStorage involved.
                try {
                    await fetch(import.meta.env.VITE_ANALYTICS_URL + '/track/mint', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            burnTxHash: tx.sourceTxHash,
                            mintTxHash: mintHash,
                            bridgeId: import.meta.env.VITE_BRIDGE_ID,
                            amountReceived: tx.amountReceived || tx.amountDisplay,
                            success: true,
                        }),
                    });
                    console.log('[Activity] Remint recorded in backend DB:', mintHash);
                } catch (trackErr) {
                    console.warn('[Activity] Failed to record remint in DB (will retry via polling):', trackErr.message);
                }
            }

            setIsRemintSuccess(true);

            // Re-fetch transactions immediately and start polling
            refetchTx();
            fetchStats();

            // Clear existing polling
            if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);

            // Start polling: refetch every 5s for 30s
            let count = 0;
            pollingTimerRef.current = setInterval(() => {
                count++;
                if (count > 6) { // 30 seconds (6 * 5s)
                    clearInterval(pollingTimerRef.current);
                    return;
                }
                console.log(`[Activity] Polling for backend sync... (${count}/6)`);
                refetchTx();
                fetchStats();
            }, 5000);
        } catch (err) {
            console.error(err);

            if (err.message?.startsWith('ATTESTATION_EXPIRED')) {
                console.warn('[Activity] Attestation expired — updating backend.');

                setMintingStep(null);

                // TWO-STAGE FAILURE LOGIC:
                // 1st failure  (rawStatus was 'mint_failed')   → attestation_failed → show Re-Attest once
                // 2nd failure  (rawStatus was 'attestation_failed') → failed → close modal, done
                const isSecondAttempt = tx.rawStatus === 'attestation_failed';
                const nextBackendStatus = isSecondAttempt ? 'failed' : 'attestation_failed';

                // Update backend
                try {
                    await fetch(import.meta.env.VITE_ANALYTICS_URL + '/track/status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            burnTxHash: tx.sourceTxHash,
                            bridgeId: import.meta.env.VITE_BRIDGE_ID,
                            status: nextBackendStatus,
                        }),
                    });
                } catch (e) { console.warn('[Activity] Could not update status:', e.message); }

                // Update local state immediately
                setAllTransactions(prev => prev.map(t =>
                    t.id === tx.id
                        ? { ...t, rawStatus: nextBackendStatus, status: isSecondAttempt ? 'failed' : 'mint_failed' }
                        : t
                ));

                if (isSecondAttempt) {
                    // Re-Attest also failed — this burn is permanently unrecoverable
                    // Close the modal, the activity list now shows red 'Failed'
                    console.warn('[Activity] Re-Attest also expired — marking tx as permanently failed.');
                    setIsRemintOpen(false);
                } else {
                    // First detection — give the user one chance to Re-Attest
                    setSelectedTx(prev => prev ? { ...prev, rawStatus: 'attestation_failed', status: 'mint_failed' } : null);
                    // Keep modal open — button will now show 'Re-Attest & Mint'
                }
                return;
            }

            // Special case: "Nonce already used" = already minted by a prior attempt
            // The tx failed on-chain because the CCTP nonce was consumed by a prior successful remint.
            if (err.message?.toLowerCase().includes('nonce already used')) {
                console.warn('[Activity] Nonce already used — remint was already completed on a prior attempt. Marking as success.');
                setIsRemintSuccess(true);
                // Trigger a refresh so the backend poller can pick up the real mint hash
                refetchTx();
                fetchStats();
                return;
            }

            // Track genuine failure with SDK
            sdk.trackMint({
                burnTxHash: tx.sourceTxHash,
                success: false,
                error: err.message
            }).catch(() => { });

            alert('Action failed: ' + err.message);
        } finally {
            setIsMinting(false);
            setMintingStep(null);
        }
    };

    const formatAddress = (addr) => {
        if (!addr) return '—';
        const displayAddr = addr.length === 66 ? '0x' + addr.slice(-40) : addr;
        return `${displayAddr.slice(0, 6)}...${displayAddr.slice(-4)}`;
    };
    const formatAmount = (val) => {
        if (!val || isNaN(parseFloat(val))) return '0.00';
        const [int, frac] = val.toString().split('.');
        const truncatedFrac = (frac || '00').padEnd(2, '0').slice(0, 2);
        return `${parseInt(int).toLocaleString()}.${truncatedFrac}`;
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

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
        };
    }, []);

    return (
        <div className={`activity-tab-wrapper ${isMobile ? 'mobile-view' : 'desktop-view'}`}>
            <div className="activity-container">
                {/* --- HEADER (Only for Mobile) --- */}
                {isMobile && (
                    <div className="activity-header-section">
                        <button className="activity-back-arrow" onClick={() => setActiveTab('bridge')} data-tooltip="Back to Bridge" data-tooltip-pos="bottom">
                            <ArrowLeft size={22} />
                        </button>
                        <div className="title-area">
                            <h1>Bridge Activity</h1>
                            <p>Real-time bridge analytics</p>
                        </div>
                    </div>
                )}

                {isMobile ? (
                    /* MOBILE VIEW */
                    <div className="mobile-activity-layout">
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
                            <div className="activity-toggle-group">
                                <button
                                    className={`toggle-pill ${!myTxnFilter ? 'toggle-active' : ''}`}
                                    onClick={() => setMyTxnFilter(false)}
                                >
                                    All
                                </button>
                                <button
                                    className={`toggle-pill ${myTxnFilter ? 'toggle-active' : ''}`}
                                    onClick={() => { if (address) setMyTxnFilter(true); }}
                                    disabled={!address}
                                    data-tooltip={!address ? 'Connect wallet first' : ''}
                                >
                                    <Wallet size={14} />
                                    My Tx
                                </button>
                            </div>
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
                                                <div className="tx-header-left">
                                                    <div className="tx-amount">
                                                        {formatAmount(tx.amountDisplay)} <span className="tx-symbol">USDC</span>
                                                    </div>
                                                    <div className="tx-time-mobile">{timeAgo(tx.timestamp)}</div>
                                                </div>
                                                <div className={`tx-status-pill ${statusConfig.className}`}>
                                                    {tx.status === 'mint_failed' && (
                                                        (!address || address.toLowerCase() !== tx.sender.toLowerCase())
                                                            ? (tx.rawStatus === 'attestation_failed' ? 'Attestation Failed' : 'Mint Failed')
                                                            : 'Action Needed'
                                                    )}
                                                    {tx.status !== 'mint_failed' && statusConfig.label}
                                                </div>
                                            </div>
                                            <div className="tx-card-route">
                                                {/* Route content same */}
                                                <div className="route-item">
                                                    <div className="token-icon-badge-wrapper" style={{ width: '24px', height: '24px' }}>
                                                        <img src="/icons/usdc.png" alt="USDC" className="main-token-icon" style={{ width: '24px', height: '24px' }} />
                                                        <img src={fromChain.icon} alt={fromChain.name} className="chain-badge-icon" style={{ width: '10px', height: '10px' }} />
                                                    </div>
                                                    <span>{fromChain.name.split(' ')[0]}</span>
                                                </div>
                                                <div className="route-arrow-line"><ArrowRight size={12} className="route-arrow-icon" /></div>
                                                <div className="route-item">
                                                    <span>{toChain.name.split(' ')[0]}</span>
                                                    <div className="token-icon-badge-wrapper" style={{ width: '24px', height: '24px' }}>
                                                        <img src="/icons/usdc.png" alt="USDC" className="main-token-icon" style={{ width: '24px', height: '24px' }} />
                                                        <img src={toChain.icon} alt={toChain.name} className="chain-badge-icon" style={{ width: '10px', height: '10px' }} />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="tx-card-bottom">
                                                <div className="t-details" style={{ width: '100%', gap: '4px' }}>
                                                    <div className="detail-row" style={{ justifyContent: 'space-between' }}>
                                                        <span className="t-detail-label">Burn:</span>
                                                        <a href={getExplorerUrl(tx.fromChain, tx.sourceTxHash)} target="_blank" rel="noreferrer" className="t-hash-link" style={{ fontSize: '11px' }}>
                                                            {formatAddress(tx.sourceTxHash)} <ExternalLink size={10} />
                                                        </a>
                                                    </div>
                                                    {tx.destTxHash && (
                                                        <div className="detail-row" style={{ justifyContent: 'space-between' }}>
                                                            <span className="t-detail-label">Mint:</span>
                                                            <a href={getExplorerUrl(tx.toChain, tx.destTxHash)} target="_blank" rel="noreferrer" className="t-hash-link" style={{ fontSize: '11px' }}>
                                                                {formatAddress(tx.destTxHash)} <ExternalLink size={10} />
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
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
                    /* DESKTOP VIEW */
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
                                <div className="activity-toggle-group-desktop">
                                    <button
                                        className={`toggle-pill-desktop ${!myTxnFilter ? 'toggle-active' : ''}`}
                                        onClick={() => setMyTxnFilter(false)}
                                    >
                                        All
                                    </button>
                                    <button
                                        className={`toggle-pill-desktop ${myTxnFilter ? 'toggle-active' : ''}`}
                                        onClick={() => { if (address) setMyTxnFilter(true); }}
                                        disabled={!address}
                                        data-tooltip={!address ? 'Connect wallet first' : ''}
                                    >
                                        <Wallet size={14} />
                                        My Tx
                                    </button>
                                </div>
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
                                                                <div className="token-icon-badge-wrapper">
                                                                    <img src="/icons/usdc.png" alt="USDC" className="main-token-icon" />
                                                                    <img src={fromChain.icon} alt={fromChain.name} className="chain-badge-icon" />
                                                                </div>
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
                                                                <div className="token-icon-badge-wrapper">
                                                                    <img src="/icons/usdc.png" alt="USDC" className="main-token-icon" />
                                                                    <img src={toChain.icon} alt={toChain.name} className="chain-badge-icon" />
                                                                </div>
                                                                <span className="t-amount">{formatAmount(tx.amountReceived || tx.amountDisplay)}</span>
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
                                                            <div className="detail-row">
                                                                <span className="t-detail-label">Burn:</span>
                                                                <a href={getExplorerUrl(tx.fromChain, tx.sourceTxHash)} target="_blank" rel="noreferrer" className="t-hash-link">
                                                                    {formatAddress(tx.sourceTxHash)} <ExternalLink size={12} />
                                                                </a>
                                                            </div>
                                                            {tx.destTxHash && (
                                                                <div className="detail-row">
                                                                    <span className="t-detail-label">Mint:</span>
                                                                    <a href={getExplorerUrl(tx.toChain, tx.destTxHash)} target="_blank" rel="noreferrer" className="t-hash-link">
                                                                        {formatAddress(tx.destTxHash)} <ExternalLink size={12} />
                                                                    </a>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="t-status-cell">
                                                            <div className={`t-status-pill-hf ${statusConfig.className}`}>
                                                                <CheckCircle size={14} />
                                                                <span>
                                                                    {tx.status === 'mint_failed' && (
                                                                        (!address || address.toLowerCase() !== tx.sender.toLowerCase())
                                                                            ? (tx.rawStatus === 'attestation_failed' ? 'Attestation Failed' : 'Mint Failed')
                                                                            : 'Action Needed'
                                                                    )}
                                                                    {tx.status !== 'mint_failed' && statusConfig.label}
                                                                </span>
                                                            </div>
                                                            {tx.status === 'mint_failed' && address?.toLowerCase() === tx.sender.toLowerCase() && (
                                                                <button
                                                                    className="remint-btn-inline"
                                                                    onClick={(e) => handleRemintClick(tx, e)}
                                                                >
                                                                    {tx.rawStatus === 'attestation_failed' ? 'Re-attest' : 'Remint'}
                                                                </button>
                                                            )}
                                                            <span className="t-timestamp">{timeAgo(tx.timestamp)}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="t-fill-time">{tx.status === 'completed' || tx.destTxHash ? '1s' : '-'}</span>
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
                isSuccess={isRemintSuccess}
                mintHash={newMintHash}
                mintingStep={mintingStep}
                onClose={() => {
                    setIsRemintOpen(false);
                    setIsRemintSuccess(false);
                    setNewMintHash(null);
                    setMintingStep(null);
                }}
                onConfirm={confirmRemint}
                tx={selectedTx}
                isMinting={isMinting}
            />
        </div>
    );
}

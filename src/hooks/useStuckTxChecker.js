import { useEffect, useRef } from 'react';
import { checkNonceUsedOnChain } from '../services/attestationService';

const IRIS_API = 'https://iris-api-sandbox.circle.com/v2/messages';
const ANALYTICS_URL = import.meta.env.VITE_ANALYTICS_URL;
const BRIDGE_ID = import.meta.env.VITE_BRIDGE_ID;

// Arc Testnet is a custom chain — Circle's Iris API does NOT index it.
// For Arc → X bridges (which use Circle's forwarder/relay), we must poll
// our own backend for the mint hash instead of querying Iris.
const ARC_SOURCE_CHAINS = ['Arc Testnet', 'Arc_Testnet'];

const TWENTY_SEC_MS = 20 * 1000;
const TWO_MIN_MS    = 2 * 60 * 1000;
const TEN_MIN_MS    = 10 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;

/**
 * useStuckTxChecker
 *
 * Automatically detects "Processing" transactions belonging to the connected
 * wallet that have been stuck, then resolves them via two strategies:
 *
 * STRATEGY A — Arc Source (Auto/Relay mode):
 *   Arc Testnet burns go through Circle's forwarder. Iris does NOT index Arc txs.
 *   Instead, we poll our own backend (/activity/tx?burnTxHash=...) every 15s
 *   until it reports a mintTxHash (the relay has completed).
 *
 * STRATEGY B — Standard CCTP chains (Sepolia, Base, etc.):
 *   Query Circle's Iris API for the sourceTxHash.
 *   Iris has destTxHash  → mint completed, report to backend
 *   Iris status=complete → attestation done, no mint → set mint_failed (Remint button)
 *   Iris status=pending  → still attesting → mark attested (accurate Processing)
 *   Iris 404 + >30 min  → attestation failed → Re-attest button
 */
export function useStuckTxChecker(allTransactions, address, onRecovered) {
    const pollingRef = useRef(null);

    useEffect(() => {
        // Clear any previous polling interval
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }

        if (!address || !allTransactions.length) return;

        const now = Date.now();

        const stuckTxs = allTransactions.filter(tx => {
            if (tx.status !== 'processing') return false;
            if (tx.sender?.toLowerCase() !== address.toLowerCase()) return false;
            const txTime = parseInt(tx.timestamp) * 1000;
            // Arc relay completes fast (forwarder) — check after just 20s so
            // a fresh auto-mode bridge shows Completed almost immediately.
            // Standard chains need longer (10min) since they require manual attestation.
            const threshold = ARC_SOURCE_CHAINS.includes(tx.fromChain) ? TWENTY_SEC_MS : TEN_MIN_MS;
            return (now - txTime) > threshold;
        });

        if (stuckTxs.length === 0) return;

        console.log(`[StuckChecker] 🔍 Found ${stuckTxs.length} stuck transaction(s) to check...`);

        // ── Patch the backend status directly ────────────────────────────────
        const forceStatus = async (burnTxHash, status) => {
            try {
                const res = await fetch(`${ANALYTICS_URL}/track/status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ burnTxHash, bridgeId: BRIDGE_ID, status }),
                });
                const data = await res.json();
                if (data.success && !data.skipped) {
                    console.log(`[StuckChecker] ✅ ${burnTxHash} → ${status}`);
                    return true;
                }
                if (data.skipped) {
                    console.log(`[StuckChecker] ⏭ ${burnTxHash} already ${data.status} — skipped`);
                }
            } catch (err) {
                console.warn(`[StuckChecker] forceStatus failed for ${burnTxHash}:`, err.message);
            }
            return false;
        };

        // ── STRATEGY A: Poll backend + Iris fallback for Arc relay mints ─────
        const checkArcTx = async (tx) => {
            const burnTxHash = tx.sourceTxHash;
            if (!burnTxHash) return false;

            const txAgeMs = now - parseInt(tx.timestamp) * 1000;

            // ── Layer 1: Ask backend if it has the relay mint callback ────────
            try {
                const res = await fetch(
                    `${ANALYTICS_URL}/activity/tx?burnTxHash=${burnTxHash}&bridgeId=${BRIDGE_ID}`
                );
                if (res.ok) {
                    const data = await res.json();
                    const mintTxHash = data?.mintTxHash || data?.transaction?.mintTxHash;
                    if (mintTxHash) {
                        console.log(`[StuckChecker] ✅ Arc relay completed (backend) for ${burnTxHash}`);
                        await fetch(`${ANALYTICS_URL}/track/mint`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ burnTxHash, mintTxHash, bridgeId: BRIDGE_ID, success: true }),
                        });
                        return true;
                    }
                }
            } catch (err) {
                console.warn(`[StuckChecker] Arc backend poll failed for ${burnTxHash}:`, err.message);
            }

            // ── Layer 2: Backend has no mintTxHash — try Iris directly ────────
            // Circle's Iris may return the destinationTransaction for relay-completed
            // CCTP messages even when the source is Arc (a custom chain).
            // This recovers old txs where Bridge.jsx never called sdk.trackMint().
            if (txAgeMs > 2 * 60 * 1000) { // only try after 2min to avoid false negatives
                try {
                    const irisRes = await fetch(`${IRIS_API}?sourceTxHash=${burnTxHash}`);
                    if (irisRes.ok) {
                        const irisData = await irisRes.json();
                        const destTxHash = irisData?.messages?.[0]?.destinationTransaction?.transactionHash;
                        if (destTxHash) {
                            console.log(`[StuckChecker] ✅ Arc relay found via Iris for ${burnTxHash} → ${destTxHash}`);
                            await fetch(`${ANALYTICS_URL}/track/mint`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ burnTxHash, mintTxHash: destTxHash, bridgeId: BRIDGE_ID, success: true }),
                            });
                            return true;
                        }
                        console.log(`[StuckChecker] ⏳ Iris has no destTx for Arc burn ${burnTxHash} yet`);
                    }
                } catch (err) {
                    console.warn(`[StuckChecker] Iris fallback failed for ${burnTxHash}:`, err.message);
                }
            }

            // ── Layer 3: On-chain usedNonces check on destination chain ──────
            // Reads the CCTP MessageTransmitter.usedNonces() mapping directly.
            // This definitively confirms whether the relay already minted,
            // even when the backend and Iris have no record.
            if (tx.toChain) {
                try {
                    const nonceUsed = await checkNonceUsedOnChain({
                        burnTxHash,
                        fromChain: tx.fromChain,
                        toChain: tx.toChain,
                    });
                    if (nonceUsed) {
                        console.log(`[StuckChecker] ✅ usedNonces confirms relay minted for ${burnTxHash}`);
                        await fetch(`${ANALYTICS_URL}/track/status`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ burnTxHash, bridgeId: BRIDGE_ID, status: 'minted' }),
                        });
                        return true;
                    }
                } catch (err) {
                    console.warn(`[StuckChecker] usedNonces check failed for ${burnTxHash}:`, err.message);
                }
            }

            console.log(`[StuckChecker] ⏳ Arc relay still pending for ${burnTxHash} — keeping as Processing`);
            return false;
        };


        // ── STRATEGY B: Query Circle Iris for standard CCTP chains ───────────
        const checkIrisTx = async (tx) => {
            const burnTxHash = tx.sourceTxHash;
            if (!burnTxHash) return false;

            const txAgeMs = now - parseInt(tx.timestamp) * 1000;

            try {
                const irisRes = await fetch(`${IRIS_API}?sourceTxHash=${burnTxHash}`);

                if (irisRes.ok) {
                    const irisData = await irisRes.json();
                    const messages = irisData?.messages || [];

                    if (messages.length > 0) {
                        const msg = messages[0];
                        const irisStatus = msg.status;
                        const destTxHash = msg.destinationTransaction?.transactionHash;

                        if (destTxHash) {
                            // Mint already confirmed on-chain — report it to backend
                            console.log(`[StuckChecker] Iris found destTx for ${burnTxHash} — marking COMPLETED`);
                            await fetch(`${ANALYTICS_URL}/track/mint`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    burnTxHash,
                                    mintTxHash: destTxHash,
                                    bridgeId: BRIDGE_ID,
                                    success: true,
                                }),
                            });
                            return true;

                        } else if (irisStatus === 'complete') {
                                // Attestation done. Before marking as mint_failed, check if:
                                // 1. The backend relay already recorded a mint (auto-mode forwarder)
                                // 2. localStorage says this was an auto-mode bridge
                                let relayAlreadyMinted = false;
                                try {
                                    const backendRes = await fetch(
                                        `${ANALYTICS_URL}/activity/tx?burnTxHash=${burnTxHash}&bridgeId=${BRIDGE_ID}`
                                    );
                                    if (backendRes.ok) {
                                        const bd = await backendRes.json();
                                        const mintTx = bd?.mintTxHash || bd?.transaction?.mintTxHash;
                                        if (mintTx) {
                                            console.log(`[StuckChecker] Relay already minted for ${burnTxHash}`);
                                            relayAlreadyMinted = true;
                                        }
                                    }
                                } catch (_) { /* ignore */ }

                                // Arc Testnet source bridges ALWAYS use auto/forwarder mode —
                                // this is a protocol fact, not a user setting.
                                // localStorage is only a secondary fallback for other chains.
                                const isArcSource = ARC_SOURCE_CHAINS.includes(tx.fromChain);
                                const isAutoMode = isArcSource || localStorage.getItem(`mintMode_${burnTxHash}`) === 'auto';

                                if (relayAlreadyMinted) {
                                    return true; // trigger refetch, backend is already correct
                                } else if (isAutoMode) {
                                    // Relay still processing — keep as attested, do NOT show Remint button
                                    console.log(`[StuckChecker] Auto-mode relay pending for ${burnTxHash} — keeping attested`);
                                    return await forceStatus(burnTxHash, 'attested');
                                } else {
                                    // Manual mode: attestation ready, mint never sent → show Remint button
                                    const updated = await forceStatus(burnTxHash, 'attested');
                                    if (updated) await forceStatus(burnTxHash, 'mint_failed');
                                    return updated;
                                }

                        } else if (irisStatus === 'pending') {
                            // Still attesting — update DB accurately
                            return await forceStatus(burnTxHash, 'attested');
                        }

                    } else if (txAgeMs > THIRTY_MIN_MS) {
                        // Iris has no record + very old → show Re-attest button
                        console.log(`[StuckChecker] Iris empty + >30min → attestation_failed for ${burnTxHash}`);
                        return await forceStatus(burnTxHash, 'attestation_failed');
                    }

                } else if (irisRes.status === 404 && txAgeMs > THIRTY_MIN_MS) {
                    return await forceStatus(burnTxHash, 'attestation_failed');
                }

            } catch (err) {
                console.warn(`[StuckChecker] Iris check failed for ${burnTxHash}:`, err.message);
            }
            return false;
        };

        // ── Main check loop ───────────────────────────────────────────────────
        const runOnce = async () => {
            let anyRecovered = false;

            for (const tx of stuckTxs) {
                const isArcSource = ARC_SOURCE_CHAINS.includes(tx.fromChain);
                const recovered = isArcSource
                    ? await checkArcTx(tx)
                    : await checkIrisTx(tx);

                if (recovered) anyRecovered = true;
                // Delay between checks to avoid hammering APIs
                await new Promise(r => setTimeout(r, 800));
            }

            if (anyRecovered) {
                console.log('[StuckChecker] Recovery complete — refreshing activity...');
                setTimeout(onRecovered, 500);
            }
        };

        // Run immediately, then poll every 15s for Arc txs
        runOnce();

        const hasArcTxs = stuckTxs.some(tx => ARC_SOURCE_CHAINS.includes(tx.fromChain));
        if (hasArcTxs) {
            console.log('[StuckChecker] Arc relay tx found — starting 15s polling...');
            pollingRef.current = setInterval(runOnce, 15_000);
        }

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };

    }, [allTransactions, address]); // eslint-disable-line react-hooks/exhaustive-deps
}

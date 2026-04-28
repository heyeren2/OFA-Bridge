import { useEffect } from 'react';

const IRIS_API = 'https://iris-api-sandbox.circle.com/v2/messages';
const ANALYTICS_URL = import.meta.env.VITE_ANALYTICS_URL;
const BRIDGE_ID = import.meta.env.VITE_BRIDGE_ID;

const TEN_MIN_MS   = 10 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;

/**
 * useStuckTxChecker
 *
 * Automatically detects "Processing" transactions belonging to the connected
 * wallet that have been stuck for more than 10 minutes, then queries Circle's
 * Iris API to determine the correct recovery status and patches the backend.
 *
 * Decision logic:
 *   Iris has destTxHash  → already minted, let poller pick it up (mark attested)
 *   Iris status=complete → attestation done, no mint → set mint_failed (Remint button)
 *   Iris status=pending  → still attesting → set attested (accurate Processing)
 *   Iris 404 + >30 min  → Circle never indexed it → set attestation_failed (Re-attest button)
 *
 * @param {object[]} allTransactions - Current transaction list from Activity state
 * @param {string}   address         - Connected wallet address
 * @param {Function} onRecovered     - Called after any status update (triggers refetch)
 */
export function useStuckTxChecker(allTransactions, address, onRecovered) {
    useEffect(() => {
        if (!address || !allTransactions.length) return;

        const now = Date.now();

        // Only check "Processing" txs owned by the connected wallet older than 10 min
        const stuckTxs = allTransactions.filter(tx => {
            if (tx.status !== 'processing') return false;
            if (tx.sender?.toLowerCase() !== address.toLowerCase()) return false;
            const txTime = parseInt(tx.timestamp) * 1000;
            return (now - txTime) > TEN_MIN_MS;
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

        // ── Check each stuck tx against Circle's Iris API ────────────────────
        const checkAll = async () => {
            let anyRecovered = false;

            for (const tx of stuckTxs) {
                const burnTxHash = tx.sourceTxHash;
                if (!burnTxHash) continue;

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
                                // Mint already confirmed on-chain (likely via Circle Relay/Auto-mode)
                                // Report the actual mint hash to the backend so it shows as 'Completed'
                                console.log(`[StuckChecker] Iris found destTx for ${burnTxHash} — marking as COMPLETED`);
                                try {
                                    await fetch(`${ANALYTICS_URL}/track/mint`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            burnTxHash,
                                            mintTxHash: destTxHash,
                                            bridgeId: BRIDGE_ID,
                                            success: true
                                        }),
                                    });
                                    anyRecovered = true;
                                } catch (e) {
                                    console.warn('[StuckChecker] Failed to report recovered mint:', e.message);
                                }

                            } else if (irisStatus === 'complete') {
                                // Attestation done, mint never happened → show Remint button
                                const updated = await forceStatus(burnTxHash, 'attested');
                                if (updated) await forceStatus(burnTxHash, 'mint_failed');
                                anyRecovered = updated;

                            } else if (irisStatus === 'pending') {
                                // Still waiting for Circle attestation — update DB to attested
                                const updated = await forceStatus(burnTxHash, 'attested');
                                anyRecovered = anyRecovered || updated;
                            }
                            // irisStatus === 'failed' or unknown → leave as-is

                        } else if (txAgeMs > THIRTY_MIN_MS) {
                            // Iris has no record at all + tx is very old → show Re-attest button
                            console.log(`[StuckChecker] Iris empty + >30min → attestation_failed for ${burnTxHash}`);
                            const updated = await forceStatus(burnTxHash, 'attestation_failed');
                            anyRecovered = anyRecovered || updated;
                        }

                    } else if (irisRes.status === 404 && txAgeMs > THIRTY_MIN_MS) {
                        // Hard 404 + old tx → mark attestation failed
                        const updated = await forceStatus(burnTxHash, 'attestation_failed');
                        anyRecovered = anyRecovered || updated;
                    }

                } catch (err) {
                    console.warn(`[StuckChecker] Iris check failed for ${burnTxHash}:`, err.message);
                }
            }

            // Trigger Activity refetch so updated statuses are visible
            if (anyRecovered) {
                console.log('[StuckChecker] Recovery complete — refreshing activity...');
                setTimeout(onRecovered, 500);
            }
        };

        checkAll();

    // Only re-run when the transaction list or connected address changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allTransactions, address]);
}

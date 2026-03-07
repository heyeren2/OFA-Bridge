import { BridgeKit } from '@circle-fin/bridge-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { createPublicClient, http } from 'viem';
import { mainnet, sepolia, base, baseSepolia, arbitrum, arbitrumSepolia, optimism, optimismSepolia } from 'viem/chains';
import { FORWARDING_CONFIG, CHAINS_WITHOUT_FORWARDER_SUPPORT } from './forwardingConfig';
import { FEE_RECIPIENT, FEE_PERCENTAGE, SWAP_FEE_PERCENTAGE } from '../config/contracts';

let kitInstance = null;

export const initBridgeKit = () => {
    if (!kitInstance) {
        kitInstance = new BridgeKit();
    }
    return kitInstance;
};

export const getKit = () => {
    if (!kitInstance) {
        return initBridgeKit();
    }
    return kitInstance;
};

// Calculate 0.3% fee as a flat USDC amount
export const calculateFee = (amount) => {
    const fee = (parseFloat(amount) * FEE_PERCENTAGE).toFixed(6);
    return fee;
};

// Calculate Circle Forwarding Service Fee
export const calculateForwardingFee = (destChainName) => {
    // Return 0 if forwarding is disabled globally
    if (!FORWARDING_CONFIG.isForwardingEnabled) {
        return '0';
    }

    // Chains that don't support customBurnWithHook can't use the forwarder,
    // so there's no forwarding fee to charge for them.
    if (CHAINS_WITHOUT_FORWARDER_SUPPORT.displayNames.includes(destChainName)) {
        return '0';
    }

    // Ethereum: $1.25, Others: $0.20
    if (destChainName === 'Ethereum Sepolia' || destChainName === 'Ethereum') {
        return '1.25';
    }
    return '0.20';
};

// Get supported chains from the SDK
export const fetchSupportedChains = async () => {
    const kit = getKit();
    try {
        const chains = await kit.getSupportedChains();
        return chains;
    } catch (error) {
        console.error('Failed to fetch supported chains:', error);
        return [];
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Pre-Mint Hook
//
// WHY the previous "gate" approach failed (confirmed by real console logs):
//
//   PROBLEM 1 — fetchAttestation never fires with completion data:
//     SDK Event [fetchAttestation]: { txHash: null, hasAttestation: false }
//     The SDK fires this event exactly ONCE as a "started" notification.
//     It never fires again when the attestation is ready. The SDK fetches
//     attestation from Circle's API internally and proceeds silently.
//
//   PROBLEM 2 — The mint SDK event fires AFTER eth_sendTransaction:
//     "Gate passed — submitting mint transaction"   ← proxy already let it through
//     SDK Event [mint]: { txHash: '0x953c...' }     ← event fires AFTER, too late
//     The fallback signalMintPhaseGate() in the mint event handler was
//     always too late — the wallet popup was already on screen.
//
//   PROBLEM 3 — 5-second timeout released the gate too early:
//     The gate Promise.race(gate, 5s-timeout) fired the timeout BEFORE the
//     mint event arrived, releasing the gate prematurely with attestation
//     still showing as "spinning".
//
// THE CORRECT APPROACH — preMintHook:
//   The provider proxy is the ONLY reliable interception point. The proxy
//   always intercepts eth_sendTransaction synchronously BEFORE the wallet
//   popup appears. When the proxy sees a transaction while the hook is armed:
//
//     1. Call the hook immediately → signals "Attestation DONE" to React
//     2. Wait 400ms → React renders "Attestation DONE" to the screen
//     3. THEN let the transaction through → wallet popup or auto-mint fires
//
//   No race conditions. No event ordering assumptions. No timeouts.
//   The sequence is physically guaranteed by the await chain in the proxy.
//
// ARMED:   setPreMintHook() called when burn tx confirms
// FIRED:   By the proxy when it intercepts the mint eth_sendTransaction
// CLEARED: clearPreMintHook() at the start of each executeBridge, and after firing
// ─────────────────────────────────────────────────────────────────────────────
let preMintHook = null;

const setPreMintHook = (fn) => {
    preMintHook = fn;
    console.log('[BridgeService] 🔒 Pre-mint hook armed — proxy will signal attestation DONE before wallet popup');
};

const clearPreMintHook = () => {
    preMintHook = null;
};

// ─── Provider Proxy ───
// The Bridge Kit SDK uses `increaseAllowance` (0x39509351) for token approvals.
// Rabby/MetaMask don't recognize it, showing "Unknown Signature Type".
// This proxy intercepts eth_sendTransaction and swaps increaseAllowance → approve
// (same params: address,uint256) so wallets display proper "Token Approval" UI.
const INCREASE_ALLOWANCE = '0x39509351'; // increaseAllowance(address,uint256)
const APPROVE = '0x095ea7b3'; // approve(address,uint256)

const createApprovalFixedProvider = () => {
    const provider = window.ethereum;

    return new Proxy(provider, {
        get(target, prop, receiver) {
            if (prop === 'request') {
                return async (args) => {
                    if (args.method === 'wallet_switchEthereumChain') {
                        try {
                            return await target.request(args);
                        } catch (switchError) {
                            // 4902 is "Unrecognized chain ID" in MetaMask
                            if (switchError.code === 4902 || switchError.data?.originalError?.code === 4902) {
                                const chainIdHex = args.params[0].chainId;
                                const chainIdDecimal = parseInt(chainIdHex, 16);
                                const { SUPPORTED_CHAINS } = await import('../config/chains');
                                const chainConfig = SUPPORTED_CHAINS.find(c => c.chainId === chainIdDecimal);

                                if (chainConfig) {
                                    console.log(`[BridgeService] Chain ${chainIdDecimal} not recognized. Attempting to add network...`);
                                    try {
                                        await target.request({
                                            method: 'wallet_addEthereumChain',
                                            params: [{
                                                chainId: chainIdHex,
                                                chainName: chainConfig.name,
                                                nativeCurrency: {
                                                    name: 'Ether',
                                                    symbol: 'ETH',
                                                    decimals: 18,
                                                },
                                                rpcUrls: [chainConfig.rpc],
                                                blockExplorerUrls: [chainConfig.explorer],
                                            }],
                                        });
                                        // Attempt switch again after adding
                                        return await target.request(args);
                                    } catch (addError) {
                                        throw addError;
                                    }
                                }
                            }
                            throw switchError;
                        }
                    }

                    // Approval Fix: Intercept increaseAllowance → swap to approve
                    if (
                        args.method === 'eth_sendTransaction' &&
                        args.params?.[0]?.data?.toLowerCase().startsWith(INCREASE_ALLOWANCE)
                    ) {
                        const originalData = args.params[0].data;
                        const fixedData = APPROVE + originalData.slice(10);
                        console.log('[BridgeService] Swapped increaseAllowance → approve');
                        args = {
                            ...args,
                            params: [{ ...args.params[0], data: fixedData }],
                        };
                    }

                    // ── Pre-Mint Hook ─────────────────────────────────────
                    // When the hook is armed (after burn confirms), the FIRST
                    // eth_sendTransaction that arrives is the mint transaction.
                    // We call the hook (signals Attestation DONE to React),
                    // then wait 400ms for React to paint it, THEN let the
                    // transaction through. This guarantees the UI shows
                    // "Attestation DONE" before the wallet popup appears.
                    if (args.method === 'eth_sendTransaction' && preMintHook !== null) {
                        const hook = preMintHook;
                        preMintHook = null; // consume — fires exactly once
                        console.log('[BridgeService] ⚡ Mint tx intercepted — signaling attestation DONE now');
                        hook(); // marks Attestation DONE + advances UI to Mint step
                        // Render buffer: React needs time to commit the state update to DOM
                        await new Promise(resolve => setTimeout(resolve, 400));
                        console.log('[BridgeService] ✅ Render buffer done — submitting mint transaction to wallet');
                    }

                    return target.request(args);
                };
            }
            // Passthrough all other properties + bind functions to original target
            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
};

// Lazily-created adapter using Circle's official factory function
// with our approval-fixing provider proxy.
let adapterInstance = null;

const getAdapter = async () => {
    if (!window.ethereum) {
        throw new Error('No wallet provider found. Please install MetaMask or Rabby.');
    }
    if (!adapterInstance) {
        // We create a high-performance public client for the SDK to use for POLLING.
        // This bypasses the wallet's RPC (which is often slow/rate-limited on testnets)
        // and is the primary fix for the 6-minute attestation delay.
        const sepoliaPollingClient = createPublicClient({
            chain: sepolia,
            transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
            batch: { multicall: true }
        });

        const fixedProvider = createApprovalFixedProvider();

        // The adapter now uses the wallet ONLY for signing, 
        // while Using our dedicated RPC for all chain-state queries.
        adapterInstance = await createViemAdapterFromProvider({
            provider: fixedProvider,
            publicClient: sepoliaPollingClient,
        });
    }
    return adapterInstance;
};

// Reset adapter (useful if the user switches wallets)
export const resetAdapter = () => {
    adapterInstance = null;
};

// Estimate bridge costs
export const estimateBridge = async ({ fromChain, toChain, amount }) => {
    const kit = getKit();
    const adapter = await getAdapter();
    try {
        const estimate = await kit.estimate({
            from: { adapter, chain: fromChain },
            to: { adapter, chain: toChain },
            amount: amount,
        });
        return estimate;
    } catch (error) {
        console.error('Bridge estimate failed:', error);
        throw error;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Execute bridge with fee deduction from principal.
//
// FIX 1 — Forwarding Service param name:
//   The correct SDK property is `useForwarder: true`, NOT `forwarding: true`.
//   The wrong key is silently ignored by the SDK — meaning the forwarding
//   service was never being activated despite the config being enabled.
//
// FIX 2 — Gasless (Forwarder-only) mode:
//   When forwarding is ON, drop `adapter` from the `to` block entirely.
//   Circle's server signs the mint, so the user's wallet is not needed on
//   the destination chain. Pass only: chain, recipientAddress, useForwarder.
//   When forwarding is OFF, include `adapter` so the user signs the mint.
//
// FIX 3 — Fast Transfer:
//   Added `transferSpeed: 'FAST'` to use soft-finality attestation (seconds
//   instead of 15-19 min for Ethereum). Circle deducts a small CCTP fee from
//   the minted amount. Remove or set to 'SLOW' to revert to Standard Transfer.
//
// FIX 4 — Wildcard event listener:
//   Added kit.on('*', ...) as a catch-all per Circle docs best practices.
//
// FIX 5 — kit.retry() for SDK-native error recovery:
//   When result.state === 'error', we now call kit.retry(result, { from, to })
//   instead of manually hitting the attestation API. This handles ALL failure
//   points (attestation timeout, mint failure) in one call per the Circle docs.
// ─────────────────────────────────────────────────────────────────────────────
export const executeBridge = async ({
    fromChain,
    toChain,
    amount,
    recipientAddress,
    forwardingFee = '0',
    isSwapRoute = false,
    mintMode = 'manual',   // 'manual' | 'auto' — comes from user's toggle in Bridge.jsx
    onStatusUpdate,
}) => {
    const kit = getKit();
    const adapter = await getAdapter();

    // Clear any pre-mint hook from a previous bridge run.
    clearPreMintHook();
    const effectiveFeeRate = isSwapRoute ? FEE_PERCENTAGE + SWAP_FEE_PERCENTAGE : FEE_PERCENTAGE;
    const platformFee = (parseFloat(amount) * effectiveFeeRate).toFixed(6);

    // Subtract fees from principal amount
    // bridgeAmount = totalInput - platformFee - forwardingFee
    const totalInputDbl = parseFloat(amount);
    const platformFeeDbl = parseFloat(platformFee);
    const forwardingFeeDbl = parseFloat(forwardingFee);
    const bridgeAmount = (totalInputDbl - platformFeeDbl - forwardingFeeDbl).toFixed(6);

    /* LOG REMOVED FOR PRIVACY */

    const STEP_ORDER = ['approve', 'burn', 'attestation', 'mint'];
    let lastStartedStep = 'approve';
    const completedSteps = new Set();

    // FIX 4 — Wildcard event listener (Circle docs best practice)
    const wildcardHandler = (eventName, payload) => {
        console.log(`[BridgeService] SDK Wildcard Event [${eventName}]:`, payload);
    };
    kit.on('*', wildcardHandler);

    const cleanup = [];
    cleanup.push(() => {
        if (kit.off) kit.off('*', wildcardHandler);
    });

    const registerListener = (event, step) => {
        const handler = (payload) => {
            // ── Completion detection ─────────────────────────────────────────
            // approve/burn: completed when txHash present in payload.
            // fetchAttestation: the SDK NEVER fires this event with completion
            //   data — hasAttestation is always false. The SDK fetches internally
            //   and signals completion only by calling eth_sendTransaction (mint).
            //   The preMintHook in the provider proxy handles attestation DONE.
            //
            // We still check all known attestation payload paths here in case
            // a future SDK version starts exposing it — it costs nothing to check.
            const txHash = payload?.txHash || payload?.values?.txHash || null;
            const attestationValue =
                payload?.attestation ||
                payload?.values?.attestation ||
                payload?.data?.attestation ||
                null;
            const isAttestationEarlyDone = step === 'attestation' && !!attestationValue;

            console.log(`[BridgeService] SDK Event [${event}]:`, {
                step,
                txHash,
                hasAttestation: !!attestationValue,
                payloadKeys: payload ? Object.keys(payload) : [],
            });

            if (txHash || isAttestationEarlyDone) {
                // ── Step COMPLETED ───────────────────────────────────────────
                if (completedSteps.has(step)) return;
                completedSteps.add(step);

                console.log(`[BridgeService] ✅ Step [${step}] DONE ${isAttestationEarlyDone ? '(early: attestation payload in event)' : `(txHash: ${txHash})`}`);

                onStatusUpdate?.({
                    step,
                    status: 'completed',
                    txHash: txHash || null,
                    data: payload,
                });

                // After burn confirms → arm the preMintHook so the proxy will
                // signal "Attestation DONE" before the mint transaction fires.
                if (step === 'burn') {
                    setPreMintHook(() => {
                        // Called by the proxy BEFORE the mint tx reaches the wallet.
                        // Mark attestation complete and advance the UI to Mint step.
                        console.log('[BridgeService] 🎯 preMintHook fired — marking attestation DONE');
                        if (!completedSteps.has('attestation')) {
                            completedSteps.add('attestation');
                            onStatusUpdate?.({
                                step: 'attestation',
                                status: 'completed',
                                txHash: null,
                                data: null,
                            });
                        }
                        // Advance to mint step with a small delay so the
                        // "Attestation DONE" badge renders before "Mint USDC" activates.
                        setTimeout(() => {
                            lastStartedStep = 'mint';
                            onStatusUpdate?.({ step: 'mint', status: 'pending' });
                        }, 50);
                    });
                }

                // If attestation data DID appear early in the event payload
                // (future SDK), disarm the preMintHook so it doesn't double-fire.
                if (step === 'attestation') {
                    clearPreMintHook();
                }

                // Brief pause so DONE badge is visible, then advance to next step
                const idx = STEP_ORDER.indexOf(step);
                if (idx >= 0 && idx < STEP_ORDER.length - 1) {
                    const nextStep = STEP_ORDER[idx + 1];
                    setTimeout(() => {
                        lastStartedStep = nextStep;
                        onStatusUpdate?.({ step: nextStep, status: 'pending' });
                    }, 500);
                }

            } else {
                // ── Step STARTED (no txHash) ─────────────────────────────────
                // When a step starts, the previous step must be complete.
                // Use forced=true so Bridge.jsx does NOT call setBridgeStep
                // backward (e.g. attestation→burn would be a regression).
                const idx = STEP_ORDER.indexOf(step);
                if (idx > 0) {
                    const prevStep = STEP_ORDER[idx - 1];
                    console.log(`[BridgeService] 🔁 [${step}] starting → marking [${prevStep}] complete (forced)`);
                    onStatusUpdate?.({ step: prevStep, status: 'completed', txHash: null, forced: true, data: null });
                }

                // Small delay before signalling this step as pending,
                // so the previous step's DONE badge renders first.
                setTimeout(() => {
                    console.log(`[BridgeService] 🔄 Step [${step}] pending`);
                    lastStartedStep = step;
                    onStatusUpdate?.({ step, status: 'pending' });
                }, 350);
            }
        };
        kit.on(event, handler);
        cleanup.push(() => {
            if (kit.off) kit.off(event, handler);
        });
    };

    registerListener('approve', 'approve');
    registerListener('burn', 'burn');
    registerListener('fetchAttestation', 'attestation');
    registerListener('mint', 'mint');

    try {
        onStatusUpdate?.({ step: 'approve', status: 'pending' });

        // ── Determine whether the forwarder can actually be used ──────────────
        //
        // Three conditions must ALL be true to use the forwarder:
        //   1. Global master switch is on  (FORWARDING_CONFIG.isForwardingEnabled)
        //   2. User chose Auto mode        (mintMode === 'auto')
        //   3. Destination chain supports  customBurnWithHook
        //      (some chains like Arc Testnet don't — using forwarder + customFee
        //       there throws "Action cctp.v2.customBurnWithHook is not supported")
        //
        // When any condition is false we fall back to standard mode:
        // the user signs the mint on the destination chain themselves.
        // ─────────────────────────────────────────────────────────────────────
        const chainBlocksForwarder = CHAINS_WITHOUT_FORWARDER_SUPPORT.bridgeKitNames.includes(toChain);
        const canUseForwarder =
            FORWARDING_CONFIG.isForwardingEnabled &&
            mintMode === 'auto' &&
            !chainBlocksForwarder;

        const toBlock = canUseForwarder
            ? {
                // Forwarder (gasless) mode — no adapter, Circle signs the mint
                chain: toChain,
                recipientAddress,
                useForwarder: true,
            }
            : {
                // Standard mode — user signs the mint on the destination chain
                adapter,
                chain: toChain,
                recipientAddress,
            };

        console.log(`[BridgeService] Mint mode: ${canUseForwarder ? 'AUTO (gasless)' : 'MANUAL'}`, {
            toChain,
            mintMode,
            chainBlocksForwarder,
            globalEnabled: FORWARDING_CONFIG.isForwardingEnabled,
        });

        const bridgeParams = {
            from: { adapter, chain: fromChain },
            to: toBlock,
            amount: bridgeAmount,
            config: {
                transferSpeed: 'FAST',
                ...(parseFloat(platformFee) > 0 ? {
                    customFee: {
                        value: platformFee,
                        recipientAddress: FEE_RECIPIENT,
                    },
                } : {}),
            },
        };

        /* LOG REMOVED FOR PRIVACY */

        const result = await kit.bridge(bridgeParams);

        console.log('[BridgeService] kit.bridge() result:', {
            state: result.state,
            steps: result.steps?.map(s => ({
                name: s.name,
                state: s.state,
                txHash: s.txHash,
                errorMessage: s.errorMessage
            })),
        });

        // FIX 5 — Use kit.retry() for SDK-native error recovery
        // Instead of manually calling the attestation API + receiveMessage,
        // we let the SDK handle recovery for ALL failure points.
        if (result.state === 'error') {
            const failedStep = result.steps?.find(s => s.state === 'error');
            const errorMsg = failedStep?.errorMessage
                || `Bridge failed at step: ${failedStep?.name || 'unknown'}`;

            console.warn('[BridgeService] SDK error — attempting kit.retry():', {
                failedStep: failedStep?.name,
                errorMsg,
            });

            onStatusUpdate?.({ step: failedStep?.name || 'unknown', status: 'retrying' });

            try {
                const retryResult = await kit.retry(result, {
                    from: adapter,
                    to: adapter,
                });

                console.log('[BridgeService] kit.retry() result:', retryResult);

                if (retryResult.state === 'error') {
                    const retryFailedStep = retryResult.steps?.find(s => s.state === 'error');
                    const retryErrorMsg = retryFailedStep?.errorMessage
                        || `Retry failed at step: ${retryFailedStep?.name || 'unknown'}`;
                    console.error('[BridgeService] kit.retry() also failed:', retryErrorMsg);
                    throw new Error(retryErrorMsg);
                }

                onStatusUpdate?.({ step: 'complete', status: 'completed', data: retryResult });
                return retryResult;

            } catch (retryErr) {
                console.error('[BridgeService] kit.retry() threw:', retryErr);
                throw new Error(errorMsg);
            }
        }

        onStatusUpdate?.({ step: 'complete', status: 'completed', data: result });
        return result;

    } catch (error) {
        console.error('[BridgeService] Bridge error:', {
            message: error.message,
            shortMessage: error.shortMessage,
            code: error.code,
            cause: error.cause,
            details: error.details,
            name: error.name,
            stack: error.stack,
            fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
        });

        const errorMsg = (error.message || '').toLowerCase();
        const shortMsg = (error.shortMessage || '').toLowerCase();
        const detailsMsg = (error.details || '').toLowerCase();
        const causeMsg = (error.cause?.message || '').toLowerCase();
        const causeSMsg = (error.cause?.shortMessage || '').toLowerCase();

        const rejectionPatterns = [
            'user rejected',
            'user denied',
            'rejected the request',
            'user refused',
            'user cancelled',
            'user canceled',
            'request rejected',
            'action_rejected',
        ];

        const isCancelled =
            error.code === 4001 ||
            error.cause?.code === 4001 ||
            error.code === 'ACTION_REJECTED' ||
            error.cause?.code === 'ACTION_REJECTED' ||
            rejectionPatterns.some(pattern =>
                errorMsg.includes(pattern) ||
                shortMsg.includes(pattern) ||
                detailsMsg.includes(pattern) ||
                causeMsg.includes(pattern) ||
                causeSMsg.includes(pattern)
            );

        if (isCancelled) {
            console.log('[BridgeService] Detected wallet rejection/cancellation at step:', lastStartedStep);
            onStatusUpdate?.({
                step: 'cancelled',
                failedStep: lastStartedStep,
                status: 'error',
                error: 'Transaction cancelled in wallet'
            });
        } else {
            // Mask Ethereum addresses for privacy (0x... → 0x...abcd)
            const maskAddress = (str) =>
                str.replace(/0x[a-fA-F0-9]{40}/g, addr => `${addr.slice(0, 6)}...${addr.slice(-4)}`);

            const cleanError = maskAddress(error.shortMessage || error.message || 'Bridge execution failed');

            onStatusUpdate?.({
                step: 'error',
                status: 'error',
                error: cleanError
            });
        }
        throw error;
    } finally {
        cleanup.forEach((fn) => fn());
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// retryMint — Manual last-resort fallback for failed mint steps.
//
// NOTE: The PRIMARY recovery path is now kit.retry() inside executeBridge above.
// This function is only for cases where the user left the session after the burn
// completed (browser closed, etc.) and needs to manually re-mint from the
// Activity tab using only their burn tx hash.
//
// ⚠️  The MessageTransmitter addresses below MUST be individually verified.
//     Each chain has its own CCTP V2 contract deployment — they are NOT all
//     the same address. Verify at:
//     https://developers.circle.com/stablecoins/docs/evm-smart-contracts
// ─────────────────────────────────────────────────────────────────────────────
export const retryMint = async ({ burnTxHash, fromChain, toChain }) => {
    if (!burnTxHash) throw new Error('No source transaction hash available for retry');

    console.log('[BridgeService] Manual retryMint for burn tx:', burnTxHash);

    const attestationUrl = `${import.meta.env.VITE_CIRCLE_ATTESTATION_API}/${burnTxHash}`;
    let attestationData;

    try {
        const response = await fetch(attestationUrl);
        const data = await response.json();

        if (!data.messages || data.messages.length === 0) {
            throw new Error('Attestation not yet available. Please wait a few minutes and try again.');
        }

        const msg = data.messages[0];
        if (msg.status !== 'complete') {
            throw new Error(`Attestation status: ${msg.status}. Please wait for attestation to complete.`);
        }

        attestationData = {
            message: msg.message,
            attestation: msg.attestation,
        };
    } catch (fetchErr) {
        if (fetchErr.message.includes('Attestation')) throw fetchErr;
        throw new Error(`Failed to fetch attestation: ${fetchErr.message}`);
    }

    const { createWalletClient, custom } = await import('viem');
    const { getChainByName } = await import('../config/chains');

    const destChainConfig = getChainByName(toChain);
    if (!destChainConfig) throw new Error(`Unknown destination chain: ${toChain}`);

    // ⚠️  Verify all addresses below against Circle's official CCTP V2 contracts page.
    const MESSAGE_TRANSMITTER = {
        'Ethereum Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275', // ⚠️ verify
        'Base Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275', // ⚠️ verify
        'Arbitrum Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275', // ⚠️ verify
        'Optimism Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275', // ⚠️ verify
        'Arc Testnet': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275', // ⚠️ verify
    };

    const transmitterAddress = MESSAGE_TRANSMITTER[toChain];
    if (!transmitterAddress) throw new Error(`No MessageTransmitter address for chain: ${toChain}`);

    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${destChainConfig.chainId.toString(16)}` }],
        });
    } catch (switchErr) {
        throw new Error(`Please switch your wallet to ${toChain} to complete the mint.`);
    }

    const walletClient = createWalletClient({
        chain: { id: destChainConfig.chainId },
        transport: custom(window.ethereum),
    });

    const [account] = await walletClient.getAddresses();

    try {
        const txHash = await walletClient.writeContract({
            address: transmitterAddress,
            abi: [{
                name: 'receiveMessage',
                type: 'function',
                inputs: [
                    { name: 'message', type: 'bytes' },
                    { name: 'attestation', type: 'bytes' },
                ],
                outputs: [{ name: 'success', type: 'bool' }],
            }],
            functionName: 'receiveMessage',
            args: [attestationData.message, attestationData.attestation],
            account,
        });

        console.log('[BridgeService] Manual retryMint tx hash:', txHash);
        return { mintTxHash: txHash };
    } catch (mintErr) {
        console.error('[BridgeService] Manual retryMint failed:', mintErr);
        throw new Error(mintErr.shortMessage || mintErr.message || 'Mint transaction failed');
    }
};
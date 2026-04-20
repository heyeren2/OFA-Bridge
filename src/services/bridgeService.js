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

let preMintHook = null;

const setPreMintHook = (fn) => {
    preMintHook = fn;
    console.log('[BridgeService] Pre-mint hook armed');
};

const clearPreMintHook = () => {
    preMintHook = null;
};

const INCREASE_ALLOWANCE = '0x39509351'; // increaseAllowance(address,uint256)
const APPROVE = '0x095ea7b3'; // approve(address,uint256)

const createApprovalFixedProvider = (fullAmount) => {
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
                                                nativeCurrency: chainConfig.nativeCurrency || {
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

                    const data = args.params?.[0]?.data?.toLowerCase() || '';

                    // 1. Force the approval amount to be the FULL input amount (e.g. 10 USDC instead of 9.5)
                    if (fullAmount && (data.startsWith(INCREASE_ALLOWANCE) || data.startsWith(APPROVE))) {
                        try {
                            // Assume 6 decimals for USDC/EURC on testnets
                            const fullAmtRaw = BigInt(Math.floor(parseFloat(fullAmount) * 1e6));
                            const fullAmtHex = fullAmtRaw.toString(16).padStart(64, '0');
                            const prefix = data.substring(0, 10 + 64); // sig (10) + spender (64)
                            const fixedData = prefix + fullAmtHex;
                            console.log(`[BridgeService] Forcing approval amount: ${fullAmount} (hex: ...${fullAmtHex.slice(-8)})`);
                            args = { ...args, params: [{ ...args.params[0], data: fixedData }] };
                        } catch (e) { console.warn('[BridgeService] Failed to rewrite approval amount:', e); }
                    }

                    // 2. Rewrite increaseAllowance → approve (Arc token compatibility)
                    if (args.method === 'eth_sendTransaction' && data.startsWith(INCREASE_ALLOWANCE)) {
                        const originalData = args.params[0].data;
                        const fixedData = APPROVE + originalData.slice(10);
                        console.log('[BridgeService] Swapped increaseAllowance → approve');
                        args = {
                            ...args,
                            params: [{ ...args.params[0], data: fixedData }],
                        };
                    }

                    if (args.method === 'eth_sendTransaction' && preMintHook !== null) {
                        const hook = preMintHook;
                        preMintHook = null; // consume — fires exactly once
                        console.log('[BridgeService] ⚡ Mint tx intercepted — signaling attestation DONE now');
                        hook(); // marks Attestation DONE + advances UI to Mint step
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

let adapterInstance = null;

const getAdapter = async (fullAmount) => {
    if (!window.ethereum) {
        throw new Error('No wallet provider found. Please install MetaMask or Rabby.');
    }
    // Always recreate adapter if we have a forced amount to ensure proxy freshness
    if (!adapterInstance || fullAmount) {
        // Use high-performance public client for polling to bypass wallet rate limits
        const sepoliaPollingClient = createPublicClient({
            chain: sepolia,
            transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
            batch: { multicall: true }
        });

        const fixedProvider = createApprovalFixedProvider(fullAmount);

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

export const executeBridge = async ({
    fromChain,
    toChain,
    amount,
    fullAmount, // Full amount for proxy rewrite
    recipientAddress,
    forwardingFee = '0',
    isSwapRoute = false,
    mintMode = 'manual',
    onStatusUpdate,
}) => {
    const kit = getKit();
    const adapter = await getAdapter(fullAmount);

    // Clear any pre-mint hook from a previous bridge run.
    clearPreMintHook();
    const effectiveFeeRate = isSwapRoute ? FEE_PERCENTAGE + SWAP_FEE_PERCENTAGE : FEE_PERCENTAGE;
    const platformFee = (parseFloat(amount) * effectiveFeeRate).toFixed(6);

    const totalInputDbl = parseFloat(amount);
    const platformFeeDbl = parseFloat(platformFee);
    const forwardingFeeDbl = parseFloat(forwardingFee);
    const bridgeAmount = (totalInputDbl - platformFeeDbl - forwardingFeeDbl).toFixed(6);

    /* LOG REMOVED FOR PRIVACY */

    const STEP_ORDER = ['approve', 'burn', 'attestation', 'mint'];
    let lastStartedStep = 'approve';
    const completedSteps = new Set();

    // Wildcard event listener
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
                // Step COMPLETED
                if (completedSteps.has(step)) return;
                completedSteps.add(step);

                console.log(`[BridgeService] ✅ Step [${step}] DONE ${isAttestationEarlyDone ? '(early: attestation payload in event)' : `(txHash: ${txHash})`}`);

                onStatusUpdate?.({
                    step,
                    status: 'completed',
                    txHash: txHash || null,
                    data: payload,
                });

                if (step === 'burn') {
                    setPreMintHook(() => {
                        // Signal completion before mint
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
                        setTimeout(() => {
                            lastStartedStep = 'mint';
                            onStatusUpdate?.({ step: 'mint', status: 'pending' });
                        }, 50);
                    });
                }

                // Handle early attestation
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
                const idx = STEP_ORDER.indexOf(step);
                if (idx > 0) {
                    const prevStep = STEP_ORDER[idx - 1];
                    console.log(`[BridgeService] 🔁 [${step}] starting → marking [${prevStep}] complete (forced)`);
                    onStatusUpdate?.({ step: prevStep, status: 'completed', txHash: null, forced: true, data: null });
                }

                // UI sync delay
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

        // SDK-native error recovery
        if (result.state === 'error') {
            const failedStep = result.steps?.find(s => s.state === 'error');
            const errorMsg = failedStep?.errorMessage
                || `Bridge failed at step: ${failedStep?.name || 'unknown'}`;

            // Skip retry if the user rejected the transaction in their wallet
            const rejectionPatterns = [
                'user rejected', 'user denied', 'rejected the request',
                'user refused', 'user cancelled', 'user canceled',
                'request rejected', 'action_rejected',
            ];
            const errLower = (errorMsg || '').toLowerCase();
            const isUserRejection = rejectionPatterns.some(p => errLower.includes(p));

            if (isUserRejection) {
                console.log('[BridgeService] User rejected — skipping kit.retry()');
                throw new Error(errorMsg);
            }

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


export const retryMint = async ({ burnTxHash, fromChain, toChain, cachedAttestation = null, onStatusUpdate }) => {

    if (!burnTxHash) throw new Error('No source transaction hash available for retry');

    console.log('[BridgeService] Manual retryMint for burn tx:', burnTxHash);

    // CCTP Testnet Domain IDs
    const DOMAIN_IDS = {
        'Ethereum Sepolia': 0,
        'Avalanche Fuji': 1,
        'Optimism Sepolia': 2,
        'Arbitrum Sepolia': 3,
        'Base Sepolia': 6,
        'Unichain Sepolia': 10,
        'Monad Testnet': 15, // verify if changed
        'HyperEVM Testnet': 19,
        'Sei Testnet': 16,
        'Linea Sepolia': 11,
        'Ink Testnet': 21,
        'Plume Testnet': 22,
        'Arc Testnet': 26,
    };

    const sourceDomain = DOMAIN_IDS[fromChain] ?? 0;
    const attestationUrl = `${import.meta.env.VITE_CIRCLE_ATTESTATION_API}/${sourceDomain}?transactionHash=${burnTxHash}`;

    let attestationData = null;

    // Fast path: use SDK-cached attestation if available (avoids Circle API race condition)
    if (cachedAttestation?.message && cachedAttestation?.attestation) {
        console.log('[BridgeService] Using cached attestation — skipping Iris API re-fetch');
        attestationData = cachedAttestation;
    } else {
        // Poll Circle's Iris API until attestation is 'complete'
        // Fresh burns can take 20–60s. Re-attestation attempts return immediately if complete.
        // But we always poll to ensure the UI shows the spinner for a meaningful duration.
        const MAX_POLL_ATTEMPTS = 60;  // 5-minute maximum (60 × 5s)
        const POLL_INTERVAL_MS   = 5_000;

        console.log(`[BridgeService] Polling attestation from: ${attestationUrl}`);

        for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
            // Notify the UI which attempt we're on (keeps the spinner moving for fresh burns)
            onStatusUpdate?.({ step: 'attestation_polling', attempt, max: MAX_POLL_ATTEMPTS });

            try {
                const response = await fetch(attestationUrl);

                if (response.ok) {
                    const data = await response.json();
                    const msg  = data.messages?.[0];

                    if (msg?.status === 'complete') {
                        attestationData = { message: msg.message, attestation: msg.attestation };
                        console.log(`[BridgeService] Attestation ready on attempt ${attempt}`);
                        break; // exit poll loop
                    }

                    console.log(`[BridgeService] Poll ${attempt}/${MAX_POLL_ATTEMPTS}: status=${msg?.status ?? 'no message yet'}`);
                } else {
                    console.warn(`[BridgeService] Poll ${attempt}/${MAX_POLL_ATTEMPTS}: HTTP ${response.status}`);
                }
            } catch (fetchErr) {
                console.warn(`[BridgeService] Poll ${attempt}/${MAX_POLL_ATTEMPTS}: fetch error — ${fetchErr.message}`);
            }

            // Wait before trying again (don't wait on the last attempt)
            if (attempt < MAX_POLL_ATTEMPTS) {
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            }
        }

        if (!attestationData) {
            throw new Error(
                'Attestation timed out after 5 minutes. ' +
                'Circle may still be processing this transaction. Please try again in a few minutes.'
            );
        }
    }

    // Signal that attestation is ready — UI marks the attestation step as ✓ DONE
    onStatusUpdate?.({ step: 'attestation_done' });

    // Deliberate 1.5s pause so the user clearly sees the attestation step complete
    // BEFORE the wallet switch prompt or mint tx popup appear.
    await new Promise(r => setTimeout(r, 1500));

    const { createWalletClient, custom } = await import('viem');
    const { getChainByName } = await import('../config/chains');

    const destChainConfig = getChainByName(toChain);
    if (!destChainConfig) throw new Error(`Unknown destination chain: ${toChain}`);

    // Official Circle CCTP Testnet MessageTransmitter Addresses
    const MESSAGE_TRANSMITTER = {
        'Ethereum Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Base Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Arbitrum Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Optimism Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Arc Testnet': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Unichain Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Monad Testnet': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'HyperEVM Testnet': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Sei Testnet': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Linea Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Ink Testnet': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Plume Testnet': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Avalanche Fuji': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
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

        console.log('[BridgeService] Manual retryMint tx submitted:', txHash);

        // Wait for on-chain confirmation before declaring success
        const { createPublicClient, custom } = await import('viem');
        const publicClient = createPublicClient({
            chain: { id: destChainConfig.chainId },
            transport: custom(window.ethereum),
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (receipt.status === 'reverted') {
            // Decode the actual revert reason via attestationService to distinguish:
            // - CCTP V2 message expiry (show Re-Attest)
            // - Nonce already used (a prior successful mint consumed this message)
            const { decodeRevertReason } = await import('./attestationService');
            const reason = await decodeRevertReason({
                transmitterAddress,
                attestationData,
                destChainConfig,
                walletAddress: account,
            });

            if (reason === 'expired') {
                throw new Error('ATTESTATION_EXPIRED: Message expired and must be re-signed by Circle.');
            }

            throw new Error('Nonce already used');
        }

        console.log('[BridgeService] Manual retryMint confirmed on-chain:', txHash);
        return { mintTxHash: txHash };
    } catch (mintErr) {
        const msg = mintErr.shortMessage || mintErr.message || 'Mint transaction failed';
        // Detect CCTP message expiry specifically so the caller can handle it differently
        const isExpired = msg.toLowerCase().includes('message expired') ||
            msg.toLowerCase().includes('must be re-signed') ||
            msg.toLowerCase().includes('expired');
        if (isExpired) {
            throw new Error('ATTESTATION_EXPIRED: ' + msg);
        }
        console.error('[BridgeService] Manual retryMint failed:', mintErr);
        throw new Error(msg);
    }
};
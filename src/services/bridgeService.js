// Bridge service using Circle Bridge Kit — Official API
import { BridgeKit } from '@circle-fin/bridge-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
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
    const fee = (parseFloat(amount) * FEE_PERCENTAGE).toFixed(2);
    return fee;
};

// Calculate Circle Forwarding Service Fee
export const calculateForwardingFee = (destChainName) => {
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
                    if (
                        args.method === 'eth_sendTransaction' &&
                        args.params?.[0]?.data?.toLowerCase().startsWith(INCREASE_ALLOWANCE)
                    ) {
                        // Swap increaseAllowance → approve (identical params layout)
                        const originalData = args.params[0].data;
                        const fixedData = APPROVE + originalData.slice(10); // skip 0x + 8 hex
                        console.log('[BridgeService] Swapped increaseAllowance → approve');
                        args = {
                            ...args,
                            params: [{ ...args.params[0], data: fixedData }],
                        };
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
        const fixedProvider = createApprovalFixedProvider();
        adapterInstance = await createViemAdapterFromProvider({
            provider: fixedProvider,
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

// Execute bridge with fee deduction from principal.
// This ensures the total wallet approval (bridge amount + custom fee) 
// exactly matches the user's input amount.
export const executeBridge = async ({
    fromChain,
    toChain,
    amount,
    recipientAddress,
    forwardingFee = '0',
    isSwapRoute = false,
    onStatusUpdate,
}) => {
    const kit = getKit();
    const adapter = await getAdapter();

    // Calculate platform fee — includes hidden swap fee for swap+bridge routes
    const effectiveFeeRate = isSwapRoute ? FEE_PERCENTAGE + SWAP_FEE_PERCENTAGE : FEE_PERCENTAGE;
    const platformFee = (parseFloat(amount) * effectiveFeeRate).toFixed(2);

    // Subtract fees from principal amount
    // bridgeAmount = totalInput - platformFee - forwardingFee
    const totalInputDbl = parseFloat(amount);
    const platformFeeDbl = parseFloat(platformFee);
    const forwardingFeeDbl = parseFloat(forwardingFee);
    const bridgeAmount = (totalInputDbl - platformFeeDbl - forwardingFeeDbl).toFixed(6);

    console.log('[BridgeService] Fee Deduction Logic:', {
        totalInput: amount,
        platformFee,
        forwardingFee,
        finalBridgeAmount: bridgeAmount
    });

    // Standard 4-step bridge flow:
    // 1. approve — user signs allowance increase
    // 2. burn — user signs burn on source chain
    // 3. fetchAttestation — SDK polls Circle for attestation (no user action)
    // 4. mint — user signs mint on destination chain (SDK prompts chain switch)
    const STEP_ORDER = ['approve', 'burn', 'attestation', 'mint'];

    // Register event listeners for progress tracking.
    const cleanup = [];

    const registerListener = (event, step) => {
        const handler = (payload) => {
            // Mark current step as completed (with tx data)
            onStatusUpdate?.({
                step,
                status: 'completed',
                txHash: payload?.values?.txHash || null,
                data: payload,
            });

            // Advance to next step
            const idx = STEP_ORDER.indexOf(step);
            if (idx >= 0 && idx < STEP_ORDER.length - 1) {
                const nextStep = STEP_ORDER[idx + 1];
                onStatusUpdate?.({ step: nextStep, status: 'pending' });
            }
        };
        kit.on(event, handler);
        cleanup.push(() => {
            if (kit.off) {
                kit.off(event, handler);
            }
        });
    };

    // Listen for all 4 SDK events
    registerListener('approve', 'approve');
    registerListener('burn', 'burn');
    registerListener('fetchAttestation', 'attestation');
    registerListener('mint', 'mint');

    try {
        onStatusUpdate?.({ step: 'approve', status: 'pending' });

        // Standard bridge flow — user signs all steps.
        // Same adapter handles both chains (SDK switches chains automatically).
        // customFee collects our platform fee on source chain.
        const bridgeParams = {
            from: { adapter, chain: fromChain },
            to: { adapter, chain: toChain, recipientAddress },
            amount: bridgeAmount,
            config: {
                customFee: {
                    value: platformFee,
                    recipientAddress: FEE_RECIPIENT,
                },
            },
        };
        console.log('[BridgeService] kit.bridge() params:', JSON.stringify({
            from: { chain: fromChain },
            to: { chain: toChain, recipientAddress },
            amount: bridgeParams.amount,
            config: bridgeParams.config,
        }, null, 2));
        const result = await kit.bridge(bridgeParams);

        // Log the full SDK result for debugging
        console.log('[BridgeService] kit.bridge() result:', {
            state: result.state,
            steps: result.steps?.map(s => ({ name: s.name, state: s.state, txHash: s.txHash, errorMessage: s.errorMessage })),
        });

        // The SDK resolves (doesn't throw) even when steps fail.
        // Check result.state and surface the actual error.
        if (result.state === 'error') {
            const failedStep = result.steps?.find(s => s.state === 'error');
            const errorMsg = failedStep?.errorMessage || `Bridge failed at step: ${failedStep?.name || 'unknown'}`;
            console.error('[BridgeService] SDK returned error state:', { failedStep, errorMsg });
            throw new Error(errorMsg);
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

        // Detect user cancellation/rejection across all wallet + SDK error formats
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
            console.log('[BridgeService] Detected wallet rejection/cancellation');
            onStatusUpdate?.({ step: 'cancelled', status: 'error', error: 'Transaction cancelled in wallet' });
        } else {
            onStatusUpdate?.({ step: 'error', status: 'error', error: error.shortMessage || error.message || 'Bridge execution failed' });
        }
        throw error;
    } finally {
        cleanup.forEach((fn) => fn());
    }
};

// Retry a failed mint by fetching attestation from Circle API and calling receiveMessage
export const retryMint = async ({ burnTxHash, fromChain, toChain }) => {
    if (!burnTxHash) throw new Error('No source transaction hash available for retry');

    console.log('[BridgeService] Retrying mint for burn tx:', burnTxHash);

    // Step 1: Fetch attestation from Circle's Attestation API
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

    // Step 2: Call receiveMessage on destination chain
    const { createWalletClient, createPublicClient, custom, http } = await import('viem');
    const { getChainByName } = await import('../config/chains');

    const destChainConfig = getChainByName(toChain);
    if (!destChainConfig) throw new Error(`Unknown destination chain: ${toChain}`);

    // MessageTransmitter contract addresses per chain (CCTP V2)
    const MESSAGE_TRANSMITTER = {
        'Ethereum Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Base Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Arbitrum Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Optimism Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        'Arc Testnet': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    };

    const transmitterAddress = MESSAGE_TRANSMITTER[toChain];
    if (!transmitterAddress) throw new Error(`No MessageTransmitter address for chain: ${toChain}`);

    // Switch wallet to destination chain
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

        console.log('[BridgeService] Retry mint tx hash:', txHash);
        return { mintTxHash: txHash };
    } catch (mintErr) {
        console.error('[BridgeService] Retry mint failed:', mintErr);
        throw new Error(mintErr.shortMessage || mintErr.message || 'Mint transaction failed');
    }
};

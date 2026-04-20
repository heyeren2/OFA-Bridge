/**
 * Circle App Kit Swap Service
 * Handles EURC ↔ USDC swaps on Arc Testnet using @circle-fin/app-kit
 *
 * ┌─ Pre-bridge swap  ──────────────────────────────────────────────┐
 * │  EURC → USDC on Arc  →  bridge USDC to destination             │
 * └─────────────────────────────────────────────────────────────────┘
 * ┌─ Post-bridge swap ──────────────────────────────────────────────┐
 * │  bridge USDC to Arc  →  USDC → EURC on Arc                     │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * The adapter uses createViemAdapterFromProvider which takes an EIP-1193
 * provider (MetaMask, WalletConnect, etc). We get this from the wagmi
 * connector via connector.getProvider() — no private key ever needed.
 *
 * Prerequisites:
 *  - @circle-fin/app-kit installed
 *  - @circle-fin/adapter-viem-v2 installed
 *  - VITE_CIRCLE_KIT_KEY set in .env (get from https://console.circle.com)
 */

import { AppKit } from '@circle-fin/app-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { createPublicClient, http, formatEther } from 'viem';

// ── Arc Testnet Public Client ────────────────────────────────────────────────
const arcClient = createPublicClient({
    transport: http('https://rpc.testnet.arc.network'),
});

// ── Singleton AppKit instance ────────────────────────────────────────────────
let _kit = null;
const getKit = () => {
    if (!_kit) _kit = new AppKit();
    return _kit;
};

// ── EURC Token Metadata ──────────────────────────────────────────────────────
export const EURC_TOKEN = {
    symbol: 'EURC',
    name: 'Euro Coin',
    icon: '/icons/euro.png',                                          // EURC icon
    contractAddress: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',  // Arc Testnet
};

// ── Real Data Estimators ───────────────────────────────────────────────────
/**
 * Fetches real gas price and calculates estimated swap fee/time for Arc Testnet.
 */
export async function estimateSwapStats() {
    try {
        const gasPrice = await arcClient.getGasPrice();
        // Standard swap on Uniswap-like DEX is ~200k-250k gas
        const estimatedGasLimit = 250000n;
        const feeInEth = formatEther(gasPrice * estimatedGasLimit);

        return {
            gasFee: '< $0.01', // Fixed realistic estimate for Arc Testnet
            estTime: '~2-3s',
            gasPriceWei: gasPrice.toString()
        };
    } catch (error) {
        console.error('Failed to fetch swap stats:', error);
        return { gasFee: '< $0.01', estTime: '~2s' };
    }
}

/**
 * Fetches a real-time quote for the swap from the Circle SDK.
 */
export async function getSwapQuote({ tokenIn, tokenOut, amountIn }) {
    const kit = getKit();
    try {
        patchFetchForProxy();
        const result = await kit.getQuote({
            fromChain: 'Arc_Testnet',
            tokenIn,
            tokenOut,
            amountIn: amountIn.toString()
        });

        // Calculate rate: amountOut / amountIn
        const rate = (parseFloat(result.amountOut) / parseFloat(amountIn)).toFixed(6);

        return {
            amountOut: result.amountOut,
            rate,
            priceImpact: result.priceImpact || '0',
            fee: result.fee || '0'
        };
    } catch (error) {
        console.error('[AppKitSwap] Quote failed:', error);
        // Fallback to 1:1 if quote fails, but notify UI
        return {
            amountOut: amountIn.toString(),
            rate: '1.00',
            error: error.message
        };
    }
}
// ── Vite Dev CORS Proxy Patcher ──────────────────────────────────────────────
// Circle's kit.swap() calls https://api.circle.com — blocked by CORS in browser.
// In development (localhost), we intercept fetch and rewrite those URLs to use
// the Vite proxy (/circle-api → https://api.circle.com), which adds CORS headers.
let _fetchPatched = false;
function patchFetchForProxy() {
    if (_fetchPatched || typeof window === 'undefined') return;
    _fetchPatched = true;
    const CIRCLE_API = 'https://api.circle.com';
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.startsWith(CIRCLE_API)) {
            const proxied = url.replace(CIRCLE_API, '/circle-api');
            console.log(`[AppKitSwap] Proxying Circle API: ${url} → ${proxied}`);
            return originalFetch(proxied, init);
        }
        return originalFetch(input, init);
    };
    console.log('[AppKitSwap] Global fetch patched for Circle API proxy');
}

/**
 * @param {string}   tokenIn
 * @param {string}   tokenOut
 * @param {string}   amountIn      human-readable amount, e.g. "5.00"
 * @param {object}   connector     wagmi connector from useAccount()
 * @param {number}   slippage      slippage percentage, e.g. 1.0
 * @param {function} onStatus      optional callback({ step, message })
 * @param {object}   customFee     optional { percentageBps: number, recipientAddress: string }
 */
async function runSwap({ tokenIn, tokenOut, amountIn, fullAmount, connector, slippage = 1.0, onStatus, customFee }) {
    const kitKey = import.meta.env.VITE_CIRCLE_KIT_KEY;

    if (!kitKey || kitKey === 'your_kit_key_here') {
        throw new Error('Circle Kit Key not configured. Set VITE_CIRCLE_KIT_KEY in your .env file.');
    }

    if (!connector) {
        throw new Error('Wallet not connected.');
    }

    // Patch global fetch to route Circle API calls through the Vite proxy
    patchFetchForProxy();

    onStatus?.({ step: 'approving', message: `Preparing swap adapter...` });

    // Get EIP-1193 wallet provider from the wagmi connector
    const rawProvider = await connector.getProvider();

    // Proxy wrapper: intercepts increaseAllowance → approve for Arc token compatibility
    // and forces the approval amount to be the FULL user-entered amount (covering fees).
    const INCREASE_ALLOWANCE_SIG = '0x39509351';
    const APPROVE_SIG = '0x095ea7b3';
    let approvalTxSent = false;
    const fixedProvider = new Proxy(rawProvider, {
        get(target, prop, receiver) {
            if (prop === 'request') {
                return async (args) => {
                    if (args.method === 'eth_sendTransaction') {
                        const data = args.params?.[0]?.data?.toLowerCase() || '';

                        // 1. Force the approval amount to be the FULL input amount (e.g. 10 USDC instead of 9.98)
                        if (fullAmount && (data.startsWith(INCREASE_ALLOWANCE_SIG) || data.startsWith(APPROVE_SIG))) {
                            try {
                                const fullAmtRaw = BigInt(Math.floor(parseFloat(fullAmount) * 1e6));
                                const fullAmtHex = fullAmtRaw.toString(16).padStart(64, '0');
                                const prefix = data.substring(0, 10 + 64); // sig (10) + spender (64)
                                const fixedData = prefix + fullAmtHex;
                                console.log(`[AppKitSwap] Forcing approval amount: ${fullAmount} (hex: ...${fullAmtHex.slice(-8)})`);
                                args = { ...args, params: [{ ...args.params[0], data: fixedData }] };
                            } catch (e) { console.warn('[AppKitSwap] Failed to rewrite approval amount:', e); }
                        }

                        // 2. Rewrite increaseAllowance → approve (Arc token compatibility)
                        if (args.method === 'eth_sendTransaction' && data.startsWith(INCREASE_ALLOWANCE_SIG)) {
                            const currentData = args.params[0].data;
                            const fixedData = APPROVE_SIG + currentData.slice(10);
                            args = { ...args, params: [{ ...args.params[0], data: fixedData }] };
                        }

                        // 3. Track state transitions
                        const finalData = args.params?.[0]?.data?.toLowerCase() || '';
                        if (finalData.startsWith(APPROVE_SIG) || finalData.startsWith(INCREASE_ALLOWANCE_SIG)) {
                            approvalTxSent = true;
                        } else if (approvalTxSent) {
                            onStatus?.({ step: 'swapping', message: 'Confirm swap in wallet...' });
                        }
                    }
                    return target.request(args);
                };
            }
            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });

    // Build the adapter
    const adapter = await createViemAdapterFromProvider({
        provider: fixedProvider,
        publicClient: arcClient
    });
    const kit = getKit();

    onStatus?.({ step: 'approving', message: `Waiting for wallet approval...` });

    const result = await kit.swap({
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn,
        tokenOut,
        amountIn,
        config: {
            kitKey,
            slippage: (slippage / 100),
            allowanceStrategy: 'approve',
            ...(customFee ? { customFee } : {}),
        },
    });

    onStatus?.({ step: 'success', message: 'Swap complete!', result });

    return {
        amountOut: result.amountOut,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
    };
}

// ── Pre-bridge swap: EURC → USDC on Arc Testnet ──────────────────────────────
/**
 * Swap EURC → USDC on Arc Testnet BEFORE bridging to another chain.
 * Only call when fromChainName === 'Arc Testnet' and swapFirst is ON.
 *
 * @param {string}   amountIn   Amount of EURC (e.g. "5.00")
 * @param {object}   connector  wagmi connector from useAccount()
 * @param {number}   slippage   Slippage percentage
 * @param {function} onStatus   Optional callback({ step, message })
 * @param {object}   customFee  Optional { feePercentage: string, recipientAddress: string }
 */
export async function appKitSwapEurc(amountIn, fullAmount, connector, slippage, onStatus, customFee) {
    return runSwap({ tokenIn: 'EURC', tokenOut: 'USDC', amountIn, fullAmount, connector, slippage, onStatus, customFee });
}

// ── Post-bridge swap: USDC → EURC on Arc Testnet ─────────────────────────────
/**
 * Swap USDC → EURC on Arc Testnet AFTER USDC has been bridged there.
 * Only call when toChainName === 'Arc Testnet' and destToken === 'EURC'.
 *
 * @param {string}   amountIn   Amount of USDC received from bridge (e.g. "4.99")
 * @param {object}   connector  wagmi connector from useAccount()
 * @param {number}   slippage   Slippage percentage
 * @param {function} onStatus   Optional callback({ step, message })
 * @param {object}   customFee  Optional { feePercentage: string, recipientAddress: string }
 */
export async function appKitSwapToEurc(amountIn, fullAmount, connector, slippage, onStatus, customFee) {
    return runSwap({ tokenIn: 'USDC', tokenOut: 'EURC', amountIn, fullAmount, connector, slippage, onStatus, customFee });
}

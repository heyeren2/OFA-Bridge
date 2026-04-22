/**
 * Circle App Kit Swap Service
 * Handles EURC ↔ USDC swaps on Arc Testnet
 */

import { AppKit } from '@circle-fin/app-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { createPublicClient, http, formatEther } from 'viem';


const arcClient = createPublicClient({
    transport: http('https://rpc.testnet.arc.network'),
});


let _kit = null;
const getKit = () => {
    if (!_kit) _kit = new AppKit();
    return _kit;
};


export const EURC_TOKEN = {
    symbol: 'EURC',
    name: 'Euro Coin',
    icon: '/icons/euro.png',
    contractAddress: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
};

export async function estimateSwapStats() {
    try {
        const gasPrice = await arcClient.getGasPrice();
        const estimatedGasLimit = 250000n;
        const feeInEth = formatEther(gasPrice * estimatedGasLimit);

        return {
            gasFee: '< $0.01',
            estTime: '~2-3s',
            gasPriceWei: gasPrice.toString()
        };
    } catch (error) {
        console.error('Failed to fetch swap stats:', error);
        return { gasFee: '< $0.01', estTime: '~2s' };
    }
}



const CURVE_POOL_ADDRESS = '0x942644106B073E30D72c2C5D7529D5C296ea91ab';

const CURVE_POOL_ABI = [
    {
        name: 'get_dy',
        type: 'function',
        inputs: [
            { name: 'i', type: 'int128' },
            { name: 'j', type: 'int128' },
            { name: 'dx', type: 'uint256' }
        ],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view'
    }
];

/**
 * @param {string} tokenIn
 * @param {string} tokenOut
 * @param {string} amountIn
 */
export async function getSwapQuote({ tokenIn, tokenOut, amountIn }) {
    try {
        const amt = parseFloat(amountIn);
        if (isNaN(amt) || amt <= 0) return null;

        let dy_raw;
        let amountOut;
        let rate;

        if (tokenIn === 'EURC' && tokenOut === 'USDC') {
            const dx = BigInt(Math.floor(amt * 1e6));
            dy_raw = await arcClient.readContract({
                address: CURVE_POOL_ADDRESS,
                abi: CURVE_POOL_ABI,
                functionName: 'get_dy',
                args: [1, 0, dx]
            });
            const rawUsdc = Number(dy_raw) / 1e18;
            amountOut = (rawUsdc * 0.998).toFixed(4);
            rate = (parseFloat(amountOut) / amt).toFixed(6);
        } else {
            const dx = BigInt(Math.floor(amt * 1e18));
            dy_raw = await arcClient.readContract({
                address: CURVE_POOL_ADDRESS,
                abi: CURVE_POOL_ABI,
                functionName: 'get_dy',
                args: [0, 1, dx]
            });
            const rawEurc = Number(dy_raw) / 1e6;
            amountOut = (rawEurc * 0.998).toFixed(4);
            rate = (parseFloat(amountOut) / amt).toFixed(6);
        }

        return {
            amountOut,
            rate,
            priceImpact: '0'
        };
    } catch (error) {
        console.error('[AppKitSwap] On-chain quote failed:', error);
        return null;
    }
}

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
            return originalFetch(proxied, init);
        }
        return originalFetch(input, init);
    };
}

/**
 * @param {string}   tokenIn
 * @param {string}   tokenOut
 * @param {string}   amountIn      human-readable amount, e.g. "5.00"
 * @param {string}   fullAmount    the total amount to approve
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

    patchFetchForProxy();

    onStatus?.({ step: 'approving', message: `Preparing swap adapter...` });

    const rawProvider = await connector.getProvider();

    const INCREASE_ALLOWANCE_SIG = '0x39509351';
    const APPROVE_SIG = '0x095ea7b3';
    let approvalTxSent = false;
    const fixedProvider = new Proxy(rawProvider, {
        get(target, prop, receiver) {
            if (prop === 'request') {
                return async (args) => {
                    if (args.method === 'eth_sendTransaction') {
                        const data = args.params?.[0]?.data?.toLowerCase() || '';

                        if (fullAmount && (data.startsWith(INCREASE_ALLOWANCE_SIG) || data.startsWith(APPROVE_SIG))) {
                            try {
                                const fullAmtRaw = BigInt(Math.floor(parseFloat(fullAmount) * 1e6));
                                const fullAmtHex = fullAmtRaw.toString(16).padStart(64, '0');
                                const prefix = data.substring(0, 10 + 64);
                                const fixedData = prefix + fullAmtHex;
                                console.log(`[AppKitSwap] Forcing approval amount: ${fullAmount} (hex: ...${fullAmtHex.slice(-8)})`);
                                args = { ...args, params: [{ ...args.params[0], data: fixedData }] };
                            } catch (e) { console.warn('[AppKitSwap] Failed to rewrite approval amount:', e); }
                        }

                        if (args.method === 'eth_sendTransaction' && data.startsWith(INCREASE_ALLOWANCE_SIG)) {
                            const currentData = args.params[0].data;
                            const fixedData = APPROVE_SIG + currentData.slice(10);
                            args = { ...args, params: [{ ...args.params[0], data: fixedData }] };
                        }

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
            allowanceStrategy: 'approve',
            ...(slippage ? { slippage } : {}),
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

/**
 * Swap EURC → USDC on Arc Testnet BEFORE bridging.
 * @param {string}   amountIn   Amount of EURC (e.g. "5.00")
 * @param {string}   fullAmount Total amount including fees
 * @param {object}   connector  wagmi connector
 * @param {number}   slippage   Slippage percentage
 * @param {function} onStatus   Optional status callback
 * @param {object}   customFee  Optional fee config
 */
export async function appKitSwapEurc(amountIn, fullAmount, connector, slippage, onStatus, customFee) {
    return runSwap({ tokenIn: 'EURC', tokenOut: 'USDC', amountIn, fullAmount, connector, slippage, onStatus, customFee });
}

/**
 * Swap USDC → EURC on Arc Testnet AFTER bridging.
 * @param {string}   amountIn   Amount of USDC (e.g. "4.99")
 * @param {string}   fullAmount Total amount
 * @param {object}   connector  wagmi connector
 * @param {number}   slippage   Slippage percentage
 * @param {function} onStatus   Optional status callback
 * @param {object}   customFee  Optional fee config
 */
export async function appKitSwapToEurc(amountIn, fullAmount, connector, slippage, onStatus, customFee) {
    return runSwap({ tokenIn: 'USDC', tokenOut: 'EURC', amountIn, fullAmount, connector, slippage, onStatus, customFee });
}

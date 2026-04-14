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

// ── Shared swap helper ───────────────────────────────────────────────────────
/**
 * @param {string}   tokenIn
 * @param {string}   tokenOut
 * @param {string}   amountIn      human-readable amount, e.g. "5.00"
 * @param {object}   connector     wagmi connector from useAccount()
 * @param {function} onStatus      optional callback({ step, message })
 */
async function runSwap({ tokenIn, tokenOut, amountIn, connector, onStatus }) {
    const kitKey = import.meta.env.VITE_CIRCLE_KIT_KEY;

    if (!kitKey || kitKey === 'your_kit_key_here') {
        throw new Error(
            'Circle Kit Key is not configured. ' +
            'Get a free key at https://console.circle.com → Developer → API Keys ' +
            'and add it as VITE_CIRCLE_KIT_KEY in your .env file.'
        );
    }

    if (!connector) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
    }

    if (!amountIn || parseFloat(amountIn) <= 0) {
        throw new Error(`Invalid swap amount: ${amountIn}`);
    }

    onStatus?.({ step: 'swapping', message: `Swapping ${amountIn} ${tokenIn} → ${tokenOut} on Arc Testnet...` });

    // Get EIP-1193 provider from the wagmi connector (works with MetaMask, WalletConnect, etc.)
    const eip1193Provider = await connector.getProvider();

    const adapter = await createViemAdapterFromProvider({ provider: eip1193Provider });
    const kit = getKit();

    const result = await kit.swap({
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn,
        tokenOut,
        amountIn,
        config: { kitKey },
    });

    onStatus?.({ step: 'done', message: `Swap complete. Received ${result.amountOut} ${tokenOut}.` });

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
 * @param {function} onStatus   Optional callback({ step, message })
 */
export async function appKitSwapEurc(amountIn, connector, onStatus) {
    return runSwap({ tokenIn: 'EURC', tokenOut: 'USDC', amountIn, connector, onStatus });
}

// ── Post-bridge swap: USDC → EURC on Arc Testnet ─────────────────────────────
/**
 * Swap USDC → EURC on Arc Testnet AFTER USDC has been bridged there.
 * Only call when toChainName === 'Arc Testnet' and destToken === 'EURC'.
 *
 * @param {string}   amountIn   Amount of USDC received from bridge (e.g. "4.99")
 * @param {object}   connector  wagmi connector from useAccount()
 * @param {function} onStatus   Optional callback({ step, message })
 */
export async function appKitSwapToEurc(amountIn, connector, onStatus) {
    return runSwap({ tokenIn: 'USDC', tokenOut: 'EURC', amountIn, connector, onStatus });
}

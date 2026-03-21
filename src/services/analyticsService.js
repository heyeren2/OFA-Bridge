import { BridgeAnalytics } from 'bridge-id-sdk';

export const sdk = new BridgeAnalytics({
    bridgeId: import.meta.env.VITE_BRIDGE_ID,
    apiUrl: import.meta.env.VITE_ANALYTICS_URL,
    rpcUrls: {
        sepolia: import.meta.env.VITE_SEPOLIA_RPC_URL,
        base: import.meta.env.VITE_BASE_RPC_URL,
        arc: import.meta.env.VITE_ARC_RPC_URL,
    }
});
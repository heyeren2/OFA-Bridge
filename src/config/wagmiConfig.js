import '@rainbow-me/rainbowkit/styles.css';
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import {
  sepolia as sepoliaDefault, // aliased so we can override the RPC below
  baseSepolia,
  arbitrumSepolia,
  optimismSepolia,
} from 'wagmi/chains';
import { http, defineChain } from 'viem';
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

// Override Sepolia RPC to avoid DRPC free-tier rate limits (408 timeouts)
// that kill the attestation polling step.
const sepolia = {
  ...sepoliaDefault,
  rpcUrls: {
    default: { http: ['https://ethereum-sepolia-rpc.publicnode.com'] },
    public: { http: ['https://ethereum-sepolia-rpc.publicnode.com'] },
  },
};

// Define Arc Testnet
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.io' },
  },
  testnet: true,
});

// projectId from WalletConnect Cloud
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

export const config = getDefaultConfig({
  appName: 'OFA Bridge',
  projectId,
  chains: [
    sepolia,
    baseSepolia,
    arbitrumSepolia,
    optimismSepolia,
    arcTestnet,
  ],
  transports: {
    [sepolia.id]: http('https://ethereum-sepolia-rpc.publicnode.com'),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [optimismSepolia.id]: http(),
    [arcTestnet.id]: http(import.meta.env.VITE_ARC_RPC_URL),
  },
  ssr: true, // If your dApp uses server side rendering (SSR)
});

export const queryClient = new QueryClient();

export { RainbowKitProvider, darkTheme, WagmiProvider, QueryClientProvider };

# OFA Bridge

OFA Bridge is a high-performance cross-chain bridging solution built for the modern multi-chain ecosystem, specifically optimized for secure and high-speed **USDC** transfers. It enables seamless asset transfers between **Arc Testnet**, **Ethereum Sepolia**, **Base Sepolia**, **Optimism Sepolia**, and **Arbitrum Sepolia** using Circle's CCTP and Bridge Kit.

## Features

- **Bridging USDC**: Transfer USDC across 5+ major testnets with guaranteed settlement.
- **Smart Swaps**: Integrated Uniswap V3 logic for automatic ETH → USDC conversions during the bridge process.
- **Real-Time Analytics**: Full bridge activity history powered by Goldsky subgraphs.
- **Micro-Interactions**: Premium, glassmorphic UI with smooth transitions and status updates.
- **Dark Mode Optimized**: Pixel-perfect design for both light and dark themes.
- **Secret Management**: Robust environment variable handling for RPCs and APIs.

## Stack

- **Frontend**: React + Vite
- **Styling**: Vanilla CSS (High Performance)
- **Web3**: Wagmi + Viem + RainbowKit
- **Bridge SDK**: Circle Bridge Kit
- **Indexing**: Goldsky Subgraphs (GraphQL)
- **Icons**: Lucide React

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Setup Environment Variables
Create a `.env` file in the root directory and add your keys (see `.env.example` for the template):
```env
VITE_WALLETCONNECT_PROJECT_ID=...
VITE_ARC_RPC_URL=...
...
```

### 3. Run Development Server
```bash
npm run dev
```

## Security & Performance

- **Sanitized Secrets**: No hardcoded RPCs or API keys in the source code.
- **Dependency Audit**: Regular security patches via `npm audit`.
- **Responsive Layout**: Fully optimized for Desktop, Tablet, and Mobile devices.

## X

- **Twitter**: [@heyeren_](https://x.com/heyeren_)
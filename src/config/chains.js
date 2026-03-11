

export const BRIDGE_DIRECTION = {
  ANY: 'ANY',
  TO_ARC: 'TO_ARC',
  FROM_ARC: 'FROM_ARC',
};

const ARC_CHAIN_DATA = {
  name: 'Arc Testnet',
  bridgeKitName: 'Arc_Testnet',
  chainId: 5042002,
  icon: '/icons/Arc.png',
  color: '#6366f1',
  explorer: 'https://testnet.arcscan.app',
  rpc: 'https://rpc.testnet.arc.network',
  tokens: ['USDC'],
  type: 'evm',
};

export const ARC_CHAIN = ARC_CHAIN_DATA;

export const SUPPORTED_CHAINS = [
  ARC_CHAIN_DATA,
  {
    name: 'Ethereum Sepolia',
    bridgeKitName: 'Ethereum_Sepolia',
    chainId: 11155111,
    icon: '/icons/ethereum.png',
    color: '#627EEA',
    tokens: ['USDC', 'ETH'],
    rpc: 'https://eth-sepolia.public.blastapi.io',
    explorer: 'https://sepolia.etherscan.io',
    hasSwap: true,
    type: 'evm',
  },
  {
    name: 'Base Sepolia',
    bridgeKitName: 'Base_Sepolia',
    chainId: 84532,
    icon: '/icons/Base.png',
    color: '#0052FF',
    tokens: ['USDC'],
    rpc: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    hasSwap: false,
    type: 'evm',
  },
  {
    name: 'Arbitrum Sepolia',
    bridgeKitName: 'Arbitrum_Sepolia',
    chainId: 421614,
    icon: '/icons/arbitrum.png',
    color: '#28A0F0',
    tokens: ['USDC'],
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorer: 'https://sepolia.arbiscan.io',
    hasSwap: false,
    type: 'evm',
  },
  {
    name: 'Optimism Sepolia',
    bridgeKitName: 'Optimism_Sepolia',
    chainId: 11155420,
    icon: '/icons/optimism.png',
    color: '#FF0420',
    tokens: ['USDC'],
    rpc: 'https://sepolia.optimism.io',
    explorer: 'https://sepolia-optimism.etherscan.io',
    hasSwap: false,
    type: 'evm',
  },
  {
    name: 'Unichain Sepolia',
    bridgeKitName: 'Unichain_Sepolia',
    chainId: 1301,
    icon: '/icons/unichain.png',
    color: '#FF007A',
    tokens: ['USDC'],
    rpc: 'https://sepolia.unichain.org',
    explorer: 'https://sepolia.uniscan.xyz',
    hasSwap: false,
    type: 'evm',
  },
  {
    name: 'Monad Testnet',
    bridgeKitName: 'Monad_Testnet',
    chainId: 10143,
    icon: '/icons/monad.png',
    color: '#836EF9',
    tokens: ['USDC'],
    rpc: 'https://testnet-rpc.monad.xyz',
    explorer: 'https://testnet.monadexplorer.com',
    hasSwap: false,
    type: 'evm',
  },
  {
    name: 'HyperEVM Testnet',
    bridgeKitName: 'HyperEVM_Testnet',
    chainId: 998,
    icon: '/icons/hyperEvm.png',
    color: '#00C805',
    tokens: ['USDC'],
    rpc: 'https://rpc.hyperliquid-testnet.xyz/evm',
    explorer: 'https://testnet.purrsec.com',
    hasSwap: false,
    type: 'evm',
  },
  {
    name: 'Sei Testnet',
    bridgeKitName: 'Sei_Testnet',
    chainId: 1328,
    icon: '/icons/sei.png',
    color: '#9B1C1C',
    tokens: ['USDC'],
    rpc: 'https://evm-rpc-testnet.sei-apis.com',
    explorer: 'https://testnet.seiscan.io/',
    hasSwap: false,
    type: 'evm',
  },
  {
    name: 'Linea Sepolia',
    bridgeKitName: 'Linea_Sepolia',
    chainId: 59141,
    icon: '/icons/linea.png',
    color: '#121212',
    tokens: ['USDC'],
    rpc: 'https://rpc.sepolia.linea.build',
    explorer: 'https://sepolia.lineascan.build',
    hasSwap: false,
    type: 'evm',
  },
  {
    name: 'Ink Testnet',
    bridgeKitName: 'Ink_Testnet',
    chainId: 763373,
    icon: '/icons/ink.png',
    color: '#7B68EE',
    tokens: ['USDC'],
    rpc: 'https://rpc-gel-sepolia.inkonchain.com',
    explorer: 'https://explorer-sepolia.inkonchain.com',
    hasSwap: false,
    type: 'evm',
  },
  {
    name: 'Plume Testnet',
    bridgeKitName: 'Plume_Testnet',
    chainId: 98867,
    icon: '/icons/plume.png',
    color: '#E8D5B7',
    tokens: ['USDC'],
    rpc: 'https://testnet-rpc.plume.org',
    explorer: 'https://testnet-explorer.plume.org',
    hasSwap: false,
    type: 'evm',
  },
  {
    name: 'Avalanche Fuji',
    bridgeKitName: 'Avalanche_Fuji',
    chainId: 43113,
    icon: '/icons/avalanche.png',
    color: '#E84142',
    tokens: ['USDC'],
    rpc: 'https://api.avax-test.network/ext/bc/C/rpc',
    explorer: 'https://testnet.snowscan.xyz',
    hasSwap: false,
    type: 'evm',
  },
];

export const getChainByName = (name) =>
  SUPPORTED_CHAINS.find((c) => c.name === name);

export const getChainByBridgeKitName = (bkName) =>
  SUPPORTED_CHAINS.find((c) => c.bridgeKitName === bkName);

export const getEvmChains = () =>
  SUPPORTED_CHAINS.filter((c) => c.type === 'evm');

export const getTokensForChain = (chainName, direction) => {
  const chain = getChainByName(chainName);
  if (!chain) return ['USDC'];
  if (direction === BRIDGE_DIRECTION.FROM_ARC) return ['USDC'];
  return chain.tokens;
};
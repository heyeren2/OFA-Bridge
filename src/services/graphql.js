import { ApolloClient, InMemoryCache, gql, HttpLink, ApolloLink } from '@apollo/client';

// Map of Chain Name to Subgraph URL
// User: Update these with the URLs from your Goldsky Dashboard!
export const SUBGRAPH_URLS = {
  'Ethereum Sepolia': import.meta.env.VITE_GOLDSKY_SUBGRAPH_URL_SEPOLIA,
  'Base Sepolia': import.meta.env.VITE_GOLDSKY_SUBGRAPH_URL_BASE,
  'Optimism Sepolia': import.meta.env.VITE_GOLDSKY_SUBGRAPH_URL_OPTIMISM,
  'Arbitrum Sepolia': import.meta.env.VITE_GOLDSKY_SUBGRAPH_URL_ARBITRUM,
  'Arc Testnet': import.meta.env.VITE_GOLDSKY_SUBGRAPH_URL_ARC,
};

export const getSubgraphClient = (chainName) => {
  return new ApolloClient({
    uri: SUBGRAPH_URLS[chainName] || SUBGRAPH_URLS['Ethereum Sepolia'] || '',
    cache: new InMemoryCache(),
  });
};

// Default client (Sepolia)
export const client = getSubgraphClient('Ethereum Sepolia');

/**
 * Multi-chain Subgraph Strategy:
 * Since we have separate subgraphs per chain, we can either:
 * 1. Create multiple clients (clunky)
 * 2. Update the URI dynamically (better for a single view)
 * 
 * For 'Global Activity', we might need to fetch from ALL and aggregate,
 * but for now we focus on the active chain or a primary one (Sepolia).
 */

export const GET_TRANSACTIONS = gql`
  query GetTransactions($first: Int, $skip: Int, $orderBy: String, $orderDirection: String, $where: BridgeTransaction_filter) {
    bridgeTransactions(
      first: $first, 
      skip: $skip, 
      orderBy: $orderBy, 
      orderDirection: $orderDirection, 
      where: $where
    ) {
      id
      sender
      receiver
      token
      amount
      amountDisplay
      fromChain
      toChain
      sourceTxHash
      destTxHash
      status
      timestamp
      mintTimestamp
      isOFA
    }
  }
`;

export const GET_VOLUME_STATS = gql`
  query GetVolumeStats {
    global: volumeStat(id: "global") {
      totalVolumeDisplay
      transactionCount
    }
  }
`;

export const GET_DAILY_VOLUME = gql`
  query GetDailyVolume($first: Int) {
    volumeStats(
      first: $first, 
      orderBy: date, 
      orderDirection: desc,
      where: { date_gt: 0 }
    ) {
      id
      date
      totalVolumeDisplay
      transactionCount
    }
  }
`;

export const GET_USER_STATS = gql`
  query GetUserStats($id: ID!) {
    userStat(id: $id) {
      totalVolumeDisplay
      transactionCount
    }
  }
`;

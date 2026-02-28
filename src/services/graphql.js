import { ApolloClient, InMemoryCache, gql, HttpLink, ApolloLink } from '@apollo/client';

// Map of Chain Name to Subgraph URL
export const SUBGRAPH_URLS = {
  'Ethereum Sepolia': import.meta.env.VITE_GOLDSKY_SUBGRAPH_URL_SEPOLIA,
  'Base Sepolia': import.meta.env.VITE_GOLDSKY_SUBGRAPH_URL_BASE,
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

// All chain clients for multi-chain aggregation
export const ALL_CHAIN_NAMES = Object.keys(SUBGRAPH_URLS).filter(
  (name) => !!SUBGRAPH_URLS[name]
);

export const getAllClients = () => {
  return ALL_CHAIN_NAMES.map((name) => ({
    chainName: name,
    client: getSubgraphClient(name),
  }));
};

/**
 * Query all chains in parallel and return combined results.
 */
export const queryAllChains = async (query, variables = {}) => {
  const clients = getAllClients();
  const results = await Promise.allSettled(
    clients.map(async ({ chainName, client }) => {
      try {
        const result = await client.query({ query, variables, fetchPolicy: 'network-only' });
        return { chainName, data: result.data, error: null };
      } catch (error) {
        console.warn(`[Subgraph] Failed to query ${chainName}:`, error.message);
        return { chainName, data: null, error };
      }
    })
  );

  return results.map((r) =>
    r.status === 'fulfilled' ? r.value : { chainName: 'Unknown', data: null, error: r.reason }
  );
};

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

export const GET_BRIDGE_STATS = gql`
  query GetBridgeStats {
    bridgeStat(id: "global") {
      totalVolume
      totalFees
      transactionCount
      uniqueUsers
    }
  }
`;

export const GET_DAILY_VOLUMES = gql`
  query GetDailyVolumes($first: Int) {
    dailyVolumes(orderBy: id, orderDirection: desc, first: $first) {
      id
      date
      volume
      fees
      transactionCount
    }
  }
`;

export const GET_HOURLY_VOLUMES = gql`
  query GetHourlyVolumes($first: Int) {
    hourlyVolumes(orderBy: id, orderDirection: desc, first: $first) {
      id
      volume
      fees
      transactionCount
    }
  }
`;

export const GET_USER_STATS = gql`
  query GetUserStats($id: ID!) {
    userStat(id: $id) {
      totalVolume
      totalVolumeDisplay
      transactionCount
    }
  }
`;


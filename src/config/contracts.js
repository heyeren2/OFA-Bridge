// Contract addresses for the bridge

// Fee configuration
export const FEE_RECIPIENT = import.meta.env.VITE_FEE_RECIPIENT;
export const FEE_PERCENTAGE = 0.003; // 0.3%
export const SWAP_FEE_PERCENTAGE = 0.003; // 0.3% hidden swap fee for ETH swap+bridge routes

// USDC addresses per chain (testnet)
export const USDC_ADDRESSES = {
    Ethereum_Sepolia: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    Base_Sepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    Arbitrum_Sepolia: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    Optimism_Sepolia: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
    Unichain_Sepolia: '0x31d0220469e10c4E71834a79b1f276d740d3768F',
    Monad_Testnet: '0x534b2f3A21130d7a60830c2Df862319e593943A3',
    HyperEVM_Testnet: '0x2B3370eE501B4a559b57D449569354196457D8Ab',
    Sei_Testnet: '0x4fCF1784B31630811181f670Aea7A7bEF803eaED',
    Linea_Sepolia: '0xFEce4462D57bD51A6A552365A011b95f0E16d9B7',
    Ink_Testnet: '0xFabab97dCE620294D2B0b0e46C68964e326300Ac',
    Plume_Testnet: '0xcB5f30e335672893c7eb944B374c196392C19D18',
    Solana_Devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    Sui_Testnet: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
    Arc_Testnet: '0x3600000000000000000000000000000000000000',
    Avalanche_Fuji: '0x5425890298aed601595a70AB815c96711a31Bc65',
};

// Uniswap V3 contracts on Ethereum Sepolia (for ETH → USDC swap)
export const UNISWAP_CONTRACTS = {
    swapRouter02: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    quoterV2: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    poolFee: 500, // 0.05% fee tier (has ~$694K liquidity on Sepolia vs ~$12K in 0.3%)
};

// Token metadata
export const TOKEN_INFO = {
    USDC: {
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        icon: '/icons/usdc.png',
    },
    ETH: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        icon: '/icons/ethereum.png',
    },
};

// SwapRouter02 ABI (only the functions we need)
export const SWAP_ROUTER_ABI = [
    {
        inputs: [
            {
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'fee', type: 'uint24' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
                name: 'params',
                type: 'tuple',
            },
        ],
        name: 'exactInputSingle',
        outputs: [{ name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function',
    },
];

// QuoterV2 ABI (only for getting quotes)
export const QUOTER_V2_ABI = [
    {
        inputs: [
            {
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'fee', type: 'uint24' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
                name: 'params',
                type: 'tuple',
            },
        ],
        name: 'quoteExactInputSingle',
        outputs: [
            { name: 'amountOut', type: 'uint256' },
            { name: 'sqrtPriceX96After', type: 'uint160' },
            { name: 'initializedTicksCrossed', type: 'uint32' },
            { name: 'gasEstimate', type: 'uint256' },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
    },
];

// ERC20 ABI (for approval)
export const ERC20_ABI = [
    {
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        name: 'approve',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        name: 'allowance',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
];

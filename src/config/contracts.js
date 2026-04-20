


export const FEE_RECIPIENT = import.meta.env.VITE_FEE_RECIPIENT;
export const FEE_PERCENTAGE = 0.003; // 0.3%
export const SWAP_FEE_PERCENTAGE = 0.002; // 0.2% swap fee
export const SWAP_FEE_RECIPIENT = '0xd600662DAce394606a4D1f93bFe40adAfF7640Ae';

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
    Arc_Testnet: '0x3600000000000000000000000000000000000000',
    Avalanche_Fuji: '0x5425890298aed601595a70AB815c96711a31Bc65',
};

// Circle App Kit Swap Spender on Arc Testnet
export const ARC_SWAP_SPENDER = '0x32813586DA0E44616223A4016a1E08990F6236bC';

// Uniswap V3 contracts on Ethereum Sepolia (for ETH → USDC swap)
export const UNISWAP_CONTRACTS = {
    swapRouter02: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    quoterV2: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    poolFee: 500, // 0.05% fee tier (uniswap poolfee)
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
    EURC: {
        symbol: 'EURC',
        name: 'Euro Coin',
        decimals: 6,
        icon: '/icons/euro.png',
    },
};

// EURC contract addresses (testnet)
export const EURC_ADDRESSES = {
    Arc_Testnet: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
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
    {
        inputs: [
            { name: 'amountMinimum', type: 'uint256' },
            { name: 'recipient', type: 'address' },
        ],
        name: 'unwrapWETH9',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
    },
    {
        inputs: [{ name: 'data', type: 'bytes[]' }],
        name: 'multicall',
        outputs: [{ name: 'results', type: 'bytes[]' }],
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
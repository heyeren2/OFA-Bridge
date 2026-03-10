// Dedicated service for USDC -> ETH swaps on Ethereum Sepolia
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, custom, encodeFunctionData } from 'viem';
import { sepolia } from 'viem/chains';
import {
    UNISWAP_CONTRACTS,
    USDC_ADDRESSES,
    SWAP_ROUTER_ABI,
    QUOTER_V2_ABI,
    ERC20_ABI
} from '../config/contracts';

const getPublicClient = () => {
    return createPublicClient({
        chain: sepolia,
        transport: http(),
    });
};

const getWalletClient = async () => {
    if (!window.ethereum) throw new Error('No wallet found');

    // Ensure wallet is on Sepolia
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }],
        });
    } catch (switchError) {
        console.error('[DestSwap] Switch error:', switchError);
        throw new Error('Please switch to Ethereum Sepolia to complete the swap.');
    }

    return createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum),
    });
};

// Get quote for USDC -> ETH
export const getDestSwapQuote = async (usdcAmount) => {
    const publicClient = getPublicClient();
    const amountIn = parseUnits(usdcAmount.toString(), 6);

    try {
        const result = await publicClient.simulateContract({
            address: UNISWAP_CONTRACTS.quoterV2,
            abi: QUOTER_V2_ABI,
            functionName: 'quoteExactInputSingle',
            args: [
                {
                    tokenIn: USDC_ADDRESSES.Ethereum_Sepolia,
                    tokenOut: UNISWAP_CONTRACTS.weth,
                    amountIn: amountIn,
                    fee: UNISWAP_CONTRACTS.poolFee,
                    sqrtPriceLimitX96: 0n,
                },
            ],
        });

        const ethOut = formatUnits(result.result[0], 18);
        return {
            amountOut: ethOut,
            gasEstimate: result.result[3]?.toString() || '0',
        };
    } catch (error) {
        console.error('[DestSwap] Quote failed:', error);
        throw new Error('Insufficient liquidity for USDC -> ETH swap.');
    }
};

// Execute USDC -> ETH swap
export const executeDestSwap = async (usdcAmount, minEthOut, userAddress, slippage = '1.0') => {
    const walletClient = await getWalletClient();
    const publicClient = getPublicClient();
    const amountIn = parseUnits(usdcAmount.toString(), 6);

    // Slippage calculation
    const slippageMult = 1 - (parseFloat(slippage) / 100);
    const minOut = BigInt(Math.floor(parseFloat(minEthOut) * slippageMult * 1e18));

    try {
        // Check Allowance
        const allowance = await publicClient.readContract({
            address: USDC_ADDRESSES.Ethereum_Sepolia,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [userAddress, UNISWAP_CONTRACTS.swapRouter02]
        });

        if (allowance < amountIn) {
            console.log('[DestSwap] Approving USDC...');
            const approveHash = await walletClient.writeContract({
                account: userAddress,
                address: USDC_ADDRESSES.Ethereum_Sepolia,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [UNISWAP_CONTRACTS.swapRouter02, amountIn]
            });
            await publicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1, pollingInterval: 1_000 });
            console.log('[DestSwap] Approved.');
        }

        // Swap + Unwrap
        const swapData = encodeFunctionData({
            abi: SWAP_ROUTER_ABI,
            functionName: 'exactInputSingle',
            args: [
                {
                    tokenIn: USDC_ADDRESSES.Ethereum_Sepolia,
                    tokenOut: UNISWAP_CONTRACTS.weth,
                    fee: UNISWAP_CONTRACTS.poolFee,
                    recipient: UNISWAP_CONTRACTS.swapRouter02, // Send WETH to router itself
                    amountIn: amountIn,
                    amountOutMinimum: minOut,
                    sqrtPriceLimitX96: 0n,
                },
            ],
        });

        const unwrapData = encodeFunctionData({
            abi: SWAP_ROUTER_ABI,
            functionName: 'unwrapWETH9',
            args: [minOut, userAddress], // Unwrap and send native ETH to user
        });

        // Execute
        const { request } = await publicClient.simulateContract({
            account: userAddress,
            address: UNISWAP_CONTRACTS.swapRouter02,
            abi: SWAP_ROUTER_ABI,
            functionName: 'multicall',
            args: [[swapData, unwrapData]],
        });

        const hash = await walletClient.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, pollingInterval: 1_000 });

        return {
            hash,
            receipt,
            ethReceived: minEthOut,
        };
    } catch (error) {
        console.error('[DestSwap] Execution failed:', error);
        throw new Error('Destination swap failed (Slippage or Gas). Please try again.');
    }
};

// Uniswap swap service for ETH → USDC on Sepolia
import { createPublicClient, createWalletClient, http, parseEther, formatUnits, custom } from 'viem';
import { sepolia } from 'viem/chains';
import {
    UNISWAP_CONTRACTS,
    USDC_ADDRESSES,
    SWAP_ROUTER_ABI,
    QUOTER_V2_ABI,
} from '../config/contracts';

const getPublicClient = () => {
    return createPublicClient({
        chain: sepolia,
        transport: http(),
    });
};

const getWalletClient = async () => {
    if (!window.ethereum) throw new Error('No wallet found');

    // Ensure wallet is on Sepolia before executing swap
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }], // 11155111 in hex
        });
    } catch (switchError) {
        console.error('Failed to switch to Sepolia:', switchError);
        throw new Error('Please switch your wallet to Ethereum Sepolia to complete the swap.');
    }

    return createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum),
    });
};

// Get a quote for how much USDC you'll receive for a given ETH amount
export const getSwapQuote = async (ethAmount) => {
    const publicClient = getPublicClient();
    const amountIn = parseEther(ethAmount.toString());

    try {
        const result = await publicClient.simulateContract({
            address: UNISWAP_CONTRACTS.quoterV2,
            abi: QUOTER_V2_ABI,
            functionName: 'quoteExactInputSingle',
            args: [
                {
                    tokenIn: UNISWAP_CONTRACTS.weth,
                    tokenOut: USDC_ADDRESSES.Ethereum_Sepolia,
                    amountIn: amountIn,
                    fee: UNISWAP_CONTRACTS.poolFee,
                    sqrtPriceLimitX96: 0n,
                },
            ],
        });

        const usdcOut = formatUnits(result.result[0], 6);
        return {
            amountOut: usdcOut,
            gasEstimate: result.result[3]?.toString() || '0',
        };
    } catch (error) {
        console.error('Swap quote failed:', error);
        throw new Error('Could not get swap quote. The ETH/USDC pool may have insufficient liquidity.');
    }
};

// Execute ETH → USDC swap via Uniswap SwapRouter02
export const executeSwap = async (ethAmount, minUsdcOut, userAddress) => {
    const walletClient = await getWalletClient();
    const publicClient = getPublicClient();
    const amountIn = parseEther(ethAmount.toString());

    // Calculate minimum USDC out with 1% slippage tolerance
    const minOut = BigInt(Math.floor(parseFloat(minUsdcOut) * 0.99 * 1e6));

    try {
        const { request } = await publicClient.simulateContract({
            account: userAddress,
            address: UNISWAP_CONTRACTS.swapRouter02,
            abi: SWAP_ROUTER_ABI,
            functionName: 'exactInputSingle',
            args: [
                {
                    tokenIn: UNISWAP_CONTRACTS.weth,
                    tokenOut: USDC_ADDRESSES.Ethereum_Sepolia,
                    fee: UNISWAP_CONTRACTS.poolFee,
                    recipient: userAddress,
                    amountIn: amountIn,
                    amountOutMinimum: minOut,
                    sqrtPriceLimitX96: 0n,
                },
            ],
            value: amountIn, // Send ETH with the transaction
        });

        const hash = await walletClient.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
            hash,
            receipt,
            usdcReceived: minUsdcOut,
        };
    } catch (error) {
        console.error('Swap execution failed:', error);
        if (error.message?.includes('insufficient')) {
            throw new Error('Insufficient ETH balance for this swap.');
        }
        throw new Error('Swap failed. Please try again.');
    }
};
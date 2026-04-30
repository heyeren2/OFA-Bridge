/**
 * attestationService.js
 *
 * Dedicated service for all Circle CCTP attestation-related logic.
 * Handles:
 *   - Fetching attestation status from Circle's Iris API
 *   - Simulating receiveMessage on-chain (via public RPC — no wallet required)
 *   - Detecting CCTP V2 message expiry vs. nonce-already-used vs. pending
 *
 * Imported by:
 *   - Activity.jsx  (background proactive check on page load)
 *   - bridgeService.js (revert reason decoding inside retryMint)
 */

// CCTP Testnet Source Domain IDs (used to build the Iris API URL)
export const CCTP_DOMAIN_IDS = {
    'Ethereum Sepolia': 0,
    'Avalanche Fuji': 1,
    'Optimism Sepolia': 2,
    'Arbitrum Sepolia': 3,
    'Base Sepolia': 6,
    'Unichain Sepolia': 10,
    'Monad Testnet': 15,
    'HyperEVM Testnet': 19,
    'Sei Testnet': 16,
    'Linea Sepolia': 11,
    'Ink Testnet': 21,
    'Plume Testnet': 22,
    'Arc Testnet': 26,
};

// Circle's official CCTP Testnet MessageTransmitter contract address
// (same address across all supported EVM testnets)
export const CCTP_MESSAGE_TRANSMITTER = {
    'Ethereum Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'Base Sepolia':     '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'Arbitrum Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'Optimism Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'Avalanche Fuji':   '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'Arc Testnet':      '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'Unichain Sepolia': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'Sei Testnet':      '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'Monad Testnet':    '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'HyperEVM Testnet': '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'Linea Sepolia':    '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'Ink Testnet':      '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    'Plume Testnet':    '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
};

const USED_NONCES_ABI = [{
    name: 'usedNonces',
    type: 'function',
    inputs: [{ name: 'nonce', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
}];

// keccak256('MessageSent(bytes)')
const MESSAGE_SENT_TOPIC = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036';

/**
 * Checks whether a CCTP burn's nonce has already been consumed on the destination chain
 * by reading the MessageTransmitter.usedNonces() mapping directly on-chain.
 *
 * This works even when Circle's Iris API has no record of the transaction (e.g., Arc Testnet).
 * A non-zero return value means the USDC was already minted — the transaction is complete.
 *
 * @returns {Promise<boolean>} true = already minted, false = not yet / unknown
 */
export const checkNonceUsedOnChain = async ({ burnTxHash, fromChain, toChain }) => {
    try {
        const { createPublicClient, http, keccak256, encodePacked } = await import('viem');
        const { getChainByName } = await import('../config/chains');

        const fromConfig = getChainByName(fromChain);
        const toConfig   = getChainByName(toChain);
        if (!fromConfig?.rpc || !toConfig?.rpc) return false;

        const makeViemChain = (cfg, name) => ({
            id: cfg.chainId,
            name,
            nativeCurrency: cfg.nativeCurrency || { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: [cfg.rpc] } },
        });

        // Step 1 — get burn tx receipt from source chain
        const sourceClient = createPublicClient({
            chain: makeViemChain(fromConfig, fromChain),
            transport: http(fromConfig.rpc),
        });
        const receipt = await sourceClient.getTransactionReceipt({ hash: burnTxHash });
        if (!receipt) return false;

        // Step 2 — find the MessageSent(bytes) log
        const msgLog = receipt.logs.find(
            log => log.topics[0]?.toLowerCase() === MESSAGE_SENT_TOPIC
        );
        if (!msgLog) return false;

        // Step 3 — decode message bytes from ABI-encoded log data
        // Layout: [32B offset][32B length][message bytes]
        const rawHex = msgLog.data.replace('0x', '');
        const messageHex = rawHex.slice(128); // skip offset + length (64 hex chars each)

        // CCTP message layout: version(4B) sourceDomain(4B) destDomain(4B) nonce(8B) ...
        const sourceDomain = parseInt(messageHex.slice(8, 16), 16);   // bytes 4-7
        const nonce        = BigInt('0x' + messageHex.slice(24, 40)); // bytes 12-19

        // Step 4 — compute nonce key: keccak256(abi.encodePacked(uint32, uint64))
        const nonceKey = keccak256(encodePacked(['uint32', 'uint64'], [sourceDomain, nonce]));

        // Step 5 — call usedNonces on destination chain
        const transmitterAddr = CCTP_MESSAGE_TRANSMITTER[toChain];
        if (!transmitterAddr) return false;

        const destClient = createPublicClient({
            chain: makeViemChain(toConfig, toChain),
            transport: http(toConfig.rpc),
        });
        const result = await destClient.readContract({
            address: transmitterAddr,
            abi: USED_NONCES_ABI,
            functionName: 'usedNonces',
            args: [nonceKey],
        });

        // Non-zero = nonce was consumed = USDC was minted on destination
        return result > 0n;

    } catch (err) {
        console.warn('[AttestationService] checkNonceUsedOnChain error:', err.message);
        return false;
    }
};

// Minimal ABI for the receiveMessage function on the MessageTransmitter contract
export const RECEIVE_MESSAGE_ABI = [{
    name: 'receiveMessage',
    type: 'function',
    inputs: [
        { name: 'message',     type: 'bytes' },
        { name: 'attestation', type: 'bytes' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
}];

/**
 * Fetches the attestation for a given burn transaction from Circle's Iris API.
 *
 * @returns {{ message: string, attestation: string } | null}
 *   The attestation data if complete, or null if not yet available.
 */
export const fetchAttestation = async (burnTxHash, fromChain) => {
    const sourceDomain = CCTP_DOMAIN_IDS[fromChain];
    if (sourceDomain === undefined) return null;

    const apiUrl = `${import.meta.env.VITE_CIRCLE_ATTESTATION_API}/${sourceDomain}?transactionHash=${burnTxHash}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) return null;

        const data = await response.json();
        if (!data.messages || data.messages.length === 0) return null;

        const msg = data.messages[0];
        if (msg.status !== 'complete') return null;

        return { message: msg.message, attestation: msg.attestation };
    } catch {
        return null;
    }
};

/**
 * Proactive background check: determines the real status of a mint_failed transaction
 * by fetching from Circle's Iris API and simulating the receiveMessage call on-chain
 * using a public RPC — no connected wallet required.
 *
 * @returns {Promise<'pending' | 'ready' | 'expired' | 'already_minted' | 'unknown'>}
 *
 *   'pending'        — Circle hasn't completed the attestation yet (normal for recent burns)
 *   'ready'          — Attestation is valid and the on-chain sim passed (safe to Remint now)
 *   'expired'        — CCTP V2 message validity window has passed (show Re-Attest button)
 *   'already_minted' — The nonce was already consumed by a prior successful mint
 *   'unknown'        — Could not determine (network error, unsupported chain, sim unknown error)
 */
export const checkAttestationStatus = async ({ burnTxHash, fromChain, toChain, walletAddress }) => {
    try {
        // 1. Get attestation from Circle's Iris API
        const attestationData = await fetchAttestation(burnTxHash, fromChain);
        if (!attestationData) return 'pending';

        // 2. Build a public-RPC client to simulate receiveMessage (read-only, no wallet pop-up)
        const transmitterAddress = CCTP_MESSAGE_TRANSMITTER[toChain];
        if (!transmitterAddress) return 'unknown';

        const { createPublicClient, http } = await import('viem');
        const { getChainByName } = await import('../config/chains');

        const destChainConfig = getChainByName(toChain);
        if (!destChainConfig?.rpc) return 'unknown';

        const publicClient = createPublicClient({
            chain: {
                id: destChainConfig.chainId,
                name: toChain,
                nativeCurrency: destChainConfig.nativeCurrency || { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: { default: { http: [destChainConfig.rpc] } },
            },
            transport: http(destChainConfig.rpc),
        });

        // 3. Simulate — if this passes, the attestation is still valid, user can mint right now
        try {
            await publicClient.simulateContract({
                address: transmitterAddress,
                abi: RECEIVE_MESSAGE_ABI,
                functionName: 'receiveMessage',
                args: [attestationData.message, attestationData.attestation],
                account: walletAddress,
            });
            return 'ready';
        } catch (simErr) {
            const reason = (simErr.shortMessage || simErr.details || simErr.message || '').toLowerCase();

            if (
                reason.includes('expired') ||
                reason.includes('re-sign') ||
                reason.includes('must be re-signed') ||
                reason.includes('message expired')
            ) {
                return 'expired';
            }

            if (
                reason.includes('nonce') ||
                reason.includes('already used') ||
                reason.includes('already executed')
            ) {
                return 'already_minted';
            }

            console.warn('[AttestationService] Unknown simulation error:', reason);
            return 'unknown';
        }
    } catch (err) {
        console.warn('[AttestationService] checkAttestationStatus error:', err.message);
        return 'unknown';
    }
};

/**
 * Decodes the revert reason from a reverted mint receipt.
 * Used inside retryMint() after waitForTransactionReceipt() returns status='reverted'.
 *
 * @returns {Promise<'expired' | 'nonce_used' | 'unknown'>}
 */
export const decodeRevertReason = async ({ transmitterAddress, attestationData, destChainConfig, walletAddress }) => {
    try {
        const { createPublicClient, custom } = await import('viem');

        // Use wallet's RPC transport (user is already connected to this chain at this point)
        const publicClient = createPublicClient({
            chain: { id: destChainConfig.chainId },
            transport: custom(window.ethereum),
        });

        try {
            await publicClient.simulateContract({
                address: transmitterAddress,
                abi: RECEIVE_MESSAGE_ABI,
                functionName: 'receiveMessage',
                args: [attestationData.message, attestationData.attestation],
                account: walletAddress,
            });
            // Simulation passed — revert was transient, treat conservatively as nonce used
            return 'nonce_used';
        } catch (simErr) {
            const reason = (simErr.shortMessage || simErr.details || simErr.message || '').toLowerCase();

            if (
                reason.includes('expired') ||
                reason.includes('re-sign') ||
                reason.includes('must be re-signed') ||
                reason.includes('message expired')
            ) {
                return 'expired';
            }

            return 'nonce_used';
        }
    } catch {
        return 'unknown';
    }
};

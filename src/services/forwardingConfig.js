/**
 * Configuration for the Circle Forwarding Service.
 *
 * `isForwardingEnabled` — master switch. Set to false if Circle's Forwarding
 * Service is down or you want to force manual minting globally.
 *
 * `DEFAULT_MINT_MODE` — what mode new sessions start in.
 *   'manual' → user signs the mint on the destination chain (opt-in to auto)
 *   'auto'   → Circle's forwarder mints automatically (gasless destination)
 *
 * `CHAINS_WITHOUT_FORWARDER_SUPPORT` — chains where customBurnWithHook is not
 * deployed. Using customFee + useForwarder together on these chains causes:
 *   "Action cctp.v2.customBurnWithHook is not supported"
 * These chains are ALWAYS forced to manual regardless of user preference.
 * Add new chains here if you hit the same error on another network.
 *   - displayNames   → matches chain.name  (used in Bridge.jsx)
 *   - bridgeKitNames → matches chain.bridgeKitName (used in bridgeService.js)
 */
export const FORWARDING_CONFIG = {
    isForwardingEnabled: true,
};

export const DEFAULT_MINT_MODE = 'manual'; // 'manual' | 'auto'

export const CHAINS_WITHOUT_FORWARDER_SUPPORT = {
    displayNames: ['Arc Testnet', 'Plume Testnet'],
    bridgeKitNames: ['Arc_Testnet', 'Plume_Testnet'],
};
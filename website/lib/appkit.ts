import { createAppKit } from "@reown/appkit";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { WALLETCONNECT_PROJECT_ID, ROBINHOOD_TESTNET, ROBINHOOD_MAINNET } from "../config/web3";

// Custom EVM chain definitions for AppKit — Robinhood Chain isn't in AppKit's
// built-in network list, so we describe both networks ourselves.
export const robinhoodTestnetNetwork: AppKitNetwork = {
  id: ROBINHOOD_TESTNET.CHAIN_ID,
  caipNetworkId: `eip155:${ROBINHOOD_TESTNET.CHAIN_ID}`,
  chainNamespace: "eip155",
  name: ROBINHOOD_TESTNET.CHAIN_NAME,
  nativeCurrency: { name: "Robinhood", symbol: ROBINHOOD_TESTNET.CURRENCY_SYMBOL, decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_TESTNET.RPC_URL] } },
  blockExplorers: { default: { name: "Explorer", url: ROBINHOOD_TESTNET.EXPLORER_URL } },
  testnet: true,
};

export const robinhoodMainnetNetwork: AppKitNetwork = {
  id: ROBINHOOD_MAINNET.CHAIN_ID,
  caipNetworkId: `eip155:${ROBINHOOD_MAINNET.CHAIN_ID}`,
  chainNamespace: "eip155",
  name: ROBINHOOD_MAINNET.CHAIN_NAME,
  nativeCurrency: { name: "Robinhood", symbol: ROBINHOOD_MAINNET.CURRENCY_SYMBOL, decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_MAINNET.RPC_URL] } },
  blockExplorers: { default: { name: "Explorer", url: ROBINHOOD_MAINNET.EXPLORER_URL } },
  testnet: false,
};

let initialized = false;

/**
 * Boots the Reown AppKit wallet-connect modal (WalletConnect, injected wallets
 * like MetaMask/Robinhood Wallet/Base Account, and email login) — the same
 * modal shape shown in the reference screenshot. Call once on the client.
 */
export function initAppKit() {
  if (initialized || typeof window === "undefined") return;
  if (!WALLETCONNECT_PROJECT_ID) {
    // No Project ID configured yet — skip booting the modal so the rest of the
    // site still renders. connectWallet() will show a clear message instead.
    return;
  }

  createAppKit({
    adapters: [new EthersAdapter()],
    networks: [robinhoodTestnetNetwork, robinhoodMainnetNetwork],
    projectId: WALLETCONNECT_PROJECT_ID,
    metadata: {
      name: "MINI BROKERS",
      description: "Mini Brokers NFT Mint Terminal",
      url: typeof window !== "undefined" ? window.location.origin : "https://minibrokers.xyz",
      icons: ["/favicon.ico"],
    },
    features: {
      email: true,
      socials: [],
      analytics: false,
    },
  });

  initialized = true;
}

export function isAppKitReady() {
  return initialized;
}

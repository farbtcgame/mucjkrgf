export interface ChainConfig {
  CHAIN_ID: number;
  CHAIN_NAME: string;
  RPC_URL: string;
  EXPLORER_URL: string;
  CURRENCY_SYMBOL: string;
}

// ==========================================
// Robinhood Chain — Testnet + Mainnet
// ==========================================
export const ROBINHOOD_TESTNET: ChainConfig = {
  CHAIN_ID: 46630,
  CHAIN_NAME: "Robinhood Chain Testnet",
  RPC_URL: "https://rpc.testnet.chain.robinhood.com",
  EXPLORER_URL: "https://explorer.testnet.chain.robinhood.com",
  CURRENCY_SYMBOL: "RH",
};

export const ROBINHOOD_MAINNET: ChainConfig = {
  CHAIN_ID: 4663,
  CHAIN_NAME: "Robinhood Chain",
  RPC_URL: "https://rpc.mainnet.chain.robinhood.com",
  EXPLORER_URL: "https://robinhoodchain.blockscout.com",
  CURRENCY_SYMBOL: "RH",
};

// Production defaults to Robinhood Chain MAINNET. This does NOT depend on
// NEXT_PUBLIC_NETWORK being set — if the env var is missing, unset, or set
// to anything other than "testnet", the site resolves to mainnet. Testnet
// is opt-in only, for local development, via NEXT_PUBLIC_NETWORK=testnet.
const USE_TESTNET = process.env.NEXT_PUBLIC_NETWORK === "testnet";

export const ACTIVE_CHAIN: ChainConfig = USE_TESTNET ? ROBINHOOD_TESTNET : ROBINHOOD_MAINNET;

// Derived flag kept for the Alchemy NFT API base URL below.
const USE_MAINNET = ACTIVE_CHAIN.CHAIN_ID === ROBINHOOD_MAINNET.CHAIN_ID;

export interface Web3Config extends ChainConfig {
  NFT_CONTRACT_ADDRESS: string;
  MINT_TOKEN_ADDRESS: string;
  BURN_LAB_CONTRACT_ADDRESS: string;
}

export const WEB3_CONFIG: Web3Config = {
  ...ACTIVE_CHAIN,
  // Fill this in after `npm run deploy:testnet` / `deploy:mainnet` in /hardhat.
  NFT_CONTRACT_ADDRESS:
    process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS || "0xA071a23aC8dbDD1e679828F837Bc66E1362694f6",
  // Fixed mint payment token, as specified.
  MINT_TOKEN_ADDRESS: "0xe934e36a439c94017b64a3fece66af12099abf50",
  // Burn Lab — permanent-burn rewards contract. NFTs sent here go straight
  // to the dead address (0x000...dEaD); this contract never holds custody.
  BURN_LAB_CONTRACT_ADDRESS:
    process.env.NEXT_PUBLIC_BURN_LAB_CONTRACT_ADDRESS || "0x427720F18f6BfaFbF7A8a4c135a4B9A98f2F803c",
};

// ==========================================
// WalletConnect
// ==========================================
// Get a free Project ID at https://cloud.reown.com (30 seconds, no cost).
// Left blank on purpose — fill in .env.local as NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

// Chains offered to WalletConnect sessions (mobile wallets, QR connections).
// The active chain is listed first so wallets default to it; the other
// Robinhood network is offered as an optional chain so a session isn't
// dropped if the user's wallet is set to the other network.
export const WALLETCONNECT_CHAINS: { id: number; rpc: string }[] = [
  { id: ACTIVE_CHAIN.CHAIN_ID, rpc: ACTIVE_CHAIN.RPC_URL },
  {
    id: ACTIVE_CHAIN.CHAIN_ID === ROBINHOOD_TESTNET.CHAIN_ID ? ROBINHOOD_MAINNET.CHAIN_ID : ROBINHOOD_TESTNET.CHAIN_ID,
    rpc: ACTIVE_CHAIN.CHAIN_ID === ROBINHOOD_TESTNET.CHAIN_ID ? ROBINHOOD_MAINNET.RPC_URL : ROBINHOOD_TESTNET.RPC_URL,
  },
];

// ==========================================
// $StonkBroker token — buy link (OpenSea)
// ==========================================
export const STONKBROKER_BUY_URL =
  "https://opensea.io/collection/stonkbrokers-434284142/tokens?timeframe=seven_days";

// ==========================================
// IPFS gateway used for the rotating preview-card images on the mint page
// ==========================================
export const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io/ipfs/";

// ==========================================
// Alchemy — used by the Staking page to look up which Mini Brokers NFTs
// the connected wallet owns (Alchemy NFT API: getNFTsForOwner).
// Get a free API key at https://dashboard.alchemy.com
// ==========================================
export const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "";

// Alchemy's NFT API base URL, per network. Robinhood Chain is supported by
// Alchemy under the "robinhood-mainnet" / "robinhood-testnet" subdomains.
export const ALCHEMY_NFT_API_BASE = USE_MAINNET
  ? `https://robinhood-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}`
  : `https://robinhood-testnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}`;

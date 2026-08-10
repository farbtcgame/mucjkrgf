"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { WEB3_CONFIG, WALLETCONNECT_PROJECT_ID, WALLETCONNECT_CHAINS } from "../config/web3";
import NFT_ABI from "../abi/NFT.json";
import ERC20_ABI from "../abi/ERC20.json";
import BURN_LAB_ABI from "../abi/BurnLab.json";
import ERC721_MINIMAL_ABI from "../abi/ERC721Minimal.json";
import {
  WALLET_CATALOG,
  WalletOption,
  EIP1193Provider,
  EIP6963ProviderDetail,
  requestInjectedProviders,
  findInjectedByRdns,
  getFallbackInjectedProvider,
  connectWalletConnect,
  disconnectProvider,
  switchOrAddChain,
} from "../lib/wallet";

// ==========================================================
// Wallet modal icon — prefers a live EIP-6963 icon (announced by the
// installed extension itself) and falls back to the catalog's static
// logoUrl, and finally to the existing colored-initials box if neither
// image loads. Same 36x36 box, spacing, and colors as before.
// ==========================================================
const WalletLogo: React.FC<{ option: WalletOption; src?: string }> = ({ option, src }) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (!src || imgFailed) {
    return (
      <span
        className="h-9 w-9 flex items-center justify-center text-[11px] font-bold text-white shrink-0"
        style={{ backgroundColor: option.accentColor }}
      >
        {option.initials}
      </span>
    );
  }

  return (
    <span
      className="h-9 w-9 flex items-center justify-center shrink-0 p-1.5"
      style={{ backgroundColor: option.accentColor }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={option.name}
        className="w-full h-full object-contain"
        onError={() => setImgFailed(true)}
      />
    </span>
  );
};

export type TxState =
  | "IDLE"
  | "CONNECTING_WALLET"
  | "AWAITING_SIGNATURE"
  | "CONFIRM_IN_WALLET"
  | "TRANSACTION_PENDING"
  | "MINT_SUCCESSFUL"
  | "TRANSACTION_FAILED"
  | "TRANSACTION_REJECTED"
  | "WRONG_NETWORK"
  | "INSUFFICIENT_BALANCE"
  // Burn Lab-specific states (additive; existing flows never set these).
  | "CHECKING_APPROVAL"
  | "APPROVAL_REQUIRED"
  | "BURN_SUCCESSFUL"
  | "INSUFFICIENT_REWARD_BALANCE";

// ==========================================================
// Burn Lab types (additive — does not touch existing mint types)
// ==========================================================
export interface BurnReward {
  token: string;
  symbol: string;
  decimals: number;
  amountPerNFT: bigint;
  active: boolean;
  totalLoaded: bigint;
  totalDistributed: bigint;
  contractBalance: bigint;
  availableCapacity: bigint;
}

const LAST_WALLET_STORAGE_KEY = "mb_last_wallet_id";

interface Web3ContextType {
  account: string | null;
  chainId: number | null;
  // Raw EIP-1193 provider of the currently connected wallet (MetaMask,
  // Rabby, Coinbase Wallet, WalletConnect session, etc).
  walletProvider: EIP1193Provider | null;
  // ethers Signer for the connected account, kept in sync automatically.
  signer: ethers.Signer | null;
  isCorrectNetwork: boolean;
  isOwner: boolean;
  txState: TxState;
  txHash: string | null;
  errorMessage: string | null;
  totalSupply: bigint;
  maxSupply: bigint;
  mintPrice: bigint;
  isPaused: boolean;
  publicMintEnabled: boolean;
  ownerAddress: string;
  baseUri: string;
  revealed: boolean;
  royaltyFeeBps: number;
  tokenSymbol: string;
  tokenDecimals: number;
  contractFunctions: string[];
  walletConnectReady: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  // Alias of switchNetwork with an explicit name for Robinhood Chain.
  switchToRobinhood: () => Promise<void>;
  mintNft: (quantity: number) => Promise<void>;
  refreshContractData: () => Promise<void>;
  callContractMethod: (methodName: string, args: any[]) => Promise<boolean>;

  // ===== Burn Lab (additive — separate contract, separate state) =====
  burnLabConfigured: boolean;
  burnLabOwnerAddress: string;
  isBurnLabOwner: boolean;
  burnRewards: BurnReward[];
  burnRewardsLoading: boolean;
  heldNftCount: number;
  refreshBurnLabData: () => Promise<void>;
  checkBurnApproval: (ownerAddress: string) => Promise<boolean>;
  approveBurnLab: () => Promise<boolean>;
  executeBurn: (tokenIds: string[]) => Promise<boolean>;
  recoverBurnNFT: (tokenId: string, recipient: string) => Promise<boolean>;
  addBurnReward: (token: string, amountPerNFTRaw: bigint) => Promise<boolean>;
  updateBurnRewardAmount: (token: string, newAmountPerNFTRaw: bigint) => Promise<boolean>;
  setBurnRewardActive: (token: string, active: boolean) => Promise<boolean>;
  loadBurnRewardTokens: (token: string, amountRaw: bigint) => Promise<boolean>;
  withdrawBurnRewardTokens: (token: string, amountRaw: bigint) => Promise<boolean>;
  readErc20Meta: (tokenAddress: string) => Promise<{ symbol: string; decimals: number } | null>;
}

const Web3Context = createContext<Web3ContextType>({} as Web3ContextType);

export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // The new connection layer works for injected wallets regardless of
  // whether a WalletConnect Project ID is configured, so the "ready" flag
  // is no longer gated behind it (fixes the old behavior where the whole
  // connect UI disappeared without a WalletConnect Project ID).
  const walletConnectReady = true;

  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletProvider, setWalletProvider] = useState<EIP1193Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  // Wallet connection modal state
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [walletModalError, setWalletModalError] = useState<string | null>(null);
  // Live wallet icons announced via EIP-6963 by installed extensions,
  // keyed by rdns. Populated when the modal opens; takes priority over the
  // catalog's static logoUrl when a match is found.
  const [injectedWalletIcons, setInjectedWalletIcons] = useState<Record<string, string>>({});

  const [txState, setTxState] = useState<TxState>("IDLE");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [totalSupply, setTotalSupply] = useState<bigint>(BigInt(0));
  const [maxSupply, setMaxSupply] = useState<bigint>(BigInt(10000));
  const [mintPrice, setMintPrice] = useState<bigint>(BigInt(0));
  const [isPaused, setIsPaused] = useState(false);
  const [publicMintEnabled, setPublicMintEnabled] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState("0x0000000000000000000000000000000000000000");
  const [baseUri, setBaseUri] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [royaltyFeeBps, setRoyaltyFeeBps] = useState(0);
  const [tokenSymbol, setTokenSymbol] = useState(WEB3_CONFIG.CURRENCY_SYMBOL);
  const [tokenDecimals, setTokenDecimals] = useState(18);

  const contractFunctions = (NFT_ABI as any[])
    .filter((item) => item.type === "function")
    .map((item) => item.name);

  const isOwner = !!account && account.toLowerCase() === ownerAddress.toLowerCase();

  const getReadProvider = () => new ethers.JsonRpcProvider(WEB3_CONFIG.RPC_URL);

  const getSigner = useCallback(async () => {
    if (!walletProvider) throw new Error("Wallet not connected");
    const provider = new ethers.BrowserProvider(walletProvider);
    return provider.getSigner();
  }, [walletProvider]);

  const refreshContractData = useCallback(async () => {
    try {
      const provider = getReadProvider();
      const nft = new ethers.Contract(WEB3_CONFIG.NFT_CONTRACT_ADDRESS, NFT_ABI, provider);

      const [supply, max, price, mp, pme, ownr, uri, rev, royalty] = await Promise.all([
        nft.totalSupply().catch(() => BigInt(0)),
        nft.MAX_SUPPLY().catch(() => BigInt(10000)),
        nft.mintPrice().catch(() => BigInt(0)),
        nft.mintingPaused().catch(() => false),
        nft.publicMintEnabled().catch(() => false),
        nft.owner().catch(() => "0x0000000000000000000000000000000000000000"),
        nft.revealed().catch(() => false).then((r: boolean) => (r ? nft.baseURI() : nft.unrevealedURI())),
        nft.revealed().catch(() => false),
        nft.royaltyInfo(1, 10000).catch(() => [null, 0]),
      ]);

      setTotalSupply(supply);
      setMaxSupply(max);
      setMintPrice(price);
      setIsPaused(mp);
      setPublicMintEnabled(pme);
      setOwnerAddress(ownr);
      setBaseUri(uri);
      setRevealed(rev);
      setRoyaltyFeeBps(Number(royalty[1] ?? 0));

      const tokenContract = new ethers.Contract(WEB3_CONFIG.MINT_TOKEN_ADDRESS, ERC20_ABI, provider);
      const [sym, dec] = await Promise.all([
        tokenContract.symbol().catch(() => WEB3_CONFIG.CURRENCY_SYMBOL),
        tokenContract.decimals().catch(() => 18),
      ]);
      setTokenSymbol(sym);
      setTokenDecimals(Number(dec));
    } catch (err) {
      console.error("Error fetching contract data:", err);
    }
  }, []);

  useEffect(() => {
    refreshContractData();
    const interval = setInterval(refreshContractData, 20000);
    return () => clearInterval(interval);
  }, [refreshContractData]);

  // ==========================================================
  // Wallet connection layer
  // ==========================================================
  const providerListenersRef = useRef<{
    provider: EIP1193Provider;
    onAccountsChanged: (accounts: string[]) => void;
    onChainChanged: (id: string | number) => void;
    onDisconnect: () => void;
  } | null>(null);

  const detachProviderListeners = useCallback(() => {
    const current = providerListenersRef.current;
    if (current?.provider?.removeListener) {
      current.provider.removeListener("accountsChanged", current.onAccountsChanged);
      current.provider.removeListener("chainChanged", current.onChainChanged);
      current.provider.removeListener("disconnect", current.onDisconnect);
    }
    providerListenersRef.current = null;
  }, []);

  const disconnectWallet = useCallback(async () => {
    const providerToClose = providerListenersRef.current?.provider ?? walletProvider;
    detachProviderListeners();
    await disconnectProvider(providerToClose);
    setAccount(null);
    setChainId(null);
    setWalletProvider(null);
    setSigner(null);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LAST_WALLET_STORAGE_KEY);
      } catch {
        // ignore storage errors (private browsing, etc.)
      }
    }
  }, [walletProvider, detachProviderListeners]);

  const attachProviderListeners = useCallback(
    (provider: EIP1193Provider) => {
      if (!provider?.on) return;

      const onAccountsChanged = (accounts: string[]) => {
        if (!accounts || accounts.length === 0) {
          disconnectWallet();
        } else {
          setAccount(accounts[0]);
        }
      };
      const onChainChanged = (id: string | number) => {
        const parsed = typeof id === "string" ? parseInt(id, 16) : Number(id);
        setChainId(parsed);
      };
      const onDisconnect = () => {
        disconnectWallet();
      };

      provider.on("accountsChanged", onAccountsChanged);
      provider.on("chainChanged", onChainChanged);
      provider.on("disconnect", onDisconnect);

      providerListenersRef.current = { provider, onAccountsChanged, onChainChanged, onDisconnect };
    },
    [disconnectWallet]
  );

  useEffect(() => {
    return () => {
      detachProviderListeners();
    };
  }, [detachProviderListeners]);

  const finalizeConnection = useCallback(
    async (provider: EIP1193Provider, walletId: string, silent = false) => {
      let accounts: string[] = [];
      try {
        accounts = silent
          ? await provider.request({ method: "eth_accounts" })
          : await provider.request({ method: "eth_requestAccounts" });
      } catch (err: any) {
        if (!silent && err?.code !== 4001) {
          // Some wallets (namely certain WalletConnect sessions) don't
          // support eth_requestAccounts after connect() — fall back.
          accounts = await provider.request({ method: "eth_accounts" });
        } else {
          throw err;
        }
      }

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned by wallet.");
      }

      const browserProvider = new ethers.BrowserProvider(provider);
      const network = await browserProvider.getNetwork();

      detachProviderListeners();
      attachProviderListeners(provider);

      setAccount(accounts[0]);
      setChainId(Number(network.chainId));
      setWalletProvider(provider);

      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(LAST_WALLET_STORAGE_KEY, walletId);
        } catch {
          // ignore storage errors
        }
      }

      setIsWalletModalOpen(false);
      setWalletModalError(null);
    },
    [attachProviderListeners, detachProviderListeners]
  );

  // Opens the wallet selection modal. Kept as the same function identity
  // every existing component already calls.
  const connectWallet = useCallback(async () => {
    setWalletModalError(null);
    setIsWalletModalOpen(true);
  }, []);

  const closeWalletModal = useCallback(() => {
    if (connectingWalletId) return;
    setIsWalletModalOpen(false);
    setWalletModalError(null);
  }, [connectingWalletId]);

  // Ask installed extensions to announce themselves so the modal can show
  // each one's own live logo (EIP-6963 info.icon) instead of the static
  // fallback. Purely additive — connection behavior is unchanged.
  useEffect(() => {
    if (!isWalletModalOpen) return;
    let cancelled = false;
    (async () => {
      const injected: EIP6963ProviderDetail[] = await requestInjectedProviders();
      if (cancelled) return;
      const iconMap: Record<string, string> = {};
      injected.forEach((detail) => {
        if (detail.info?.rdns && detail.info?.icon) {
          iconMap[detail.info.rdns] = detail.info.icon;
        }
      });
      setInjectedWalletIcons(iconMap);
    })();
    return () => {
      cancelled = true;
    };
  }, [isWalletModalOpen]);

  const selectWallet = useCallback(
    async (option: WalletOption) => {
      setWalletModalError(null);
      setConnectingWalletId(option.id);
      try {
        let provider: EIP1193Provider | null = null;

        // 1. Try to find the wallet as an installed browser extension.
        if (option.rdns) {
          const injected = await requestInjectedProviders();
          provider = findInjectedByRdns(injected, option.rdns);
        }

        // 2. Generic "Browser Wallet" option — use whatever is injected.
        if (!provider && option.id === "injected") {
          provider = getFallbackInjectedProvider();
        }

        // 3. Wallets that are WalletConnect-first (WalletConnect itself,
        //    Rainbow, Trust Wallet) connect via WalletConnect directly if
        //    no matching extension was found.
        if (!provider && option.kind === "walletconnect") {
          if (!WALLETCONNECT_PROJECT_ID) {
            throw new Error(
              "WalletConnect is not configured for this site yet. Try a browser extension wallet instead."
            );
          }
          provider = await connectWalletConnect(WALLETCONNECT_PROJECT_ID, WALLETCONNECT_CHAINS);
        }

        // 4. Extension-first wallets (MetaMask, Rabby, Coinbase Wallet)
        //    that weren't found installed — offer a WalletConnect fallback
        //    so their mobile apps still work, otherwise point to install.
        if (!provider && option.rdns && option.kind === "injected") {
          if (WALLETCONNECT_PROJECT_ID) {
            provider = await connectWalletConnect(WALLETCONNECT_PROJECT_ID, WALLETCONNECT_CHAINS);
          } else if (option.downloadUrl && typeof window !== "undefined") {
            window.open(option.downloadUrl, "_blank", "noopener,noreferrer");
            throw new Error(`${option.name} was not detected. Opening the install page in a new tab.`);
          }
        }

        if (!provider) {
          throw new Error(`${option.name} was not detected in this browser.`);
        }

        await finalizeConnection(provider, option.id);
      } catch (err: any) {
        console.error("Wallet connection error:", err);
        if (err?.code === 4001 || /reject/i.test(err?.message || "")) {
          setWalletModalError("Connection request was rejected.");
        } else {
          setWalletModalError(err?.message || "Failed to connect wallet.");
        }
      } finally {
        setConnectingWalletId(null);
      }
    },
    [finalizeConnection]
  );

  // Silent reconnect on page load, using the last wallet the user
  // successfully connected with. Never triggers a popup or QR modal —
  // only reconnects if the wallet already authorizes this site.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastWalletId: string | null = null;
    try {
      lastWalletId = window.localStorage.getItem(LAST_WALLET_STORAGE_KEY);
    } catch {
      lastWalletId = null;
    }
    if (!lastWalletId) return;

    const option = WALLET_CATALOG.find((w) => w.id === lastWalletId);
    if (!option) return;

    (async () => {
      try {
        let provider: EIP1193Provider | null = null;

        if (option.rdns) {
          const injected = await requestInjectedProviders();
          provider = findInjectedByRdns(injected, option.rdns);
        }
        if (!provider && option.id === "injected") {
          provider = getFallbackInjectedProvider();
        }

        // Never silently open WalletConnect — only reconnect wallets that
        // are already sitting in the page (no popup needed).
        if (!provider) return;

        const accounts: string[] = await provider.request({ method: "eth_accounts" });
        if (!accounts || accounts.length === 0) return;

        await finalizeConnection(provider, option.id, true);
      } catch (err) {
        console.error("Silent wallet reconnect failed:", err);
      }
    })();
    // Runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps `signer` in sync with the connected account/network. Purely
  // additive — internal contract calls below still use getSigner()
  // directly, unchanged from before.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!walletProvider || !account) {
        setSigner(null);
        return;
      }
      try {
        const s = await getSigner();
        if (!cancelled) setSigner(s);
      } catch {
        if (!cancelled) setSigner(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletProvider, account, chainId, getSigner]);

  const switchNetwork = useCallback(async () => {
    try {
      if (!walletProvider) {
        await connectWallet();
        return;
      }
      await switchOrAddChain(walletProvider, {
        chainId: WEB3_CONFIG.CHAIN_ID,
        chainName: WEB3_CONFIG.CHAIN_NAME,
        rpcUrl: WEB3_CONFIG.RPC_URL,
        explorerUrl: WEB3_CONFIG.EXPLORER_URL,
        currencySymbol: WEB3_CONFIG.CURRENCY_SYMBOL,
      });
    } catch (err) {
      console.error("Network switch error:", err);
      setErrorMessage("Failed to switch network in wallet");
    }
  }, [walletProvider, connectWallet]);

  // Explicit alias — same function, kept available under both names.
  const switchToRobinhood = switchNetwork;

  const mintNft = async (quantity: number) => {
    if (!account) {
      await connectWallet();
      return;
    }
    if (chainId !== WEB3_CONFIG.CHAIN_ID) {
      setTxState("WRONG_NETWORK");
      return;
    }

    try {
      setErrorMessage(null);
      setTxHash(null);

      const signer = await getSigner();
      const nft = new ethers.Contract(WEB3_CONFIG.NFT_CONTRACT_ADDRESS, NFT_ABI, signer);
      const tokenContract = new ethers.Contract(WEB3_CONFIG.MINT_TOKEN_ADDRESS, ERC20_ABI, signer);
      const totalCost = mintPrice * BigInt(quantity);

      const allowance: bigint = await tokenContract.allowance(account, WEB3_CONFIG.NFT_CONTRACT_ADDRESS);
      if (allowance < totalCost) {
        setTxState("CONFIRM_IN_WALLET");
        const approveTx = await tokenContract.approve(WEB3_CONFIG.NFT_CONTRACT_ADDRESS, totalCost);
        setTxState("TRANSACTION_PENDING");
        await approveTx.wait();
      }

      setTxState("CONFIRM_IN_WALLET");
      const tx = await nft.mint(quantity);
      setTxState("TRANSACTION_PENDING");
      setTxHash(tx.hash);
      await tx.wait();

      setTxState("MINT_SUCCESSFUL");
      await refreshContractData();
    } catch (err: any) {
      console.error(err);
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        setTxState("TRANSACTION_REJECTED");
      } else if (err.message?.includes("insufficient funds")) {
        setTxState("INSUFFICIENT_BALANCE");
      } else {
        setTxState("TRANSACTION_FAILED");
        setErrorMessage(err.reason || err.message || "Transaction failed");
      }
    }
  };

  const callContractMethod = async (methodName: string, args: any[]): Promise<boolean> => {
    if (!account) return false;
    try {
      setTxState("CONFIRM_IN_WALLET");
      const signer = await getSigner();
      const nft = new ethers.Contract(WEB3_CONFIG.NFT_CONTRACT_ADDRESS, NFT_ABI, signer);
      const tx = await nft[methodName](...args);
      setTxState("TRANSACTION_PENDING");
      setTxHash(tx.hash);
      await tx.wait();
      setTxState("MINT_SUCCESSFUL");
      await refreshContractData();
      return true;
    } catch (err: any) {
      console.error(err);
      setTxState("TRANSACTION_FAILED");
      setErrorMessage(err.reason || err.message || "Execution failed");
      return false;
    }
  };

  // ==========================================================
  // Burn Lab — additive state & functions, separate contract instance.
  // None of this touches mint/staking/admin state above.
  // ==========================================================
  const burnLabConfigured = !!WEB3_CONFIG.BURN_LAB_CONTRACT_ADDRESS;

  const [burnLabOwnerAddress, setBurnLabOwnerAddress] = useState(
    "0x0000000000000000000000000000000000000000"
  );
  const [burnRewards, setBurnRewards] = useState<BurnReward[]>([]);
  const [burnRewardsLoading, setBurnRewardsLoading] = useState(false);
  const [heldNftCount, setHeldNftCount] = useState(0);

  const isBurnLabOwner =
    !!account && account.toLowerCase() === burnLabOwnerAddress.toLowerCase();

  const readErc20Meta = useCallback(
    async (tokenAddress: string): Promise<{ symbol: string; decimals: number } | null> => {
      try {
        const provider = getReadProvider();
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [symbol, decimals] = await Promise.all([
          token.symbol().catch(() => "TOKEN"),
          token.decimals().catch(() => 18),
        ]);
        return { symbol, decimals: Number(decimals) };
      } catch (err) {
        console.error("Error reading ERC20 metadata:", err);
        return null;
      }
    },
    []
  );

  const refreshBurnLabData = useCallback(async () => {
    if (!burnLabConfigured) return;
    setBurnRewardsLoading(true);
    try {
      const provider = getReadProvider();
      const burnLab = new ethers.Contract(WEB3_CONFIG.BURN_LAB_CONTRACT_ADDRESS, BURN_LAB_ABI, provider);

      const [ownr, count, held] = await Promise.all([
        burnLab.owner().catch(() => "0x0000000000000000000000000000000000000000"),
        burnLab.getRewardsCount().catch(() => BigInt(0)),
        burnLab.totalHeld().catch(() => BigInt(0)),
      ]);
      setBurnLabOwnerAddress(ownr);
      setHeldNftCount(Number(held));

      const total = Number(count);
      const rewards: BurnReward[] = [];

      for (let i = 0; i < total; i++) {
        try {
          const cfg = await burnLab.getReward(i);
          const tokenAddress: string = cfg.token;
          const [meta, balance, capacity] = await Promise.all([
            readErc20Meta(tokenAddress),
            burnLab.getRewardTokenBalance(tokenAddress).catch(() => BigInt(0)),
            burnLab.getAvailableCapacity(tokenAddress).catch(() => BigInt(0)),
          ]);

          rewards.push({
            token: tokenAddress,
            symbol: meta?.symbol || "TOKEN",
            decimals: meta?.decimals ?? 18,
            amountPerNFT: cfg.amountPerNFT,
            active: cfg.active,
            totalLoaded: cfg.totalLoaded,
            totalDistributed: cfg.totalDistributed,
            contractBalance: balance,
            availableCapacity: capacity,
          });
        } catch (err) {
          console.error("Error reading Burn Lab reward index", i, err);
        }
      }

      setBurnRewards(rewards);
    } catch (err) {
      console.error("Error fetching Burn Lab data:", err);
    } finally {
      setBurnRewardsLoading(false);
    }
  }, [burnLabConfigured, readErc20Meta]);

  useEffect(() => {
    if (!burnLabConfigured) return;
    refreshBurnLabData();
    const interval = setInterval(refreshBurnLabData, 20000);
    return () => clearInterval(interval);
  }, [burnLabConfigured, refreshBurnLabData]);

  const getBurnLabSignerContract = useCallback(async () => {
    const signer = await getSigner();
    return new ethers.Contract(WEB3_CONFIG.BURN_LAB_CONTRACT_ADDRESS, BURN_LAB_ABI, signer);
  }, [getSigner]);

  const checkBurnApproval = async (ownerAddress: string): Promise<boolean> => {
    try {
      const provider = getReadProvider();
      const nft = new ethers.Contract(WEB3_CONFIG.NFT_CONTRACT_ADDRESS, ERC721_MINIMAL_ABI, provider);
      return await nft.isApprovedForAll(ownerAddress, WEB3_CONFIG.BURN_LAB_CONTRACT_ADDRESS);
    } catch (err) {
      console.error("Error checking Burn Lab NFT approval:", err);
      return false;
    }
  };

  const approveBurnLab = async (): Promise<boolean> => {
    if (!account) return false;
    try {
      setTxState("CHECKING_APPROVAL");
      const signer = await getSigner();
      const nft = new ethers.Contract(WEB3_CONFIG.NFT_CONTRACT_ADDRESS, ERC721_MINIMAL_ABI, signer);
      setTxState("CONFIRM_IN_WALLET");
      const tx = await nft.setApprovalForAll(WEB3_CONFIG.BURN_LAB_CONTRACT_ADDRESS, true);
      setTxState("TRANSACTION_PENDING");
      setTxHash(tx.hash);
      await tx.wait();
      setTxState("IDLE");
      return true;
    } catch (err: any) {
      console.error(err);
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        setTxState("TRANSACTION_REJECTED");
      } else {
        setTxState("TRANSACTION_FAILED");
        setErrorMessage(err.reason || err.message || "Approval failed");
      }
      return false;
    }
  };

  const executeBurn = async (tokenIds: string[]): Promise<boolean> => {
    if (!account) {
      await connectWallet();
      return false;
    }
    if (chainId !== WEB3_CONFIG.CHAIN_ID) {
      setTxState("WRONG_NETWORK");
      return false;
    }
    if (!burnLabConfigured) {
      setTxState("TRANSACTION_FAILED");
      setErrorMessage("Burn Lab contract address is not configured yet.");
      return false;
    }

    try {
      setErrorMessage(null);
      setTxHash(null);
      setTxState("CHECKING_APPROVAL");

      const approved = await checkBurnApproval(account);
      if (!approved) {
        setTxState("APPROVAL_REQUIRED");
        return false;
      }

      // Client-side sanity check for reward capacity (the contract still
      // enforces this as the source of truth and will revert if it's wrong).
      const insufficient = burnRewards.some(
        (r) => r.active && r.availableCapacity < BigInt(tokenIds.length)
      );
      if (insufficient) {
        setTxState("INSUFFICIENT_REWARD_BALANCE");
        return false;
      }

      const burnLab = await getBurnLabSignerContract();
      setTxState("CONFIRM_IN_WALLET");
      const tx = await burnLab.burn(tokenIds.map((id) => BigInt(id)));
      setTxState("TRANSACTION_PENDING");
      setTxHash(tx.hash);
      await tx.wait();

      setTxState("BURN_SUCCESSFUL");
      await refreshBurnLabData();
      return true;
    } catch (err: any) {
      console.error(err);
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        setTxState("TRANSACTION_REJECTED");
      } else if (err.reason?.includes?.("insufficient reward balance")) {
        setTxState("INSUFFICIENT_REWARD_BALANCE");
      } else {
        setTxState("TRANSACTION_FAILED");
        setErrorMessage(err.reason || err.message || "Burn transaction failed");
      }
      return false;
    }
  };

  const callBurnLabMethod = async (methodName: string, args: any[]): Promise<boolean> => {
    if (!account) return false;
    try {
      setTxState("CONFIRM_IN_WALLET");
      const burnLab = await getBurnLabSignerContract();
      const tx = await burnLab[methodName](...args);
      setTxState("TRANSACTION_PENDING");
      setTxHash(tx.hash);
      await tx.wait();
      setTxState("MINT_SUCCESSFUL");
      await refreshBurnLabData();
      return true;
    } catch (err: any) {
      console.error(err);
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        setTxState("TRANSACTION_REJECTED");
      } else {
        setTxState("TRANSACTION_FAILED");
        setErrorMessage(err.reason || err.message || "Execution failed");
      }
      return false;
    }
  };

  const recoverBurnNFT = (tokenId: string, recipient: string) =>
    callBurnLabMethod("recoverNFT", [WEB3_CONFIG.NFT_CONTRACT_ADDRESS, BigInt(tokenId), recipient]);

  const addBurnReward = (token: string, amountPerNFTRaw: bigint) =>
    callBurnLabMethod("addRewardToken", [token, amountPerNFTRaw]);

  const updateBurnRewardAmount = (token: string, newAmountPerNFTRaw: bigint) =>
    callBurnLabMethod("updateRewardAmount", [token, newAmountPerNFTRaw]);

  const setBurnRewardActive = (token: string, active: boolean) =>
    callBurnLabMethod("setRewardActive", [token, active]);

  const withdrawBurnRewardTokens = (token: string, amountRaw: bigint) =>
    callBurnLabMethod("withdrawRewardTokens", [token, amountRaw]);

  const loadBurnRewardTokens = async (token: string, amountRaw: bigint): Promise<boolean> => {
    if (!account) return false;
    try {
      setErrorMessage(null);
      setTxHash(null);

      const signer = await getSigner();
      const erc20 = new ethers.Contract(token, ERC20_ABI, signer);

      const allowance: bigint = await erc20.allowance(account, WEB3_CONFIG.BURN_LAB_CONTRACT_ADDRESS);
      if (allowance < amountRaw) {
        setTxState("CONFIRM_IN_WALLET");
        const approveTx = await erc20.approve(WEB3_CONFIG.BURN_LAB_CONTRACT_ADDRESS, amountRaw);
        setTxState("TRANSACTION_PENDING");
        await approveTx.wait();
      }

      return await callBurnLabMethod("loadRewardTokens", [token, amountRaw]);
    } catch (err: any) {
      console.error(err);
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        setTxState("TRANSACTION_REJECTED");
      } else {
        setTxState("TRANSACTION_FAILED");
        setErrorMessage(err.reason || err.message || "Loading reward tokens failed");
      }
      return false;
    }
  };

  return (
    <Web3Context.Provider
      value={{
        account,
        chainId,
        walletProvider,
        signer,
        isCorrectNetwork: chainId === WEB3_CONFIG.CHAIN_ID,
        isOwner,
        txState,
        txHash,
        errorMessage,
        totalSupply,
        maxSupply,
        mintPrice,
        isPaused,
        publicMintEnabled,
        ownerAddress,
        baseUri,
        revealed,
        royaltyFeeBps,
        tokenSymbol,
        tokenDecimals,
        contractFunctions,
        walletConnectReady,
        connectWallet,
        disconnectWallet,
        switchNetwork,
        switchToRobinhood,
        mintNft,
        refreshContractData,
        callContractMethod,

        // Burn Lab (additive)
        burnLabConfigured,
        burnLabOwnerAddress,
        isBurnLabOwner,
        burnRewards,
        burnRewardsLoading,
        heldNftCount,
        refreshBurnLabData,
        checkBurnApproval,
        approveBurnLab,
        executeBurn,
        recoverBurnNFT,
        addBurnReward,
        updateBurnRewardAmount,
        setBurnRewardActive,
        loadBurnRewardTokens,
        withdrawBurnRewardTokens,
        readErc20Meta,
      }}
    >
      {children}

      {isWalletModalOpen && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm font-mono"
          onClick={closeWalletModal}
        >
          <div
            className="w-full max-w-sm bg-[#0f1115] border border-zinc-800 shadow-[0_0_40px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-[#CCFF00] animate-pulse" />
                <h2 className="text-sm font-bold text-white tracking-widest">CONNECT WALLET</h2>
              </div>
              <button
                type="button"
                onClick={closeWalletModal}
                className="text-zinc-500 hover:text-white text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Select a wallet to connect to {WEB3_CONFIG.CHAIN_NAME}.
              </p>

              {walletModalError && (
                <div className="p-3 border border-red-900/50 bg-red-950/20 text-red-400 text-[11px]">
                  {walletModalError}
                </div>
              )}

              {!WALLETCONNECT_PROJECT_ID && (
                <div className="p-3 border border-amber-900/50 bg-amber-950/20 text-amber-400 text-[11px]">
                  WalletConnect Project ID not configured — QR / mobile connections are
                  unavailable until NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set. Browser extension
                  wallets still work normally.
                </div>
              )}

              <div className="space-y-2 max-h-80 overflow-y-auto no-scrollbar">
                {WALLET_CATALOG.map((option) => {
                  const isBusy = connectingWalletId === option.id;
                  const isDisabled = connectingWalletId !== null && !isBusy;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => selectWallet(option)}
                      disabled={isDisabled || isBusy}
                      className="w-full flex items-center gap-3 p-3 border border-zinc-800 bg-zinc-950 hover:border-[#CCFF00]/50 hover:bg-zinc-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
                    >
                      <WalletLogo
                        option={option}
                        src={(option.rdns && injectedWalletIcons[option.rdns]) || option.logoUrl}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-white tracking-wide">
                          {option.name}
                        </span>
                        <span className="block text-[10px] text-zinc-500 truncate">
                          {option.description}
                        </span>
                      </span>
                      {isBusy ? (
                        <span className="text-[10px] text-[#CCFF00] tracking-widest animate-pulse">
                          ...
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-xs">›</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-zinc-800 text-[10px] text-zinc-600 text-center">
              By connecting, you agree to the terms of the connected wallet provider.
            </div>
          </div>
        </div>
      )}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);

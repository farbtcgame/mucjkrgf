"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { WEB3_CONFIG, WALLETCONNECT_PROJECT_ID } from "../config/web3";
import NFT_ABI from "../abi/NFT.json";
import ERC20_ABI from "../abi/ERC20.json";
import BURN_LAB_ABI from "../abi/BurnLab.json";
import ERC721_MINIMAL_ABI from "../abi/ERC721Minimal.json";

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

interface Web3ContextType {
  account: string | null;
  chainId: number | null;
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
  switchNetwork: () => Promise<void>;
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
  const walletConnectReady = !!WALLETCONNECT_PROJECT_ID;

  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletProvider, setWalletProvider] = useState<any>(null);

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

  // Function to connect standard browser wallets (MetaMask / Window Ethereum)
  const connectWallet = async () => {
    try {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        const network = await provider.getNetwork();
        
        setAccount(accounts[0]);
        setChainId(Number(network.chainId));
        setWalletProvider((window as any).ethereum);
      } else {
        alert("No crypto wallet found. Please install MetaMask or use a supported browser.");
      }
    } catch (err) {
      console.error("Connection error:", err);
      setErrorMessage("Failed to connect wallet");
    }
  };

  const switchNetwork = async () => {
    try {
      if (walletProvider) {
        const provider = new ethers.BrowserProvider(walletProvider);
        await provider.send("wallet_switchEthereumChain", [
          { chainId: "0x" + WEB3_CONFIG.CHAIN_ID.toString(16) },
        ]);
      }
    } catch (err) {
      setErrorMessage("Failed to switch network in wallet");
    }
  };

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
        switchNetwork,
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
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);

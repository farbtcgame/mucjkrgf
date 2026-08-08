"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { WEB3_CONFIG, WALLETCONNECT_PROJECT_ID } from "../config/web3";
import NFT_ABI from "../abi/NFT.json";
import ERC20_ABI from "../abi/ERC20.json";

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
  | "INSUFFICIENT_BALANCE";

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
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);
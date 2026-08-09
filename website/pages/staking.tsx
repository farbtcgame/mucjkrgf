import React, { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { useWeb3 } from "../context/Web3Context";
import { ALCHEMY_API_KEY } from "../config/web3";
import { fetchOwnedMiniBrokers, OwnedNft } from "../lib/alchemyNfts";

type LoadState = "IDLE" | "LOADING" | "LOADED" | "ERROR";

export default function StakingPage() {
  const { account, walletConnectReady, connectWallet } = useWeb3();

  const [ownedNfts, setOwnedNfts] = useState<OwnedNft[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("IDLE");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) {
      setOwnedNfts([]);
      setLoadState("IDLE");
      return;
    }

    let cancelled = false;

    async function load() {
      setLoadState("LOADING");
      setLoadError(null);
      try {
        const nfts = await fetchOwnedMiniBrokers(account as string);
        if (!cancelled) {
          setOwnedNfts(nfts);
          setLoadState("LOADED");
        }
      } catch (err: any) {
        if (!cancelled) {
          setLoadState("ERROR");
          setLoadError(
            err?.message === "ALCHEMY_NOT_CONFIGURED"
              ? "Alchemy API key not configured yet — set NEXT_PUBLIC_ALCHEMY_API_KEY."
              : "Couldn't load your NFTs right now. Please try again shortly."
          );
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [account]);

  return (
    <Layout>
      <div className="space-y-8">
        {/* MINI Vault promo banner */}
        <div className="relative border border-[#CCFF00]/40 bg-[#CCFF00] p-6 overflow-hidden">
          <span className="pointer-events-none select-none absolute -right-2 -bottom-4 text-7xl md:text-8xl font-black text-black/10 tracking-tight">
            STAKE
          </span>
          <h3 className="relative text-xl md:text-2xl font-extrabold text-black tracking-tight">
            MINI Vault / 33.9% WYR
          </h3>
          <p className="relative text-xs md:text-sm text-black/70 mt-1 max-w-md">
            Collect, stake, and let the protocol do the accounting.
          </p>
        </div>

        {/* Header */}
        <div className="border border-zinc-800 bg-[#0f1115] p-6">
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-wider">MINI BROKERS VAULT</h2>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed max-w-2xl">
                Lock your Mini Brokers NFTs into the vault to earn rewards over time. You keep
                ownership of the collectible the whole time. The staking contract isn&apos;t live
                yet — connect your wallet below to preview which of your NFTs will be eligible.
              </p>
            </div>
            <span className="px-2.5 py-1 text-[10px] font-bold tracking-widest border bg-amber-950/30 text-amber-400 border-amber-800 whitespace-nowrap">
              ● COMING SOON
            </span>
          </div>

          {/* Stat grid — matches the mint page's metric tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-6">
            <div className="p-3 bg-zinc-950 border border-zinc-800/60">
              <span className="text-[10px] text-zinc-500 block">TOTAL STAKED</span>
              <span className="text-sm font-bold text-white">—</span>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-800/60">
              <span className="text-[10px] text-zinc-500 block">YOUR VAULT</span>
              <span className="text-sm font-bold text-white">0</span>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-800/60">
              <span className="text-[10px] text-zinc-500 block">PENDING</span>
              <span className="text-sm font-bold text-[#CCFF00]">0.00</span>
            </div>
            <div className="p-3 bg-zinc-950 border border-zinc-800/60">
              <span className="text-[10px] text-zinc-500 block">APY</span>
              <span className="text-sm font-bold text-white">—</span>
            </div>
          </div>
        </div>

        {/* Your Vault — owned NFTs from this collection, via Alchemy */}
        <div className="border border-zinc-800 bg-[#0f1115] p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white tracking-widest">YOUR VAULT</h3>
            <p className="text-[10px] text-zinc-500">SELECT OWNED NFTS TO STAKE</p>
          </div>

          {!walletConnectReady ? (
            <div className="p-3 border border-amber-900/50 bg-amber-950/20 text-amber-400 text-xs">
              WalletConnect Project ID not configured yet — set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.
            </div>
          ) : !account ? (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed border-zinc-800 space-y-4">
              <p className="text-xs text-zinc-500">Connect your wallet to see your Mini Brokers.</p>
              <button
                onClick={connectWallet}
                className="px-6 py-2.5 bg-[#CCFF00] text-black font-bold text-xs tracking-widest hover:bg-[#b8e600] transition-colors"
              >
                CONNECT WALLET
              </button>
            </div>
          ) : loadState === "LOADING" ? (
            <div className="py-12 text-center text-xs text-zinc-500 animate-pulse">
              Loading your collection…
            </div>
          ) : loadState === "ERROR" ? (
            <div className="p-3 border border-red-900/50 bg-red-950/20 text-red-400 text-xs">
              {loadError}
            </div>
          ) : ownedNfts.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              No Mini Brokers found in this wallet yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {ownedNfts.map((nft) => (
                <div
                  key={nft.tokenId}
                  className="relative border border-zinc-800 bg-zinc-950 p-2 space-y-2 opacity-60 cursor-not-allowed"
                  title="Staking isn't live yet"
                >
                  <div className="aspect-square w-full bg-zinc-900 overflow-hidden flex items-center justify-center">
                    {nft.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-zinc-600">NO IMAGE</span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-400 truncate">{nft.name}</p>
                  <input
                    type="checkbox"
                    disabled
                    className="absolute top-2 right-2 accent-[#CCFF00] cursor-not-allowed"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Stake / Claim actions — disabled until the staking contract is live */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-800">
            <button
              disabled
              title="Staking isn't live yet"
              className="flex-1 py-3 bg-zinc-900 border border-zinc-800 text-zinc-600 font-bold text-xs tracking-widest cursor-not-allowed"
            >
              STAKE SELECTED (0)
            </button>
            <button
              disabled
              title="Staking isn't live yet"
              className="flex-1 py-3 bg-zinc-900 border border-zinc-800 text-zinc-600 font-bold text-xs tracking-widest cursor-not-allowed"
            >
              CLAIM REWARDS
            </button>
          </div>
        </div>

        {!ALCHEMY_API_KEY && (
          <div className="p-3 border border-amber-900/50 bg-amber-950/20 text-amber-400 text-xs">
            Note: NEXT_PUBLIC_ALCHEMY_API_KEY isn&apos;t set in .env.local, so NFT lookups above
            will show a config warning until it&apos;s added.
          </div>
        )}
      </div>
    </Layout>
  );
}

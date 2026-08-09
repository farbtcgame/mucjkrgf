import { ALCHEMY_API_KEY, ALCHEMY_NFT_API_BASE, WEB3_CONFIG, IPFS_GATEWAY } from "../config/web3";

export interface OwnedNft {
  tokenId: string;
  name: string;
  image: string;
}

function toGatewayUrl(uri: string): string {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) return IPFS_GATEWAY + uri.replace("ipfs://", "");
  return uri;
}

/**
 * Fetches every Mini Brokers NFT the given address currently owns, via
 * Alchemy's NFT API (getNFTsForOwner), filtered to our collection contract.
 *
 * NOTE: Alchemy's NFT API coverage can vary per chain. Robinhood Chain has a
 * Chain API endpoint (robinhood-mainnet / robinhood-testnet), but if the NFT
 * API specifically isn't available for it yet, this will throw — the caller
 * shows an error state rather than silently failing.
 */
export async function fetchOwnedMiniBrokers(ownerAddress: string): Promise<OwnedNft[]> {
  if (!ALCHEMY_API_KEY) {
    throw new Error("ALCHEMY_NOT_CONFIGURED");
  }

  const url =
    `${ALCHEMY_NFT_API_BASE}/getNFTsForOwner` +
    `?owner=${ownerAddress}` +
    `&contractAddresses[]=${WEB3_CONFIG.NFT_CONTRACT_ADDRESS}` +
    `&withMetadata=true&pageSize=100`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ALCHEMY_HTTP_${res.status}`);
  }

  const data = await res.json();
  const nfts = Array.isArray(data.ownedNfts) ? data.ownedNfts : [];

  return nfts.map((nft: any): OwnedNft => {
    const tokenId: string = nft.tokenId ?? nft.id?.tokenId ?? "?";
    const name: string = nft.name || nft.contract?.name || `Mini Broker #${tokenId}`;
    const rawImage: string =
      nft.image?.cachedUrl || nft.image?.originalUrl || nft.raw?.metadata?.image || "";
    return {
      tokenId,
      name,
      image: toGatewayUrl(rawImage),
    };
  });
}

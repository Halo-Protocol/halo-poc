import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

const CHAINLINK_ABI = parseAbi([
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

const PRICE_FEEDS: Record<string, Record<string, `0x${string}`>> = {
  '421614': { // Arbitrum Sepolia
    'ETH/USD': '0x694AA1769357215DE4FAC081bf1f309aDC325306',
    'USDC/USD': '0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E',
  },
  '42161': { // Arbitrum One
    'ETH/USD': '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
    'USDC/USD': '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
    'ARB/USD': '0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D7',
  },
};

const STALENESS_THRESHOLD = 3600; // 1 hour in seconds

export interface PriceData {
  pair: string;
  price: number;
  decimals: number;
  updatedAt: number;
  isStale: boolean;
}

@Injectable()
export class OraclesService {
  private readonly logger = new Logger(OraclesService.name);
  private readonly client;
  private readonly chainId: string;
  private _priceCache: Map<string, PriceData> = new Map();
  private _lastFetch = 0;

  constructor(private readonly config: ConfigService) {
    this.chainId = config.get('NEXT_PUBLIC_CHAIN_ID', '421614');
    this.client = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(config.get('ARBITRUM_SEPOLIA_RPC')),
    });
  }

  async getPrices(): Promise<Record<string, PriceData>> {
    const now = Date.now();
    // Cache for 60 seconds
    if (now - this._lastFetch < 60_000 && this._priceCache.size > 0) {
      return Object.fromEntries(this._priceCache);
    }

    const feeds = PRICE_FEEDS[this.chainId] ?? {};
    const results: Record<string, PriceData> = {};

    await Promise.all(
      Object.entries(feeds).map(async ([pair, address]) => {
        try {
          const data = await this.client.readContract({
            address,
            abi: CHAINLINK_ABI,
            functionName: 'latestRoundData',
          });

          const price = Number(data[1]) / 1e8; // Chainlink uses 8 decimals
          const updatedAt = Number(data[3]);
          const isStale = Date.now() / 1000 - updatedAt > STALENESS_THRESHOLD;

          if (isStale) {
            this.logger.warn(`Stale price feed: ${pair}`);
          }

          const priceData: PriceData = { pair, price, decimals: 8, updatedAt, isStale };
          results[pair] = priceData;
          this._priceCache.set(pair, priceData);
        } catch (error) {
          this.logger.error(`Failed to fetch price for ${pair}`, error);
        }
      }),
    );

    this._lastFetch = now;
    return results;
  }

  async getPrice(pair: string): Promise<PriceData | null> {
    const prices = await this.getPrices();
    return prices[pair] ?? null;
  }

  async isStablecoinPegged(symbol: 'USDC' | 'USDT' | 'DAI'): Promise<boolean> {
    const price = await this.getPrice(`${symbol}/USD`);
    if (!price || price.isStale) return false;
    // Accept 0.5% deviation from $1 peg
    return Math.abs(price.price - 1.0) < 0.005;
  }
}

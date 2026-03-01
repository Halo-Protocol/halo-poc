import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

/**
 * Managed ethers.js WebSocket provider with automatic reconnection.
 * Falls back to HTTP RPC if WS is unavailable.
 */
@Injectable()
export class ProviderService implements OnModuleInit {
  private readonly logger = new Logger(ProviderService.name);
  private _provider: ethers.JsonRpcProvider | ethers.WebSocketProvider | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECTS = 10;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    await this._connect();
  }

  private async _connect() {
    const rpcUrl = this.config.get<string>('ARBITRUM_SEPOLIA_RPC');
    if (!rpcUrl) {
      this.logger.warn('No RPC URL configured — blockchain features disabled');
      return;
    }

    try {
      if (rpcUrl.startsWith('wss://')) {
        const ws = new ethers.WebSocketProvider(rpcUrl);
        ws.websocket.addEventListener('close', () => this._handleDisconnect());
        this._provider = ws;
      } else {
        this._provider = new ethers.JsonRpcProvider(rpcUrl);
      }

      const network = await this._provider.getNetwork();
      this.reconnectAttempts = 0;
      this.logger.log(`Connected to chain ${network.chainId} (${network.name})`);
    } catch (e) {
      this.logger.error('Failed to connect to RPC', e);
      this._handleDisconnect();
    }
  }

  private _handleDisconnect() {
    this._provider = null;
    if (this.reconnectAttempts >= this.MAX_RECONNECTS) {
      this.logger.error('Max reconnect attempts reached');
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;
    this.logger.warn(`Provider disconnected. Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this._connect(), delay);
  }

  get provider(): ethers.Provider | null {
    return this._provider;
  }

  get isConnected(): boolean {
    return this._provider !== null;
  }

  /**
   * Get a typed contract instance
   */
  getContract<T extends ethers.BaseContract>(
    address: string,
    abi: ethers.InterfaceAbi,
    signer?: ethers.Signer,
  ): T {
    const runner = signer ?? this._provider;
    if (!runner) throw new Error('Provider not connected');
    return new ethers.Contract(address, abi, runner) as unknown as T;
  }
}

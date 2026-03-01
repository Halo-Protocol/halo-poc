import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

/**
 * WebSocket gateway for real-time Halo events.
 *
 * Rooms:
 *  - `circle:{circleId}` — circle-specific events (contributions, defaults, payouts)
 *  - `user:{address}` — user-specific events (score updates, notifications)
 *  - `global` — protocol-wide events (new circles, metrics)
 */
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:3000', credentials: true },
  namespace: '/ws',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        const payload = this.jwt.verify<{ address: string }>(token);
        client.data.address = payload.address;
        await client.join(`user:${payload.address}`);
        this.logger.debug(`Authenticated WS: ${payload.address}`);
      } catch {
        // Unauthenticated — still allowed for public rooms
      }
    }
    await client.join('global');
  }

  async handleDisconnect(client: Socket) {
    this.logger.debug(`WS disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:circle')
  async handleJoinCircle(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { circleId: string },
  ) {
    await client.join(`circle:${data.circleId}`);
    return { event: 'joined', circleId: data.circleId };
  }

  @SubscribeMessage('leave:circle')
  async handleLeaveCircle(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { circleId: string },
  ) {
    await client.leave(`circle:${data.circleId}`);
  }

  // =========================================================================
  // Emit helpers (called by event listener / jobs)
  // =========================================================================

  emitContribution(circleId: string, payload: object) {
    this.server.to(`circle:${circleId}`).emit('circle:contribution', payload);
  }

  emitDefault(circleId: string, payload: object) {
    this.server.to(`circle:${circleId}`).emit('circle:default', payload);
    this.server.to('global').emit('protocol:default', payload);
  }

  emitPayout(circleId: string, payload: object) {
    this.server.to(`circle:${circleId}`).emit('circle:payout', payload);
  }

  emitScoreUpdate(address: string, payload: object) {
    this.server.to(`user:${address}`).emit('score:updated', payload);
  }

  emitNewCircle(payload: object) {
    this.server.to('global').emit('circle:new', payload);
  }
}

import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SiweMessage } from 'siwe';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generate a unique nonce for SIWE authentication.
   * Nonces expire in 5 minutes.
   */
  async generateNonce(address: string): Promise<{ nonce: string; expiresAt: Date }> {
    const normalized = address.toLowerCase();
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + this.NONCE_TTL_MS);

    // Upsert member record so nonce FK works
    await this.prisma.member.upsert({
      where: { id: normalized },
      create: { id: normalized },
      update: {},
    });

    await this.prisma.siweNonce.create({
      data: { address: normalized, nonce, expiresAt },
    });

    return { nonce, expiresAt };
  }

  /**
   * Verify a SIWE signature and issue a JWT.
   */
  async verifySiwe(
    message: string,
    signature: string,
  ): Promise<{ accessToken: string; address: string }> {
    let siweMessage: SiweMessage;

    try {
      siweMessage = new SiweMessage(message);
    } catch {
      throw new BadRequestException('Invalid SIWE message format');
    }

    const address = siweMessage.address.toLowerCase();

    // Check nonce exists and is not expired
    const nonceRecord = await this.prisma.siweNonce.findUnique({
      where: { nonce: siweMessage.nonce },
    });

    if (!nonceRecord) throw new UnauthorizedException('Invalid or unknown nonce');
    if (nonceRecord.address !== address) throw new UnauthorizedException('Nonce address mismatch');
    if (nonceRecord.usedAt) throw new UnauthorizedException('Nonce already used');
    if (nonceRecord.expiresAt < new Date()) throw new UnauthorizedException('Nonce expired');

    // Verify the SIWE signature
    const chainId = this.config.get<number>('CHAIN_ID', 421614);
    const domain = this.config.get<string>('SIWE_DOMAIN', 'localhost');

    try {
      await siweMessage.verify({ signature, domain, nonce: siweMessage.nonce });
    } catch (e) {
      throw new UnauthorizedException('Signature verification failed');
    }

    // Mark nonce as used
    await this.prisma.siweNonce.update({
      where: { nonce: siweMessage.nonce },
      data: { usedAt: new Date() },
    });

    const accessToken = this.jwt.sign(
      { sub: address, address },
      { expiresIn: this.config.get('JWT_EXPIRY', '7d') },
    );

    this.logger.log(`SIWE auth successful: ${address}`);
    return { accessToken, address };
  }

  /**
   * Validate a JWT payload (used by JwtGuard).
   */
  validateJwtPayload(payload: { sub: string; address: string }): { address: string } {
    return { address: payload.address };
  }
}

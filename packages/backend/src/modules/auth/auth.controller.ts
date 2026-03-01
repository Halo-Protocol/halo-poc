import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { isAddress } from 'viem';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * GET /api/v1/auth/nonce?address=0x...
   * Returns a nonce the client must sign via SIWE.
   */
  @Get('nonce')
  async getNonce(@Query('address') address: string) {
    if (!address || !isAddress(address)) {
      throw new BadRequestException('Valid Ethereum address required');
    }
    return this.authService.generateNonce(address);
  }

  /**
   * POST /api/v1/auth/verify
   * Verifies a SIWE signature and returns a JWT.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: { message: string; signature: string }) {
    if (!body.message || !body.signature) {
      throw new BadRequestException('message and signature are required');
    }
    return this.authService.verifySiwe(body.message, body.signature);
  }
}

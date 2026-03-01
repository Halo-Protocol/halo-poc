import { GraphQLClient } from 'graphql-request';
import { GET_ATTESTATIONS } from '../graphql/queries.js';
import type { Attestation } from '../types.js';

export class AttestationModule {
  constructor(private readonly gql: GraphQLClient) {}

  /**
   * Get all attestations received by an address
   */
  async getForAddress(address: string): Promise<Attestation[]> {
    const data = await this.gql.request<{ member: any }>(GET_ATTESTATIONS, {
      address: address.toLowerCase(),
    });

    const raw = data.member?.attestationsReceived ?? [];
    return raw.map(this._parse);
  }

  /**
   * Count active (non-revoked) vouches for an address
   */
  async getActiveVouchCount(address: string): Promise<number> {
    const attestations = await this.getForAddress(address);
    return attestations.filter((a) => a.type === 'VOUCH' && !a.revoked).length;
  }

  /**
   * Check if address has any active fraud reports
   */
  async hasActiveFraudReport(address: string): Promise<boolean> {
    const attestations = await this.getForAddress(address);
    return attestations.some((a) => a.type === 'FRAUD_REPORT' && !a.revoked);
  }

  private _parse(raw: any): Attestation {
    return {
      uid: raw.uid,
      type: raw.type,
      attester: raw.attester?.id ?? raw.attester,
      attesterScore: raw.attester?.score,
      recipient: raw.recipient?.id ?? raw.recipient,
      timestamp: BigInt(raw.timestamp),
      revoked: raw.revoked,
      revokedAt: raw.revokedAt ? BigInt(raw.revokedAt) : undefined,
      txHash: raw.txHash,
    };
  }
}

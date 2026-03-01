import { BigInt } from '@graphprotocol/graph-ts';
import {
  AttestationCreated,
  AttestationRevoked,
} from '../generated/HaloAttestations/HaloAttestations';
import { Attestation, Member } from '../generated/schema';

const ATTESTATION_TYPES = ['VOUCH', 'CIRCLE_COMPLETE', 'WARN', 'FRAUD_REPORT'];

export function handleAttestationCreated(event: AttestationCreated): void {
  let uid = event.params.uid.toHexString();
  let attesterAddr = event.params.attester.toHexString();
  let recipientAddr = event.params.recipient.toHexString();

  let attestation = new Attestation(uid);
  attestation.uid = event.params.uid;
  attestation.type = ATTESTATION_TYPES[event.params.atype];
  attestation.attester = attesterAddr;
  attestation.recipient = recipientAddr;
  attestation.timestamp = event.params.timestamp;
  attestation.revoked = false;
  attestation.data = new Uint8Array(0) as any;
  attestation.txHash = event.transaction.hash.toHexString();
  attestation.save();
}

export function handleAttestationRevoked(event: AttestationRevoked): void {
  let uid = event.params.uid.toHexString();
  let attestation = Attestation.load(uid);
  if (attestation) {
    attestation.revoked = true;
    attestation.revokedAt = event.params.timestamp;
    attestation.save();
  }
}

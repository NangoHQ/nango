export interface InternalAuthPublicKey {
    kid: string;
    /** base64url of the raw 32-byte Ed25519 public key. */
    publicKey: string;
}

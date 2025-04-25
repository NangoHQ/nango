/* eslint-disable @typescript-eslint/require-await */
import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';

const MAX_LOCKS = 256;
const MAX_STRING_LEN = 255; // Max length for key and owner strings
const STATE_OFFSET = 0; // Int32: 0 = free, 1 = locked (4 bytes)
const EXPIRY_OFFSET = 8; // BigInt64: Expiry timestamp (ms) (8 bytes) = STATE_OFFSET + STATE size + padding (4 bytes)
const OWNER_LEN_OFFSET = 16; // Uint8: Length of owner string (1 byte) = EXPIRY_OFFSET + EXPIRY size
const OWNER_STR_OFFSET = 17; // Uint8[255]: Owner string bytes (255 bytes) = OWNER_LEN_OFFSET + OWNER_LEN size
const KEY_LEN_OFFSET = 17 + MAX_STRING_LEN; // Uint8: Length of key string (1 byte) = OWNER_STR_OFFSET + MAX_STRING_LEN
const KEY_STR_OFFSET = 18 + MAX_STRING_LEN; // Uint8[255]: Key string bytes (255 bytes) = KEY_LEN_OFFSET + KEY_LEN size
const BYTES_PER_LOCK = 18 + MAX_STRING_LEN * 2; // Total size of each lock slot (528 bytes)
const BUFFER_SIZE = MAX_LOCKS * BYTES_PER_LOCK; // 256 * 528 = 135168 bytes
const STATE_FREE = 0;
const STATE_LOCKED = 1;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class Locks {
    private sab: SharedArrayBuffer;
    // views for atomic operations
    private int32View: Int32Array; // for state (free/locked)
    private bigInt64View: BigInt64Array; // for expiry timestamp
    private uint8View: Uint8Array; // for owner and key strings

    private constructor(buffer: SharedArrayBuffer) {
        if (buffer.byteLength !== BUFFER_SIZE) {
            throw new Error(`Invalid buffer size. Expected ${BUFFER_SIZE}, got ${buffer.byteLength}`);
        }
        this.sab = buffer;
        this.int32View = new Int32Array(this.sab);
        this.bigInt64View = new BigInt64Array(this.sab);
        this.uint8View = new Uint8Array(this.sab);
    }
    public static create(): Locks {
        const buffer = new SharedArrayBuffer(BUFFER_SIZE);
        const initialInt32View = new Int32Array(buffer);
        const stateElementStride = BYTES_PER_LOCK / 4;
        const stateElementOffset = STATE_OFFSET / 4;
        for (let i = 0; i < MAX_LOCKS; i++) {
            initialInt32View[i * stateElementStride + stateElementOffset] = STATE_FREE;
        }
        return new Locks(buffer);
    }
    public static fromBuffer(buffer: SharedArrayBuffer): Locks {
        return new Locks(buffer);
    }
    public getBuffer(): SharedArrayBuffer {
        return this.sab;
    }

    private getStateIndex(slotIndex: number): number {
        return slotIndex * (BYTES_PER_LOCK / 4) + STATE_OFFSET / 4;
    }
    private getExpiryIndex(slotIndex: number): number {
        return slotIndex * (BYTES_PER_LOCK / 8) + EXPIRY_OFFSET / 8;
    }

    private findSlotByKey(keyBytes: Uint8Array): number {
        for (let i = 0; i < MAX_LOCKS; i++) {
            const slotOffset = i * BYTES_PER_LOCK;
            const stateIndex = this.getStateIndex(i);

            let state = Atomics.load(this.int32View, stateIndex);
            if (state !== STATE_LOCKED) {
                continue;
            }

            const keyLenOffset = slotOffset + KEY_LEN_OFFSET;
            const keyStrOffset = slotOffset + KEY_STR_OFFSET;
            const storedKeyLen = this.uint8View[keyLenOffset]; // Non-atomic read

            if (storedKeyLen === keyBytes.length) {
                let match = true;
                for (let j = 0; j < storedKeyLen; j++) {
                    if (this.uint8View[keyStrOffset + j] !== keyBytes[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    // Re-verify state after reading key
                    state = Atomics.load(this.int32View, stateIndex);
                    if (state === STATE_LOCKED) {
                        return i; // State still locked and key matched
                    }
                    // State changed between initial check and now
                }
            }
        }
        return -1;
    }

    private findFreeOrExpiredSlot(now: bigint): number {
        for (let i = 0; i < MAX_LOCKS; i++) {
            const slotInt32Index = this.getStateIndex(i);
            const slotBigInt64Index = this.getExpiryIndex(i);
            const currentState = Atomics.load(this.int32View, slotInt32Index);

            if (currentState === STATE_FREE) {
                return i;
            }
            const currentExpiry = Atomics.load(this.bigInt64View, slotBigInt64Index);
            if (currentExpiry <= now) {
                return i;
            }
        }
        return -1;
    }

    public async tryAcquireLock({ owner, key, ttlMs }: { owner: string; key: string; ttlMs: number }): Promise<Result<boolean>> {
        if (!owner || owner.length === 0) return Err(`Invalid lock owner (must not be empty)`);
        if (!key || key.length === 0) return Err(`Invalid lock key (must not be empty)`);
        if (ttlMs <= 0) return Err('Invalid lock ttlMs (must be greater than 0)');

        let ownerBytes: Uint8Array;
        let keyBytes: Uint8Array;
        try {
            ownerBytes = textEncoder.encode(owner);
            keyBytes = textEncoder.encode(key);
            if (ownerBytes.length > MAX_STRING_LEN || ownerBytes.length === 0)
                return Err(`Owner string byte length (${ownerBytes.length}) must be between 1 and ${MAX_STRING_LEN}`);
            if (keyBytes.length > MAX_STRING_LEN || keyBytes.length === 0)
                return Err(`Key string byte length (${keyBytes.length}) must be between 1 and ${MAX_STRING_LEN}`);
        } catch (err) {
            return Err(`Failed to encode owner or key: ${err instanceof Error ? err.message : String(err)}`);
        }

        const now = BigInt(Date.now());
        const expiresAt = now + BigInt(ttlMs);

        // 1. Check for existing lock
        const existingSlotIndex = this.findSlotByKey(keyBytes);
        if (existingSlotIndex !== -1) {
            const slotOffset = existingSlotIndex * BYTES_PER_LOCK;
            const slotBigInt64Index = this.getExpiryIndex(existingSlotIndex);
            const slotInt32Index = this.getStateIndex(existingSlotIndex);

            const currentExpiry = Atomics.load(this.bigInt64View, slotBigInt64Index);
            let currentState = Atomics.load(this.int32View, slotInt32Index);

            // Check if lock is currently valid (locked and not expired)
            if (currentState === STATE_LOCKED && currentExpiry > now) {
                // Lock is valid, check if owner matches for renewal
                const storedOwnerLen = this.uint8View[slotOffset + OWNER_LEN_OFFSET];
                if (storedOwnerLen === ownerBytes.length) {
                    const storedOwner = bytesToString({ source: this.uint8View, offset: slotOffset + OWNER_STR_OFFSET, length: storedOwnerLen });

                    // Re-verify state after reading owner and before renewing
                    currentState = Atomics.load(this.int32View, slotInt32Index);
                    if (currentState === STATE_LOCKED && storedOwner === owner) {
                        // State is still locked and owner matches, proceed with renewal
                        Atomics.store(this.bigInt64View, slotBigInt64Index, expiresAt);
                        return Ok(true);
                    }
                    // State changed or owner mismatch after reading owner string
                }
                // Lock held by someone else
                return Ok(false);
            }
            // Lock exists but is expired or was unlocked. Proceed to acquire attempt.
        }

        // 2. Try to find a free or expired slot
        const targetSlotIndex = this.findFreeOrExpiredSlot(now);
        if (targetSlotIndex === -1) return Ok(false); // No slots available

        // 3. Attempt to acquire the target slot
        const slotOffset = targetSlotIndex * BYTES_PER_LOCK;
        const slotInt32Index = this.getStateIndex(targetSlotIndex);
        const slotBigInt64Index = this.getExpiryIndex(targetSlotIndex);

        const expectedState = Atomics.load(this.int32View, slotInt32Index);
        const isExpired = expectedState === STATE_LOCKED && Atomics.load(this.bigInt64View, slotBigInt64Index) <= now;

        if (expectedState === STATE_FREE || isExpired) {
            const previousState = Atomics.compareExchange(this.int32View, slotInt32Index, expectedState, STATE_LOCKED);
            if (previousState === expectedState) {
                try {
                    Atomics.store(this.bigInt64View, slotBigInt64Index, expiresAt);
                    const ownerLen = stringToBytes({ str: owner, target: this.uint8View, offset: slotOffset + OWNER_STR_OFFSET, maxLength: MAX_STRING_LEN });
                    this.uint8View[slotOffset + OWNER_LEN_OFFSET] = ownerLen;
                    const keyLen = stringToBytes({ str: key, target: this.uint8View, offset: slotOffset + KEY_STR_OFFSET, maxLength: MAX_STRING_LEN });
                    this.uint8View[slotOffset + KEY_LEN_OFFSET] = keyLen;
                    return Ok(true);
                } catch (err) {
                    // Attempt to revert state if writing fails
                    Atomics.compareExchange(this.int32View, slotInt32Index, STATE_LOCKED, STATE_FREE);
                    return Err(`Failed to write lock data after acquisition: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        }
        return Ok(false);
    }

    public async releaseLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        let keyBytes: Uint8Array;
        try {
            keyBytes = textEncoder.encode(key);
            if (keyBytes.length > MAX_STRING_LEN || keyBytes.length === 0)
                return Err(`Key string byte length (${keyBytes.length}) must be between 1 and ${MAX_STRING_LEN}`);
        } catch (err) {
            return Err(`Failed to encode key: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!owner) return Err('Owner cannot be empty');

        const slotIndex = this.findSlotByKey(keyBytes);
        if (slotIndex === -1) return Ok(false); // Key not found or wasn't locked

        const slotOffset = slotIndex * BYTES_PER_LOCK;
        const slotInt32Index = this.getStateIndex(slotIndex);

        // Check state before reading owner
        let currentState = Atomics.load(this.int32View, slotInt32Index);
        if (currentState !== STATE_LOCKED) {
            return Ok(false); // Lock was not locked when we checked
        }

        const storedOwnerLen = this.uint8View[slotOffset + OWNER_LEN_OFFSET] || 0;
        if (storedOwnerLen > 0) {
            const storedOwner = bytesToString({ source: this.uint8View, offset: slotOffset + OWNER_STR_OFFSET, length: storedOwnerLen });

            if (storedOwner === owner) {
                // Owner matched based on potentially stale read.
                // Re-verify state is still LOCKED immediately before swapping release.
                currentState = Atomics.load(this.int32View, slotInt32Index);
                if (currentState === STATE_LOCKED) {
                    const previousState = Atomics.compareExchange(this.int32View, slotInt32Index, STATE_LOCKED, STATE_FREE);
                    // Return true only if we successfully transitioned from LOCKED -> FREE
                    return Ok(previousState === STATE_LOCKED);
                }
                // State changed between reading owner and swapping attempt
            }
        }
        return Ok(false);
    }

    public async releaseAllLocks({ owner }: { owner: string }): Promise<Result<void>> {
        if (!owner) return Err('Owner cannot be empty');

        for (let i = 0; i < MAX_LOCKS; i++) {
            const slotOffset = i * BYTES_PER_LOCK;
            const slotInt32Index = this.getStateIndex(i);

            // Check state before reading owner
            let currentState = Atomics.load(this.int32View, slotInt32Index);
            if (currentState !== STATE_LOCKED) {
                continue; // Skip non-locked slots
            }

            const storedOwnerLen = this.uint8View[slotOffset + OWNER_LEN_OFFSET] || 0;
            if (storedOwnerLen > 0) {
                const storedOwner = bytesToString({ source: this.uint8View, offset: slotOffset + OWNER_STR_OFFSET, length: storedOwnerLen });

                if (storedOwner === owner) {
                    // Owner matched based on potentially stale read.
                    // Re-verify state is still LOCKED immediately before swapping release.
                    currentState = Atomics.load(this.int32View, slotInt32Index);
                    if (currentState === STATE_LOCKED) {
                        Atomics.compareExchange(this.int32View, slotInt32Index, STATE_LOCKED, STATE_FREE);
                    }
                }
            }
        }
        return Ok(undefined);
    }

    public async hasLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        let keyBytes: Uint8Array;
        try {
            keyBytes = textEncoder.encode(key);
            if (keyBytes.length > MAX_STRING_LEN || keyBytes.length === 0)
                return Err(`Key string byte length (${keyBytes.length}) must be between 1 and ${MAX_STRING_LEN}`);
        } catch (err) {
            return Err(`Failed to encode key: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!owner) return Err('Owner cannot be empty for hasLock');

        const slotIndex = this.findSlotByKey(keyBytes);
        if (slotIndex === -1) return Ok(false); // Key not found or wasn't locked

        const slotOffset = slotIndex * BYTES_PER_LOCK;
        const slotBigInt64Index = this.getExpiryIndex(slotIndex);
        const slotInt32Index = this.getStateIndex(slotIndex);

        // Load atomic values first
        const currentExpiry = Atomics.load(this.bigInt64View, slotBigInt64Index);
        let currentState = Atomics.load(this.int32View, slotInt32Index);
        const now = BigInt(Date.now());

        // Check if lock is currently valid (locked and not expired)
        if (currentState === STATE_LOCKED && currentExpiry > now) {
            // Read owner length and string (non-atomic)
            const storedOwnerLen = this.uint8View[slotOffset + OWNER_LEN_OFFSET] || 0;
            if (storedOwnerLen > 0) {
                const storedOwner = bytesToString({ source: this.uint8View, offset: slotOffset + OWNER_STR_OFFSET, length: storedOwnerLen });

                // Re-verify state after reading owner and before returning true
                currentState = Atomics.load(this.int32View, slotInt32Index);
                if (currentState === STATE_LOCKED && storedOwner === owner) {
                    // Check expiry again after confirming owner and state? (Belt and suspenders)
                    if (Atomics.load(this.bigInt64View, slotBigInt64Index) > now) {
                        return Ok(true);
                    }
                }
                // Owner mismatch or state/expiry changed after reading owner
            }
            // Invalid owner length
        }
        // Lock not held, or expired, or state changed during checks
        return Ok(false);
    }
}

function stringToBytes({ str, target, offset, maxLength }: { str: string; target: Uint8Array; offset: number; maxLength: number }): number {
    const encoded = textEncoder.encode(str);
    if (encoded.length > maxLength) {
        throw new Error(`String byte length (${encoded.length}) exceeds max length (${maxLength})`);
    }
    target.set(encoded, offset);
    for (let i = encoded.length; i < maxLength; i++) {
        target[offset + i] = 0;
    }
    return encoded.length;
}

function bytesToString({ source, offset, length }: { source: Uint8Array; offset: number; length: number }): string {
    let actualLength = 0;
    // Find the actual end of the string (first null byte or max length)
    while (actualLength < length && source[offset + actualLength] !== 0) {
        actualLength++;
    }
    const bytes = source.subarray(offset, offset + actualLength);
    return textDecoder.decode(bytes);
}

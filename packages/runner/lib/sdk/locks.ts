/* eslint-disable @typescript-eslint/require-await */
import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';

const MAX_LOCKS = 256;
const MAX_STRING_LEN = 255; // Max length for key and owner strings
const STATE_FREE = 0;
const STATE_LOCKED = 1;

const LockSchema = {
    STATE: { size: 4, type: 'Int32' }, // 0 = free, 1 = locked
    PADDING: { size: 4, type: 'none' }, // Padding for alignment
    EXPIRY: { size: 8, type: 'BigInt64' }, // Expiry timestamp (ms)
    OWNER_LEN: { size: 1, type: 'Uint8' }, // Length of owner string
    OWNER_STR: { size: MAX_STRING_LEN, type: 'Uint8Array' }, // Owner string bytes
    KEY_LEN: { size: 1, type: 'Uint8' }, // Length of key string
    KEY_STR: { size: MAX_STRING_LEN, type: 'Uint8Array' } // Key string bytes
};

const Offsets = {
    STATE: 0,
    EXPIRY: LockSchema.STATE.size + LockSchema.PADDING.size,
    OWNER_LEN: LockSchema.STATE.size + LockSchema.PADDING.size + LockSchema.EXPIRY.size,
    OWNER_STR: LockSchema.STATE.size + LockSchema.PADDING.size + LockSchema.EXPIRY.size + LockSchema.OWNER_LEN.size,
    KEY_LEN: LockSchema.STATE.size + LockSchema.PADDING.size + LockSchema.EXPIRY.size + LockSchema.OWNER_LEN.size + LockSchema.OWNER_STR.size,
    KEY_STR:
        LockSchema.STATE.size +
        LockSchema.PADDING.size +
        LockSchema.EXPIRY.size +
        LockSchema.OWNER_LEN.size +
        LockSchema.OWNER_STR.size +
        LockSchema.KEY_LEN.size
};

const BYTES_PER_LOCK = Object.values(LockSchema).reduce((sum, field) => sum + field.size, 0);
const BUFFER_SIZE = MAX_LOCKS * BYTES_PER_LOCK;

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
        const stateElementOffset = Offsets.STATE / 4;
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

    private static FieldTypes = {
        STATE: { view: 'int32View', size: 4 },
        EXPIRY: { view: 'bigInt64View', size: 8 }
    } as const;

    /**
     * Get the array index for a specific field in a lock slot
     * @param slotIndex The lock slot number
     * @param field The field to access ('STATE' or 'EXPIRY')
     */
    private getFieldIndex(slotIndex: number, field: keyof typeof Locks.FieldTypes): number {
        const elementSize = Locks.FieldTypes[field].size;
        return slotIndex * (BYTES_PER_LOCK / elementSize) + Offsets[field] / elementSize;
    }

    /**
     * Get all offsets for a specific lock slot
     * @param slotIndex The lock slot number
     * @returns Object containing all field offsets and indexes for the slot
     */
    private getSlotOffsets(slotIndex: number) {
        const slotOffset = slotIndex * BYTES_PER_LOCK;

        return {
            // Byte offsets (for uint8View)
            base: slotOffset,
            ownerLen: slotOffset + Offsets.OWNER_LEN,
            ownerStr: slotOffset + Offsets.OWNER_STR,
            keyLen: slotOffset + Offsets.KEY_LEN,
            keyStr: slotOffset + Offsets.KEY_STR,

            // Array indexes (for typed views)
            stateIndex: this.getFieldIndex(slotIndex, 'STATE'),
            expiryIndex: this.getFieldIndex(slotIndex, 'EXPIRY')
        };
    }

    private findSlotByKey(keyBytes: Uint8Array): number {
        for (let i = 0; i < MAX_LOCKS; i++) {
            const offsets = this.getSlotOffsets(i);

            let state = Atomics.load(this.int32View, offsets.stateIndex);
            if (state !== STATE_LOCKED) {
                continue;
            }

            const storedKeyLen = this.uint8View[offsets.keyLen]; // Non-atomic read

            if (storedKeyLen === keyBytes.length) {
                let match = true;
                for (let j = 0; j < storedKeyLen; j++) {
                    if (this.uint8View[offsets.keyStr + j] !== keyBytes[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    // Re-verify state after reading key
                    state = Atomics.load(this.int32View, offsets.stateIndex);
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
            const slotInt32Index = this.getFieldIndex(i, 'STATE');
            const slotBigInt64Index = this.getFieldIndex(i, 'EXPIRY');
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
        if (ttlMs <= 0) return Err('Invalid lock ttlMs (must be greater than 0)');

        const ownerResult = StringUtils.validateAndEncode(owner);
        if (ownerResult.isErr()) return Err(ownerResult.error.message);
        const ownerBytes = ownerResult.value;

        const keyResult = StringUtils.validateAndEncode(key);
        if (keyResult.isErr()) return Err(keyResult.error.message);
        const keyBytes = keyResult.value;

        const now = BigInt(Date.now());
        const expiresAt = now + BigInt(ttlMs);

        // 1. Check for existing lock
        const existingSlotIndex = this.findSlotByKey(keyBytes);
        if (existingSlotIndex !== -1) {
            const slotOffset = existingSlotIndex * BYTES_PER_LOCK;
            const slotBigInt64Index = this.getFieldIndex(existingSlotIndex, 'EXPIRY');
            const slotInt32Index = this.getFieldIndex(existingSlotIndex, 'STATE');

            const currentExpiry = Atomics.load(this.bigInt64View, slotBigInt64Index);
            let currentState = Atomics.load(this.int32View, slotInt32Index);

            // Check if lock is currently valid (locked and not expired)
            if (currentState === STATE_LOCKED && currentExpiry > now) {
                // Lock is valid, check if owner matches for renewal
                const storedOwnerLen = this.uint8View[slotOffset + Offsets.OWNER_LEN];
                if (storedOwnerLen === ownerBytes.length) {
                    const storedOwner = StringUtils.bytesToString({ source: this.uint8View, offset: slotOffset + Offsets.OWNER_STR, length: storedOwnerLen });

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
        const slotInt32Index = this.getFieldIndex(targetSlotIndex, 'STATE');
        const slotBigInt64Index = this.getFieldIndex(targetSlotIndex, 'EXPIRY');

        const expectedState = Atomics.load(this.int32View, slotInt32Index);
        const isExpired = expectedState === STATE_LOCKED && Atomics.load(this.bigInt64View, slotBigInt64Index) <= now;

        if (expectedState === STATE_FREE || isExpired) {
            const previousState = Atomics.compareExchange(this.int32View, slotInt32Index, expectedState, STATE_LOCKED);
            if (previousState === expectedState) {
                try {
                    Atomics.store(this.bigInt64View, slotBigInt64Index, expiresAt);
                    const ownerLen = StringUtils.stringToBytes({
                        str: owner,
                        target: this.uint8View,
                        offset: slotOffset + Offsets.OWNER_STR,
                        maxLength: MAX_STRING_LEN
                    });
                    this.uint8View[slotOffset + Offsets.OWNER_LEN] = ownerLen;
                    const keyLen = StringUtils.stringToBytes({
                        str: key,
                        target: this.uint8View,
                        offset: slotOffset + Offsets.KEY_STR,
                        maxLength: MAX_STRING_LEN
                    });
                    this.uint8View[slotOffset + Offsets.KEY_LEN] = keyLen;
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
        if (!owner) return Err('Owner cannot be empty');

        const keyResult = StringUtils.validateAndEncode(key);
        if (keyResult.isErr()) return Err(keyResult.error.message);
        const keyBytes = keyResult.value;

        const slotIndex = this.findSlotByKey(keyBytes);
        if (slotIndex === -1) return Ok(false); // Key not found or wasn't locked

        const slotOffset = slotIndex * BYTES_PER_LOCK;
        const slotInt32Index = this.getFieldIndex(slotIndex, 'STATE');

        // Check state before reading owner
        let currentState = Atomics.load(this.int32View, slotInt32Index);
        if (currentState !== STATE_LOCKED) {
            return Ok(false); // Lock was not locked when we checked
        }

        const storedOwnerLen = this.uint8View[slotOffset + Offsets.OWNER_LEN] || 0;
        if (storedOwnerLen > 0) {
            const storedOwner = StringUtils.bytesToString({ source: this.uint8View, offset: slotOffset + Offsets.OWNER_STR, length: storedOwnerLen });

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
            const slotInt32Index = this.getFieldIndex(i, 'STATE');

            // Check state before reading owner
            let currentState = Atomics.load(this.int32View, slotInt32Index);
            if (currentState !== STATE_LOCKED) {
                continue; // Skip non-locked slots
            }

            const storedOwnerLen = this.uint8View[slotOffset + Offsets.OWNER_LEN] || 0;
            if (storedOwnerLen > 0) {
                const storedOwner = StringUtils.bytesToString({ source: this.uint8View, offset: slotOffset + Offsets.OWNER_STR, length: storedOwnerLen });

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
        if (!owner) return Err('Owner cannot be empty for hasLock');

        const keyResult = StringUtils.validateAndEncode(key);
        if (keyResult.isErr()) return Err(keyResult.error.message);
        const keyBytes = keyResult.value;

        const slotIndex = this.findSlotByKey(keyBytes);
        if (slotIndex === -1) return Ok(false); // Key not found or wasn't locked

        const slotOffset = slotIndex * BYTES_PER_LOCK;
        const slotBigInt64Index = this.getFieldIndex(slotIndex, 'EXPIRY');
        const slotInt32Index = this.getFieldIndex(slotIndex, 'STATE');

        // Load atomic values first
        const currentExpiry = Atomics.load(this.bigInt64View, slotBigInt64Index);
        let currentState = Atomics.load(this.int32View, slotInt32Index);
        const now = BigInt(Date.now());

        // Check if lock is currently valid (locked and not expired)
        if (currentState === STATE_LOCKED && currentExpiry > now) {
            // Read owner length and string (non-atomic)
            const storedOwnerLen = this.uint8View[slotOffset + Offsets.OWNER_LEN] || 0;
            if (storedOwnerLen > 0) {
                const storedOwner = StringUtils.bytesToString({ source: this.uint8View, offset: slotOffset + Offsets.OWNER_STR, length: storedOwnerLen });

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

const StringUtils = {
    /**
     * Validates a string for lock operations
     * @param str The string to validate (owner or key)
     * @param type The type of string being validated ('owner' or 'key')
     * @returns Result with validation error or encoded bytes
     */
    validateAndEncode(str: string): Result<Uint8Array> {
        if (!str || str.length === 0) {
            return Err(`'${str}': invalid string (must not be empty)`);
        }

        try {
            const bytes = textEncoder.encode(str);
            if (bytes.length > MAX_STRING_LEN) {
                return Err(`'${str}': byte length (${bytes.length}) must be between 1 and ${MAX_STRING_LEN}`);
            }
            return Ok(bytes);
        } catch (err) {
            return Err(`Failed to encode '${str}': ${err instanceof Error ? err.message : String(err)}`);
        }
    },

    /**
     * Writes a string to the target byte array
     * @param str The string to write
     * @param target The target Uint8Array
     * @param offset The offset to write at
     * @param maxLength The maximum allowed length
     * @returns The actual byte length that was written
     */
    stringToBytes({ str, target, offset, maxLength }: { str: string; target: Uint8Array; offset: number; maxLength: number }): number {
        const encoded = textEncoder.encode(str);
        if (encoded.length > maxLength) {
            throw new Error(`String byte length (${encoded.length}) exceeds max length (${maxLength})`);
        }
        target.set(encoded, offset);
        for (let i = encoded.length; i < maxLength; i++) {
            target[offset + i] = 0;
        }
        return encoded.length;
    },

    /**
     * Reads a string from a byte array
     * @param source The source Uint8Array
     * @param offset The offset to read from
     * @param length The maximum length to read
     * @returns The decoded string
     */
    bytesToString({ source, offset, length }: { source: Uint8Array; offset: number; length: number }): string {
        let actualLength = 0;
        // Find the actual end of the string (first null byte or max length)
        while (actualLength < length && source[offset + actualLength] !== 0) {
            actualLength++;
        }
        const bytes = source.subarray(offset, offset + actualLength);
        return textDecoder.decode(bytes);
    }
};

/* eslint-disable @typescript-eslint/require-await */
import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';

const MAX_LOCKS = 256;
const STATE_FREE = 0;
const STATE_LOCKED = 1;
const MAX_STRING_LEN = 255; // Max length for key and owner strings

const LockSchema = {
    STATE: { size: 4, type: 'Int32' }, // 0 = free, 1 = locked
    PADDING: { size: 4, type: 'none' }, // Padding for alignment
    EXPIRY: { size: 8, type: 'BigInt64' }, // Expiry timestamp (ms)
    SEQUENCE: { size: 8, type: 'BigInt64' }, // Sequence number to prevent race condition
    OWNER_LEN: { size: 1, type: 'Uint8' }, // Length of owner string
    OWNER_STR: { size: MAX_STRING_LEN, type: 'Uint8Array' }, // Owner string bytes
    KEY_LEN: { size: 1, type: 'Uint8' }, // Length of key string
    KEY_STR: { size: MAX_STRING_LEN, type: 'Uint8Array' } // Key string bytes
};

const Offsets = {
    STATE: 0,
    EXPIRY: LockSchema.STATE.size + LockSchema.PADDING.size,
    SEQUENCE: LockSchema.STATE.size + LockSchema.PADDING.size + LockSchema.EXPIRY.size,
    OWNER_LEN: LockSchema.STATE.size + LockSchema.PADDING.size + LockSchema.EXPIRY.size + LockSchema.SEQUENCE.size,
    OWNER_STR: LockSchema.STATE.size + LockSchema.PADDING.size + LockSchema.EXPIRY.size + LockSchema.SEQUENCE.size + LockSchema.OWNER_LEN.size,
    KEY_LEN:
        LockSchema.STATE.size +
        LockSchema.PADDING.size +
        LockSchema.EXPIRY.size +
        LockSchema.SEQUENCE.size +
        LockSchema.OWNER_LEN.size +
        LockSchema.OWNER_STR.size,
    KEY_STR:
        LockSchema.STATE.size +
        LockSchema.PADDING.size +
        LockSchema.EXPIRY.size +
        LockSchema.SEQUENCE.size +
        LockSchema.OWNER_LEN.size +
        LockSchema.OWNER_STR.size +
        LockSchema.KEY_LEN.size
};

const BYTES_PER_LOCK = Object.values(LockSchema).reduce((sum, field) => sum + field.size, 0);
const BUFFER_SIZE = MAX_LOCKS * BYTES_PER_LOCK;

export class Locks {
    private sab: SharedArrayBuffer;

    // views for atomic operations
    private int32View: Int32Array; // for state (free/locked)
    private bigInt64View: BigInt64Array; // for expiry timestamp and sequence
    private uint8View: Uint8Array; // for owner and key strings

    private static FieldTypes = {
        STATE: { view: 'int32View', size: 4 },
        EXPIRY: { view: 'bigInt64View', size: 8 },
        SEQUENCE: { view: 'bigInt64View', size: 8 }
    } as const;

    private constructor(buffer: SharedArrayBuffer) {
        if (buffer.byteLength !== BUFFER_SIZE) {
            throw new Error(`Invalid buffer size. Expected ${BUFFER_SIZE}, got ${buffer.byteLength}`);
        }
        this.sab = buffer;
        this.int32View = new Int32Array(this.sab);
        this.bigInt64View = new BigInt64Array(this.sab);
        this.uint8View = new Uint8Array(this.sab);
    }

    /**
     * Create a new Locks instance
     * @returns A new Locks instance
     */
    public static create(): Locks {
        const buffer = new SharedArrayBuffer(BUFFER_SIZE);
        const initialInt32View = new Int32Array(buffer);
        const stateElementStride = BYTES_PER_LOCK / 4;
        const stateElementOffset = Offsets.STATE / 4;
        // Initialize all locks to free state
        for (let i = 0; i < MAX_LOCKS; i++) {
            initialInt32View[i * stateElementStride + stateElementOffset] = STATE_FREE;
        }
        return new Locks(buffer);
    }

    /**
     * Create a Locks instance from an existing SharedArrayBuffer
     * @param buffer The SharedArrayBuffer to use
     * @returns A new Locks instance
     */
    public static fromBuffer(buffer: SharedArrayBuffer): Locks {
        return new Locks(buffer);
    }

    /**
     * Get the underlying SharedArrayBuffer
     * @returns The SharedArrayBuffer used by this Locks instance
     */
    public getBuffer(): SharedArrayBuffer {
        return this.sab;
    }

    /**
     * Get the array index for a specific field in a lock slot
     * @param slotIndex The lock slot number
     * @param field The field to access ('STATE', 'EXPIRY', or 'SEQUENCE')
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
            base: slotOffset,
            ownerLen: slotOffset + Offsets.OWNER_LEN,
            ownerStr: slotOffset + Offsets.OWNER_STR,
            keyLen: slotOffset + Offsets.KEY_LEN,
            keyStr: slotOffset + Offsets.KEY_STR,
            stateIndex: this.getFieldIndex(slotIndex, 'STATE'),
            expiryIndex: this.getFieldIndex(slotIndex, 'EXPIRY'),
            sequenceIndex: this.getFieldIndex(slotIndex, 'SEQUENCE')
        };
    }

    /**
     * Find a lock slot by key bytes
     * @param keyBytes The key bytes to search for
     * @returns The index of the lock slot or -1 if not found
     */
    private findSlotByKey(keyBytes: Uint8Array): number {
        for (let i = 0; i < MAX_LOCKS; i++) {
            const offsets = this.getSlotOffsets(i);

            const state = Atomics.load(this.int32View, offsets.stateIndex);
            const sequence = Atomics.load(this.bigInt64View, offsets.sequenceIndex);

            if (state !== STATE_LOCKED) {
                continue;
            }

            const storedKeyLen = this.uint8View[offsets.keyLen];

            if (storedKeyLen === keyBytes.length) {
                let match = true;
                for (let j = 0; j < storedKeyLen; j++) {
                    if (this.uint8View[offsets.keyStr + j] !== keyBytes[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    // Re-verify state AND sequence AFTER non-atomic reads
                    const currentState = Atomics.load(this.int32View, offsets.stateIndex);
                    const currentSequence = Atomics.load(this.bigInt64View, offsets.sequenceIndex);

                    if (currentState === STATE_LOCKED && currentSequence === sequence) {
                        return i; // State still locked, sequence unchanged, and key matched
                    }
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

    /**
     * Try to acquire a lock for the specified key and owner
     * @param owner The owner of the lock
     * @param key The key to lock
     * @param ttlMs The time-to-live in milliseconds for the lock
     * @returns Result indicating success or failure
     */
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
            const offsets = this.getSlotOffsets(existingSlotIndex);

            const state = Atomics.load(this.int32View, offsets.stateIndex);
            const sequence = Atomics.load(this.bigInt64View, offsets.sequenceIndex);
            const expiry = Atomics.load(this.bigInt64View, offsets.expiryIndex);

            if (state === STATE_LOCKED && expiry > now) {
                const storedOwnerLen = this.uint8View[slotOffset + Offsets.OWNER_LEN];
                if (storedOwnerLen === ownerBytes.length) {
                    const storedOwner = StringUtils.bytesToString({ source: this.uint8View, offset: slotOffset + Offsets.OWNER_STR, length: storedOwnerLen });

                    // Re-verify state AND sequence AFTER non-atomic read
                    const currentState = Atomics.load(this.int32View, offsets.stateIndex);
                    const currentSequence = Atomics.load(this.bigInt64View, offsets.sequenceIndex);

                    if (currentState === STATE_LOCKED && currentSequence === sequence && storedOwner === owner) {
                        // State, sequence, and owner match. Renew by updating expiry.
                        Atomics.store(this.bigInt64View, offsets.expiryIndex, expiresAt);
                        return Ok(true);
                    }
                } // Lock held by someone else
                return Ok(false);
            } // Lock exists but is expired or was unlocked. Proceed to acquire attempt.
        }

        // 2. Try to find a free or expired slot
        const targetSlotIndex = this.findFreeOrExpiredSlot(now);
        if (targetSlotIndex === -1) return Ok(false); // No slots available

        // 3. Attempt to acquire the target slot
        const slotOffset = targetSlotIndex * BYTES_PER_LOCK;
        const offsets = this.getSlotOffsets(targetSlotIndex);

        const expectedState = Atomics.load(this.int32View, offsets.stateIndex);
        const isExpired = expectedState === STATE_LOCKED && Atomics.load(this.bigInt64View, offsets.expiryIndex) <= now;

        if (expectedState === STATE_FREE || isExpired) {
            const previousState = Atomics.compareExchange(this.int32View, offsets.stateIndex, expectedState, STATE_LOCKED);
            if (previousState === expectedState) {
                try {
                    // Successfully acquired, now update sequence, expiry, and data
                    Atomics.add(this.bigInt64View, offsets.sequenceIndex, 1n);
                    Atomics.store(this.bigInt64View, offsets.expiryIndex, expiresAt);
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
                    Atomics.compareExchange(this.int32View, offsets.stateIndex, STATE_LOCKED, STATE_FREE);
                    return Err(`Failed to write lock data after acquisition: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        }
        return Ok(false);
    }

    /**
     * Release a lock held by the specified owner
     * @param owner The owner of the lock
     * @param key The key of the lock
     * @return Result indicating success or failure
     */
    public async releaseLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        const keyResult = StringUtils.validateAndEncode(key);
        if (keyResult.isErr()) return Err(keyResult.error.message);

        const ownerResult = StringUtils.validateAndEncode(owner);
        if (ownerResult.isErr()) return Err(ownerResult.error.message);

        const slotIndex = this.findSlotByKey(keyResult.value);
        if (slotIndex === -1) return Ok(false);

        const slotOffset = slotIndex * BYTES_PER_LOCK;
        const offsets = this.getSlotOffsets(slotIndex);

        const state = Atomics.load(this.int32View, offsets.stateIndex);
        const sequence = Atomics.load(this.bigInt64View, offsets.sequenceIndex);

        if (state !== STATE_LOCKED) {
            return Ok(false);
        }

        const storedOwnerLen = this.uint8View[slotOffset + Offsets.OWNER_LEN] || 0;
        if (storedOwnerLen > 0) {
            // Re-verify owner, state and sequence AFTER non-atomic read
            const storedOwner = StringUtils.bytesToString({ source: this.uint8View, offset: slotOffset + Offsets.OWNER_STR, length: storedOwnerLen });
            const currentState = Atomics.load(this.int32View, offsets.stateIndex);
            const currentSequence = Atomics.load(this.bigInt64View, offsets.sequenceIndex);

            if (currentState === STATE_LOCKED && currentSequence === sequence && storedOwner === owner) {
                // State, sequence, and owner match. Attempt to release.
                const previousState = Atomics.compareExchange(this.int32View, offsets.stateIndex, STATE_LOCKED, STATE_FREE);
                // Return true only if we successfully transitioned from LOCKED -> FREE
                return Ok(previousState === STATE_LOCKED);
            }
        }
        return Ok(false);
    }

    /**
     * Release all locks held by the specified owner
     * @param owner The owner of the locks to release
     * @return Result indicating success or failure
     * Note: This method iterates through all locks and releases them one by one. No guarantee of atomicity for all locks.
     * */
    public async releaseAllLocks({ owner }: { owner: string }): Promise<Result<void>> {
        const ownerResult = StringUtils.validateAndEncode(owner);
        if (ownerResult.isErr()) return Err(ownerResult.error.message);

        for (let i = 0; i < MAX_LOCKS; i++) {
            const offsets = this.getSlotOffsets(i);

            const state = Atomics.load(this.int32View, offsets.stateIndex);
            const sequence = Atomics.load(this.bigInt64View, offsets.sequenceIndex);

            if (state !== STATE_LOCKED) {
                continue;
            }

            const storedOwnerLen = this.uint8View[offsets.base + Offsets.OWNER_LEN] || 0;
            if (storedOwnerLen > 0) {
                // Re-verify owner, state and sequence AFTER non-atomic read
                const storedOwner = StringUtils.bytesToString({ source: this.uint8View, offset: offsets.ownerStr, length: storedOwnerLen });
                const currentState = Atomics.load(this.int32View, offsets.stateIndex);
                const currentSequence = Atomics.load(this.bigInt64View, offsets.sequenceIndex);

                // Check state, sequence, and owner match before attempting release
                if (currentState === STATE_LOCKED && currentSequence === sequence && storedOwner === owner) {
                    Atomics.compareExchange(this.int32View, offsets.stateIndex, STATE_LOCKED, STATE_FREE);
                }
            }
        }
        return Ok(undefined);
    }

    /**
     * Check if a lock is held by the specified owner
     * @param owner The owner of the lock
     * @param key The key of the lock
     * @return Result indicating if the lock is held by the owner
     **/
    public async hasLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        const ownerResult = StringUtils.validateAndEncode(owner);
        if (ownerResult.isErr()) return Err(ownerResult.error.message);

        const keyResult = StringUtils.validateAndEncode(key);
        if (keyResult.isErr()) return Err(keyResult.error.message);

        const slotIndex = this.findSlotByKey(keyResult.value);
        if (slotIndex === -1) return Ok(false);

        const slotOffset = slotIndex * BYTES_PER_LOCK;
        const offsets = this.getSlotOffsets(slotIndex);
        const now = BigInt(Date.now());

        const state = Atomics.load(this.int32View, offsets.stateIndex);
        const sequence = Atomics.load(this.bigInt64View, offsets.sequenceIndex);
        const expiry = Atomics.load(this.bigInt64View, offsets.expiryIndex);

        // Check if lock is currently valid (locked and not expired)
        if (state === STATE_LOCKED && expiry > now) {
            const storedOwnerLen = this.uint8View[slotOffset + Offsets.OWNER_LEN] || 0;
            if (storedOwnerLen > 0) {
                const storedOwner = StringUtils.bytesToString({ source: this.uint8View, offset: slotOffset + Offsets.OWNER_STR, length: storedOwnerLen });

                // Re-verify state AND sequence AFTER non-atomic read
                const currentState = Atomics.load(this.int32View, offsets.stateIndex);
                const currentSequence = Atomics.load(this.bigInt64View, offsets.sequenceIndex);

                // Check state, sequence, owner match, and expiry
                if (currentState === STATE_LOCKED && currentSequence === sequence && storedOwner === owner) {
                    if (Atomics.load(this.bigInt64View, offsets.expiryIndex) > now) {
                        return Ok(true);
                    }
                }
            }
        }
        return Ok(false);
    }
}

const StringUtils = {
    textEncoder: new TextEncoder(),
    textDecoder: new TextDecoder(),
    /**
     * Validates a string for lock operations
     * @param str The string to validate
     * @returns Result with validation error or encoded bytes
     */
    validateAndEncode(str: string): Result<Uint8Array> {
        if (!str || str.length === 0) {
            return Err(`'${str}': invalid string (must not be empty)`);
        }

        try {
            const bytes = StringUtils.textEncoder.encode(str);
            if (bytes.length > MAX_STRING_LEN) {
                return Err(`'${str}': byte length (${bytes.length}) must be between 1 and ${MAX_STRING_LEN}`);
            }
            return Ok(bytes);
        } catch (err) {
            return Err(`Failed to encode '${str}': ${err instanceof Error ? err.message : String(err)}`);
        }
    },
    /**
     * Writes a string's bytes to the target byte array.
     * @param str The string to write
     * @param target The target Uint8Array
     * @param offset The offset to write at
     * @param maxLength The maximum allowed length
     * @returns The actual byte length that was written
     */
    stringToBytes({ str, target, offset, maxLength }: { str: string; target: Uint8Array; offset: number; maxLength: number }): number {
        const encoded = StringUtils.textEncoder.encode(str);
        if (encoded.length > maxLength) {
            throw new Error(`String byte length (${encoded.length}) exceeds max length (${maxLength})`);
        }
        target.set(encoded, offset);
        return encoded.length;
    },
    /**
     * Reads a string from a byte array using the explicitly provided length.
     * @param source The source Uint8Array
     * @param offset The offset to read from
     * @param length The exact number of bytes to read for the string
     * @returns The decoded string
     */
    bytesToString({ source, offset, length }: { source: Uint8Array; offset: number; length: number }): string {
        const bytes = source.subarray(offset, offset + length);
        return StringUtils.textDecoder.decode(bytes);
    }
};

import axios from 'axios';
import * as z from 'zod';

interface JWKSResponse {
    keys: Record<string, string>[];
}
interface JWKSCacheEntry extends JWKSResponse {
    expiresAt: number;
}

let jwksCache: JWKSCacheEntry | null = null;

/**
 * Fetches Google JWKS and caches it based on the expires header
 * Returns cached data if still valid, otherwise fetches fresh data
 */
export async function getGoogleJWKS(): Promise<JWKSResponse['keys']> {
    const now = Date.now();

    if (jwksCache && jwksCache.expiresAt > now) {
        return jwksCache.keys;
    }

    const response = await axios.get<JWKSResponse>('https://www.googleapis.com/oauth2/v3/certs');

    const expiresHeader = response.headers['expires'];

    const expiresAt: number = expiresHeader ? new Date(expiresHeader).getTime() : now + 60 * 60 * 1000;

    jwksCache = {
        keys: response.data.keys,
        expiresAt
    };

    return response.data.keys;
}

const botFrameworkJWKSchema = z.object({
    kid: z.string(),
    kty: z.literal('RSA'),
    n: z.string(),
    e: z.string(),
    endorsements: z.array(z.string()).optional()
});
const botFrameworkJWKSResponseSchema = z.object({ keys: z.array(z.unknown()) });

export type BotFrameworkJWK = z.infer<typeof botFrameworkJWKSchema>;

const BOT_FRAMEWORK_JWKS_URL = 'https://login.botframework.com/v1/.well-known/keys';
const BOT_FRAMEWORK_JWKS_TIMEOUT_MS = 5 * 1000;
const BOT_FRAMEWORK_JWKS_TTL_MS = 24 * 60 * 60 * 1000;
// Bounds how often an unknown kid, which anyone can put in a token, or a failing endpoint can trigger a refetch.
const BOT_FRAMEWORK_JWKS_MIN_REFRESH_MS = 5 * 60 * 1000;

let botFrameworkJwksCache: { keys: BotFrameworkJWK[]; fetchedAt: number } | null = null;
let botFrameworkJwksLastAttemptAt = -Infinity;
let botFrameworkJwksFetch: Promise<BotFrameworkJWK[]> | null = null;

/**
 * Returns the Bot Framework signing key for a kid. The key set is cached for a day and refetched
 * early when a kid is unknown, since Microsoft rotates keys without notice.
 */
export async function getBotFrameworkJWK(kid: string): Promise<BotFrameworkJWK | undefined> {
    const now = Date.now();
    const cached = botFrameworkJwksCache?.keys.find((key) => key.kid === kid);
    const age = botFrameworkJwksCache ? now - botFrameworkJwksCache.fetchedAt : Infinity;

    if (cached && age < BOT_FRAMEWORK_JWKS_TTL_MS) {
        return cached;
    }
    if (now - botFrameworkJwksLastAttemptAt < BOT_FRAMEWORK_JWKS_MIN_REFRESH_MS) {
        return cached;
    }

    try {
        const keys = await fetchBotFrameworkJWKS();
        return keys.find((key) => key.kid === kid);
    } catch (err) {
        if (cached) {
            return cached;
        }
        throw err;
    }
}

export function resetBotFrameworkJWKSCache(): void {
    botFrameworkJwksCache = null;
    botFrameworkJwksLastAttemptAt = -Infinity;
    botFrameworkJwksFetch = null;
}

async function fetchBotFrameworkJWKS(): Promise<BotFrameworkJWK[]> {
    if (!botFrameworkJwksFetch) {
        botFrameworkJwksLastAttemptAt = Date.now();
        botFrameworkJwksFetch = axios
            .get<unknown>(BOT_FRAMEWORK_JWKS_URL, { timeout: BOT_FRAMEWORK_JWKS_TIMEOUT_MS })
            .then((response) => {
                // Keys Nango can't use are dropped rather than failing the whole set.
                const keys = botFrameworkJWKSResponseSchema.parse(response.data).keys.flatMap((key) => {
                    const parsed = botFrameworkJWKSchema.safeParse(key);
                    return parsed.success ? [parsed.data] : [];
                });
                if (keys.length === 0) {
                    throw new Error('Bot Framework JWKS response has no usable keys');
                }

                botFrameworkJwksCache = { keys, fetchedAt: Date.now() };
                return keys;
            })
            .finally(() => {
                botFrameworkJwksFetch = null;
            });
    }

    return botFrameworkJwksFetch;
}

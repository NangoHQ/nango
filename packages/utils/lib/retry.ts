interface RetryConfig {
    maxAttempts: number;
    delayMs: number | ((attempt: number) => number);
    retryIf: (error: Error) => boolean;
}

export async function retry<T>(fn: () => T, config: RetryConfig): Promise<T> {
    const { maxAttempts, delayMs, retryIf } = config;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return fn();
        } catch (error) {
            if (attempt < maxAttempts && retryIf(error as Error)) {
                const delay = typeof delayMs === 'number' ? delayMs : delayMs(attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
    throw new Error('unreachable');
}

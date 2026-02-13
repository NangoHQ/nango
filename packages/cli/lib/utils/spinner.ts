import ora from 'ora';

import type { Ora } from 'ora';

/**
 * A wrapper around ora that provides a consistent spinner experience
 * across interactive and non-interactive environments.
 *
 * In non-interactive environments (CI, pre-commit hooks, piped output),
 * it prints text-based progress instead of animated spinners to avoid
 * hangs caused by ora's stdin-discarder dependency.
 *
 * Non-interactive output format:
 *   ✓ Typechecking
 *   ✓ Building 3 file(s)
 *   ✗ Exporting definitions
 */
export class Spinner {
    private readonly canUseSpinner: boolean;

    constructor({ interactive = true }: { interactive?: boolean } = {}) {
        this.canUseSpinner = interactive && Boolean(process.stdout.isTTY) && Boolean(process.stdin?.isTTY);
    }

    /**
     * Creates and starts a new spinner with the given text.
     * In non-interactive mode, nothing is printed until completion (succeed/fail/warn/info).
     */
    start(text: string): Ora {
        if (this.canUseSpinner) {
            return ora({ text }).start();
        }

        // Non-interactive mode: don't print anything yet, wait for completion
        return this.createNoOpSpinner(text);
    }

    private createNoOpSpinner(initialText: string): Ora {
        const state = {
            text: initialText,
            isSpinning: true,
            completed: false,
            indent: 0,
            color: 'cyan' as const,
            prefixText: '',
            suffixText: ''
        };

        // Use a Proxy to safely handle any Ora method/property access
        // This prevents runtime crashes if code uses methods we haven't explicitly handled
        const handler: ProxyHandler<object> = {
            get(_target, prop: string | symbol) {
                // Handle known properties
                if (prop === 'text') return state.text;
                if (prop === 'isSpinning') return state.isSpinning;
                if (prop === 'indent') return state.indent;
                if (prop === 'color') return state.color;
                if (prop === 'prefixText') return state.prefixText;
                if (prop === 'suffixText') return state.suffixText;

                // Handle completion methods that print output
                if (prop === 'succeed') {
                    return (text?: string) => {
                        if (state.completed) {
                            // Already completed - if new text provided, print as new line
                            if (text && text !== state.text) {
                                console.log(`✓ ${text}`);
                            }
                            return proxy;
                        }
                        state.completed = true;
                        state.isSpinning = false;
                        console.log(`✓ ${text ?? state.text}`);
                        return proxy;
                    };
                }
                if (prop === 'fail') {
                    return (text?: string) => {
                        if (state.completed) {
                            if (text && text !== state.text) {
                                console.log(`✗ ${text}`);
                            }
                            return proxy;
                        }
                        state.completed = true;
                        state.isSpinning = false;
                        console.log(`✗ ${text ?? state.text}`);
                        return proxy;
                    };
                }
                if (prop === 'warn') {
                    return (text?: string) => {
                        if (state.completed) {
                            if (text && text !== state.text) {
                                console.log(`⚠ ${text}`);
                            }
                            return proxy;
                        }
                        state.completed = true;
                        state.isSpinning = false;
                        console.log(`⚠ ${text ?? state.text}`);
                        return proxy;
                    };
                }
                if (prop === 'info') {
                    return (text?: string) => {
                        if (state.completed) {
                            if (text && text !== state.text) {
                                console.log(`ℹ ${text}`);
                            }
                            return proxy;
                        }
                        state.completed = true;
                        state.isSpinning = false;
                        console.log(`ℹ ${text ?? state.text}`);
                        return proxy;
                    };
                }
                if (prop === 'stopAndPersist') {
                    return (options?: { text?: string; symbol?: string }) => {
                        if (state.completed) return proxy;
                        state.completed = true;
                        state.isSpinning = false;
                        const symbol = options?.symbol ?? '✓';
                        console.log(`${symbol} ${options?.text ?? state.text}`);
                        return proxy;
                    };
                }

                // Handle methods that return string
                if (prop === 'frame') {
                    return () => '';
                }

                // Handle all other methods as no-ops that return the proxy (for chaining)
                // This includes: start, stop, clear, render, etc.
                return (..._args: unknown[]) => proxy;
            },
            set(_target, prop: string | symbol, value: unknown) {
                if (prop === 'text' && typeof value === 'string') {
                    // Print new text on a new line to show progress (like ora updates in-place)
                    if (value !== state.text && state.isSpinning) {
                        console.log(`  ${value}`);
                    }
                    state.text = value;
                    return true;
                }
                if (prop === 'indent' && typeof value === 'number') {
                    state.indent = value;
                    return true;
                }
                if (prop === 'color' && typeof value === 'string') {
                    state.color = value as typeof state.color;
                    return true;
                }
                if (prop === 'prefixText' && typeof value === 'string') {
                    state.prefixText = value;
                    return true;
                }
                if (prop === 'suffixText' && typeof value === 'string') {
                    state.suffixText = value;
                    return true;
                }
                return true;
            }
        };

        const proxy = new Proxy({}, handler) as Ora;
        return proxy;
    }
}

/**
 * Whether the usage breakdown view is shown. Always true post-cutover — kept
 * as a hook so call sites don't have to change while the always-true
 * conditionals downstream get inlined in follow-up cleanup.
 */
export function useBreakdownEnabled(): boolean {
    return true;
}

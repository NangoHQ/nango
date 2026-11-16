export function findScrollParent(node: Element): HTMLElement | null {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const { overflowY } = getComputedStyle(parent);
        if (overflowY === 'auto' || overflowY === 'scroll') {
            return parent;
        }
    }
    return null;
}

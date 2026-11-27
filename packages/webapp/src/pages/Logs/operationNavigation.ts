export type NavigationDirection = 'previous' | 'next';

export function neighbourId(ids: string[], currentId: string, direction: NavigationDirection): string | null {
    const index = ids.indexOf(currentId);
    if (index === -1) {
        return null;
    }
    return ids[direction === 'next' ? index + 1 : index - 1] ?? null;
}

const KEYS: Record<string, NavigationDirection> = {
    ArrowUp: 'previous',
    k: 'previous',
    ArrowDown: 'next',
    j: 'next'
};

// Menus, listboxes and dialogs use the arrow keys for their own items.
const KEY_OWNERS = 'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], [role="dialog"], [role="combobox"]';

export function navigationDirection(
    event: Pick<KeyboardEvent, 'key' | 'target' | 'defaultPrevented' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>
): NavigationDirection | null {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return null;
    }
    const direction = KEYS[event.key];
    if (!direction) {
        return null;
    }
    if (event.target instanceof Element && event.target.closest(KEY_OWNERS)) {
        return null;
    }
    return direction;
}

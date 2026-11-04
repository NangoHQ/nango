import { useCatalogPrototypeStore } from '@/features/catalogPrototype';

export function useFunctionDisplayName(name: string): string {
    const readable = useCatalogPrototypeStore((state) => state.readableFunctionNames);
    return readable ? humanizeFunctionName(name) : name;
}

function humanizeFunctionName(name: string): string {
    const words = name.replaceAll(/[-_]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export type ActionVerb = 'create' | 'update' | 'delete' | 'get' | 'list' | 'search' | 'send' | 'other';

const VERBS: Record<Exclude<ActionVerb, 'other'>, string[]> = {
    create: ['create', 'add', 'insert', 'upload', 'import', 'invite', 'append', 'copy', 'duplicate'],
    update: ['update', 'patch', 'set', 'edit', 'modify', 'move', 'assign', 'mark', 'upsert', 'merge', 'rename', 'activate', 'enable', 'restore', 'unarchive'],
    delete: ['delete', 'remove', 'clear', 'archive', 'cancel', 'revoke', 'void', 'deactivate', 'disable', 'unassign', 'purge', 'detach'],
    get: ['get', 'fetch', 'retrieve', 'read', 'lookup', 'check', 'whoami', 'download', 'export', 'count', 'verify', 'validate', 'preview', 'describe'],
    list: ['list'],
    search: ['search', 'find', 'query'],
    send: ['send', 'post', 'submit', 'reply', 'forward', 'notify']
};

export function getActionVerb(name: string): ActionVerb {
    const firstWord = name.split(/[-_]/)[0]?.toLowerCase() ?? '';
    const match = Object.entries(VERBS).find(([, words]) => words.includes(firstWord));
    return match ? (match[0] as ActionVerb) : 'other';
}

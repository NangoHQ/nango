import type { LogsType, TypeOption } from './constants';

export type GroupState = 'none' | 'partial' | 'all';

export function groupState(selected: LogsType[], group: TypeOption): GroupState {
    if (selected.includes(group.value)) {
        return 'all';
    }
    if (group.children?.some((child) => selected.includes(child.value))) {
        return 'partial';
    }
    return 'none';
}

export function toggleGroup(selected: LogsType[], group: TypeOption): LogsType[] {
    const childValues = new Set(group.children?.map((child) => child.value));
    const rest = selected.filter((value) => value !== group.value && !childValues.has(value));
    return selected.includes(group.value) ? rest : [...rest, group.value];
}

export function toggleSubtype(selected: LogsType[], group: TypeOption, subtype: LogsType): LogsType[] {
    const children = group.children?.map((child) => child.value) ?? [];

    if (selected.includes(group.value)) {
        const others = selected.filter((value) => value !== group.value);
        return [...others, ...children.filter((child) => child !== subtype)];
    }

    const next = selected.includes(subtype) ? selected.filter((value) => value !== subtype) : [...selected, subtype];
    if (children.length > 0 && children.every((child) => next.includes(child))) {
        return [...next.filter((value) => !children.includes(value)), group.value];
    }
    return next;
}

export function typeLabel(value: LogsType, options: TypeOption[]): string {
    for (const group of options) {
        if (group.value === value) {
            return group.label;
        }
        const child = group.children?.find((option) => option.value === value);
        if (child) {
            return `${group.label} ${child.label}`;
        }
    }
    return value;
}

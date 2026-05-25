export function toKebab(s: string) {
    return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isValidURL(str: string) {
    try {
        // TODO: replace with canParse after we drop v18
        new URL(str);
        return true;
    } catch {
        return false;
    }
}

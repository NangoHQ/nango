export function toAcronym(name: string): string {
    const clean = name
        // remove all tag-like sequences: [Shared][Prod]
        .replace(/\[[^\]]*\]/g, '')
        // replace noisy chars with spaces
        .replace(/[/._&:#:;@|?-]/g, ' ')
        // remove ad-hoc key words
        .replace(/(https?|www|test|dev|(pre)?prod(uction| |$)|demo|poc|wip)/gi, '');

    const firstLetters = clean.match(/\b(\w)/g)?.join('');
    if (firstLetters && firstLetters.length > 1) {
        return firstLetters.slice(0, 2).toUpperCase();
    }

    // Rollback to something generic if nothing is left
    return (
        name
            .replace(/[^a-zA-Z]/g, '')
            .slice(0, 2)
            .toUpperCase() || name.substring(0, 2)
    );
}

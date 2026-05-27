/**
 * Applies the current theme to the DOM.
 *
 * Sets both the `.dark` Tailwind class (for dark-mode utilities) and the
 * `data-theme` attribute (for CSS design-token selectors) on the root element.
 */
export function applyTheme(dark: boolean): void {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
}

import axe from 'axe-core';
import { expect } from 'vitest';

// WCAG 2.2 AA scope (the standard NAN-5901/5906 target), including the 2.1/2.2 additions.
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Runs axe over `element` and asserts zero violations, with a concise rule summary on failure. */
async function expectNoAxeViolations(element: HTMLElement, label: string): Promise<void> {
    const results = await axe.run(element, { runOnly: { type: 'tag', values: WCAG_AA_TAGS } });
    const summary = results.violations.map((v) => `[${v.id}] ${v.help} — ${v.nodes.map((n) => n.target.map(String).join(' ')).join(' | ')}`);
    expect(summary, `axe violations (${label})`).toEqual([]);
}

/**
 * Scans `element` for accessibility violations in BOTH light and dark themes (the redesign ships
 * both). Real CSS is required for color-contrast checks, which is why these run in Browser Mode.
 */
export async function expectAccessibleInBothThemes(element: HTMLElement): Promise<void> {
    for (const theme of ['light', 'dark'] as const) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        await expectNoAxeViolations(element, `${theme} theme`);
    }
    document.documentElement.classList.remove('dark');
}

import axe from 'axe-core';
import { expect } from 'vitest';

// WCAG 2.2 AA scope (the standard NAN-5901/5906 target), including the 2.1/2.2 additions.
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Runs axe over `element` and asserts zero violations. */
async function expectNoAxeViolations(element: HTMLElement, label: string): Promise<void> {
    const results = await axe.run(element, { runOnly: { type: 'tag', values: WCAG_AA_TAGS } });
    // One entry per failing node so the assertion diff is actionable: rule id, the element selector,
    // and axe's fix summary — which for color-contrast includes the foreground/background colors and
    // the measured vs. required ratio (e.g. "...contrast of 2.19 (foreground #ffffff, background
    // #00b2e3...). Expected contrast ratio of 4.5:1").
    const summary = results.violations.flatMap((v) =>
        v.nodes.map((n) => `[${v.id}] ${n.target.map(String).join(' ')} — ${(n.failureSummary ?? v.help).replace(/\s*\n\s*/g, ' ')}`)
    );
    expect(summary, `axe violations (${label})`).toEqual([]);
}

/**
 * Scans `element` for accessibility violations in BOTH light and dark themes (the redesign ships
 * both). Real CSS is required for color-contrast checks, which is why these run in Browser Mode.
 */
export async function expectAccessibleInBothThemes(element: HTMLElement): Promise<void> {
    try {
        for (const theme of ['light', 'dark'] as const) {
            document.documentElement.classList.toggle('dark', theme === 'dark');
            await expectNoAxeViolations(element, `${theme} theme`);
        }
    } finally {
        // Always reset the theme class, even if a theme's assertion throws, so the failure
        // can't leak the `dark` class into later tests in the shared browser page.
        document.documentElement.classList.remove('dark');
    }
}

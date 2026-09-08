import { expect, userEvent, within } from 'storybook/test';

import { AuditExportDialog } from '@/pages/Audit/components/AuditExportDialog';

import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Confirms a CSV export of the audit trail. What the dialog says depends on the event count the list
 * endpoint returned, which has three outcomes — one story each. The dialog owns its own `open` state,
 * so each story clicks it open rather than passing a prop.
 */
const meta: Meta<typeof AuditExportDialog> = {
    component: AuditExportDialog,
    title: 'Features/Audit Trail/AuditExportDialog',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// Fixed so the window label doesn't move between runs. Its zone suffix still follows the viewer's own.
const filters = { from: '2026-08-21T00:00:00.000+02:00', to: undefined, resources: [], actions: [] };
const selection = { resources: [], actions: [] };

const openDialog = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Export' }));
    await expect(await within(document.body).findByRole('heading', { name: 'Export audit trail' })).toBeVisible();
};

/** Everything the filters match fits in one export, so the count is exact and no cap is mentioned. */
export const UnderCap: Story = {
    args: { query: filters, selection, total: { value: 170, relation: 'eq' } },
    play: openDialog
};

/** `gte` means the count stopped at the cap, so the export is a truncated slice and says so. */
export const Capped: Story = {
    args: { query: filters, selection, total: { value: 50_000, relation: 'gte' } },
    play: openDialog
};

/** The count failed. With no number to show, the cap has to be stated unconditionally. */
export const CountUnavailable: Story = {
    args: { query: filters, selection, total: undefined },
    play: openDialog
};

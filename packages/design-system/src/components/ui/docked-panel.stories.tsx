import { DockedPanel, DockedPanelLayout, DockedPanelMain } from './docked-panel';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta<typeof DockedPanel> = {
    title: 'Design System/Components/DockedPanel',
    component: DockedPanel,
    parameters: { layout: 'fullscreen' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const rows = Array.from({ length: 30 }, (_, i) => `Operation ${i + 1}`);

export const Default: Story = {
    render: () => (
        <div className="h-screen bg-surface-page">
            <DockedPanelLayout>
                <DockedPanelMain>
                    <ul className="overflow-y-auto p-5 text-ds-sm text-text-default">
                        {rows.map((row) => (
                            <li key={row} className="border-b border-border-muted py-2.5">
                                {row}
                            </li>
                        ))}
                    </ul>
                </DockedPanelMain>
                <DockedPanel resizeLabel="Resize details panel">
                    <div className="flex flex-col gap-2 p-5 text-ds-sm text-text-default">
                        <span className="font-ds-medium text-text-strong">Details</span>
                        <span className="text-text-secondary">
                            Drag the left edge, or focus it and use the arrow keys. Below 1180px the panel overlays the list.
                        </span>
                    </div>
                </DockedPanel>
            </DockedPanelLayout>
        </div>
    )
};

import { ArrowUp, Check, Globe, Search, X } from 'lucide-react';

import { CopyButton } from './copy-button';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
    InputGroupKbd,
    InputGroupSwatch,
    InputGroupText,
    InputGroupTextarea
} from './input-group';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Design System/Components/InputGroup',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const ENV_ID = 'a0583184-a6ef-40e5-b716-2d7aeacf84b3';

type StateRow = {
    label: string;
    group?: Record<string, string>;
    input: React.ComponentProps<typeof InputGroupInput>;
};

// Hover is frozen with data-story-state (see .storybook/preview.css). Focus is driven by real browser focus —
// click into any field to see the 1.5px focus/ring-default border.
const STATES: StateRow[] = [
    { label: 'Default', input: { placeholder: 'Placeholder' } },
    { label: 'Hover', group: { 'data-story-state': 'hover' }, input: { placeholder: 'Placeholder' } },
    { label: 'Filled', input: { defaultValue: 'production' } },
    { label: 'Read-only', input: { readOnly: true, defaultValue: ENV_ID } },
    { label: 'Disabled', input: { disabled: true, defaultValue: 'production' } },
    { label: 'Error', input: { 'aria-invalid': true, defaultValue: 'Dev Env' } }
];

const COLUMNS = [
    { label: 'md · text', size: 'md', mono: false },
    { label: 'md · mono', size: 'md', mono: true },
    { label: 'sm · text', size: 'sm', mono: false },
    { label: 'sm · mono', size: 'sm', mono: true }
] as const;

export const States: Story = {
    render: () => (
        <div className="grid grid-cols-[96px_repeat(4,220px)] items-center gap-x-4 gap-y-3">
            <span />
            {COLUMNS.map((c) => (
                <span key={c.label} className="story-section-heading">
                    {c.label}
                </span>
            ))}
            {STATES.map((s) => (
                <div key={s.label} className="contents">
                    <span className="story-section-heading">{s.label}</span>
                    {COLUMNS.map((c) => (
                        <InputGroup key={c.label} size={c.size} {...s.group}>
                            <InputGroupInput mono={c.mono} {...s.input} />
                        </InputGroup>
                    ))}
                </div>
            ))}
        </div>
    )
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="story-section-heading">{label}</span>
            {children}
        </div>
    );
}

// Icon / text / kbd / swatch addons get 6px side padding; button addons are 24px ghost icon buttons 4px from the edge.
export const Addons: Story = {
    render: () => (
        <div className="grid w-[720px] grid-cols-2 gap-x-8 gap-y-5">
            {(['md', 'sm'] as const).map((size) => (
                <div key={size} className="flex flex-col gap-4">
                    <span className="story-section-heading">size="{size}"</span>
                    <Row label="Icon — start">
                        <InputGroup size={size}>
                            <InputGroupAddon>
                                <Globe />
                            </InputGroupAddon>
                            <InputGroupInput placeholder="example.com" />
                        </InputGroup>
                    </Row>
                    <Row label="Text — start">
                        <InputGroup size={size}>
                            <InputGroupAddon>
                                <InputGroupText>https://</InputGroupText>
                            </InputGroupAddon>
                            <InputGroupInput mono defaultValue="api.acme.dev/webhooks/nango" />
                        </InputGroup>
                    </Row>
                    <Row label="Swatch — start">
                        <InputGroup size={size}>
                            <InputGroupAddon>
                                <InputGroupSwatch color="#007CA0" />
                            </InputGroupAddon>
                            <InputGroupInput mono defaultValue="#007CA0" />
                        </InputGroup>
                    </Row>
                    <Row label="Text — end">
                        <InputGroup size={size}>
                            <InputGroupInput type="number" defaultValue="30" />
                            <InputGroupAddon align="inline-end">
                                <InputGroupText>minutes</InputGroupText>
                            </InputGroupAddon>
                        </InputGroup>
                    </Row>
                    <Row label="Icon — end">
                        <InputGroup size={size}>
                            <InputGroupInput defaultValue="dev" />
                            <InputGroupAddon align="inline-end">
                                <Check />
                            </InputGroupAddon>
                        </InputGroup>
                    </Row>
                    <Row label="Kbd — end">
                        <InputGroup size={size}>
                            <InputGroupAddon>
                                <Search />
                            </InputGroupAddon>
                            <InputGroupInput placeholder="Filter scopes" />
                            <InputGroupAddon align="inline-end">
                                <InputGroupKbd>/</InputGroupKbd>
                            </InputGroupAddon>
                        </InputGroup>
                    </Row>
                    <Row label="Button — end">
                        <InputGroup size={size}>
                            <InputGroupAddon>
                                <InputGroupText>https://</InputGroupText>
                            </InputGroupAddon>
                            <InputGroupInput mono defaultValue="api.acme.dev/webhooks/nango" />
                            <InputGroupAddon align="inline-end">
                                <InputGroupButton label="Clear">
                                    <X />
                                </InputGroupButton>
                            </InputGroupAddon>
                        </InputGroup>
                    </Row>
                    <Row label="Copy button — end">
                        <InputGroup size={size}>
                            <InputGroupInput mono readOnly value={ENV_ID} />
                            <InputGroupAddon align="inline-end">
                                <CopyButton text={ENV_ID} />
                            </InputGroupAddon>
                        </InputGroup>
                    </Row>
                </div>
            ))}
        </div>
    )
};

// Layouts kept for existing call sites: block addons, textarea, the Agent Playground composer and hug-content search.
export const Layouts: Story = {
    render: () => (
        <div className="flex w-80 flex-col gap-4">
            <Row label="Block start">
                <InputGroup>
                    <InputGroupAddon align="block-start">
                        <InputGroupText>Header</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput placeholder="Body…" />
                </InputGroup>
            </Row>
            <Row label="Block end — textarea">
                <InputGroup>
                    <InputGroupTextarea placeholder="Write a message…" rows={3} />
                    <InputGroupAddon align="block-end">
                        <InputGroupText>0 / 280</InputGroupText>
                    </InputGroupAddon>
                </InputGroup>
            </Row>
            <Row label='Composer (size="composer")'>
                <InputGroup size="composer">
                    <InputGroupTextarea placeholder="Ask the agent to do something…" rows={1} />
                    <InputGroupAddon align="inline-end">
                        <InputGroupButton label="Send" variant="primary" size="icon-sm">
                            <ArrowUp />
                        </InputGroupButton>
                    </InputGroupAddon>
                </InputGroup>
            </Row>
            <Row label='Hug-content (size="auto")'>
                <InputGroup size="auto" className="px-2.5 py-1.5">
                    <InputGroupAddon className="p-0 pr-2">
                        <Search />
                    </InputGroupAddon>
                    <InputGroupInput size="auto" placeholder="Search…" />
                </InputGroup>
            </Row>
        </div>
    )
};

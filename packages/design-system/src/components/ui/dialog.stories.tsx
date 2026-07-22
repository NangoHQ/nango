import { Button } from './button';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './dialog';
import { Field, FieldLabel } from './field';
import { Input } from './input';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Dialog',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Header + body + footer — the baseline composition. */
export const Default: Story = {
    render: () => (
        <Dialog defaultOpen>
            <DialogTrigger asChild>
                <Button>Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Dialog title</DialogTitle>
                    <DialogDescription>This is a dialog description.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <p className="text-text-secondary text-ds-md">Body content goes here — forms, text, or any custom content.</p>
                </DialogBody>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button variant="primary">Save changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};

/** Form fields in the body (e.g. invite member, create environment, edit role). */
export const WithForm: Story = {
    render: () => (
        <Dialog defaultOpen>
            <DialogTrigger asChild>
                <Button>Invite a team member</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Invite a team member</DialogTitle>
                    <DialogDescription>They&apos;ll get an email with a link to join the team.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <div className="flex flex-col gap-4">
                        <Field>
                            <FieldLabel htmlFor="email">Email address</FieldLabel>
                            <Input id="email" type="email" placeholder="name@company.com" />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="role">Role</FieldLabel>
                            <Input id="role" defaultValue="Full access" />
                        </Field>
                    </div>
                </DialogBody>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button variant="primary">Send invite</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};

/** Header + footer only, no body — a confirmation (title + description carry the message). */
export const Confirmation: Story = {
    render: () => (
        <Dialog defaultOpen>
            <DialogTrigger asChild>
                <Button variant="outline">Revoke invitation</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Revoke invitation</DialogTitle>
                    <DialogDescription>Are you sure you want to revoke the invitation for name@company.com?</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button variant="primary">Revoke</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};

/** Destructive confirmation gated by a typed keyword, with a danger action. */
export const Destructive: Story = {
    render: () => (
        <Dialog defaultOpen>
            <DialogTrigger asChild>
                <Button variant="danger">Delete integration</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete integration</DialogTitle>
                    <DialogDescription>This permanently deletes the integration and all its connections. This cannot be undone.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <Field>
                        <FieldLabel htmlFor="confirm">Type &quot;github&quot; to confirm</FieldLabel>
                        <Input id="confirm" placeholder="github" />
                    </Field>
                </DialogBody>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button variant="danger">Delete integration</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};

/** Wide content (e.g. a record payload / JSON viewer). Width is set via className on DialogContent. */
export const Wide: Story = {
    render: () => (
        <Dialog defaultOpen>
            <DialogTrigger asChild>
                <Button variant="outline">View payload</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="break-all">rec_01H9Z8Q2K3M4N5P6R7S8T9V0W1</DialogTitle>
                    <DialogDescription>GithubIssue payload</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <pre className="bg-surface-panel-inset text-text-default rounded-ds-sm max-h-80 overflow-auto p-4 font-mono text-ds-xs">
                        {JSON.stringify({ id: 123, title: 'Fix the thing', state: 'open', labels: ['bug', 'p1'], assignee: { login: 'octocat' } }, null, 2)}
                    </pre>
                </DialogBody>
            </DialogContent>
        </Dialog>
    )
};

/** Long body that scrolls within the dialog (e.g. create API key, Stripe payment form). */
export const Scrolling: Story = {
    render: () => (
        <Dialog defaultOpen>
            <DialogTrigger asChild>
                <Button>Create API key</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create API key</DialogTitle>
                    <DialogDescription>Name the key and pick its scopes.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <div className="flex flex-col gap-4">
                        <Field>
                            <FieldLabel htmlFor="key-name">Display name</FieldLabel>
                            <Input id="key-name" placeholder="e.g. Production backend" />
                        </Field>
                        {Array.from({ length: 12 }).map((_, i) => (
                            <Field key={i}>
                                <FieldLabel htmlFor={`scope-${i}`}>Scope {i + 1}</FieldLabel>
                                <Input id={`scope-${i}`} defaultValue={`records:read:model_${i + 1}`} />
                            </Field>
                        ))}
                    </div>
                </DialogBody>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button variant="primary">Create API key</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};

/** No close button and non-dismissable — the user must take an explicit action (e.g. save recovery codes). */
export const NonDismissable: Story = {
    render: () => (
        <Dialog defaultOpen>
            <DialogContent showCloseButton={false} onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Save your recovery codes</DialogTitle>
                    <DialogDescription>Keep these somewhere safe. Each code can only be used once and won&apos;t be shown again.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <div className="bg-surface-panel-inset text-text-default rounded-ds-sm grid grid-cols-2 gap-2 p-4 font-mono text-ds-sm">
                        {['a1b2-c3d4', 'e5f6-g7h8', 'i9j0-k1l2', 'm3n4-o5p6'].map((c) => (
                            <code key={c}>{c}</code>
                        ))}
                    </div>
                </DialogBody>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="primary">I saved my codes</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};

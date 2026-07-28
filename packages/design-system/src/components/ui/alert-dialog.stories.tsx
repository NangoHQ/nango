import { Activity, Trash2 } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from './alert-dialog';
import { Button } from './button';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/AlertDialog',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Default size (384px): icon beside the text, buttons right-aligned. */
export const Default: Story = {
    render: () => (
        <AlertDialog defaultOpen>
            <AlertDialogTrigger asChild>
                <Button variant="outline">Enable sync</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader icon={<Activity />}>
                    <AlertDialogTitle>Enable sync?</AlertDialogTitle>
                    <AlertDialogDescription>It will start syncing potentially for multiple connections. This will impact your billing.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Enable</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
};

/** Destructive tone: danger title + danger action (e.g. delete confirmations). */
export const Destructive: Story = {
    render: () => (
        <AlertDialog defaultOpen>
            <AlertDialogTrigger asChild>
                <Button variant="danger">Remove member</Button>
            </AlertDialogTrigger>
            <AlertDialogContent destructive>
                <AlertDialogHeader icon={<Trash2 />}>
                    <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                    <AlertDialogDescription>They&apos;ll immediately lose access to this team and its environments.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Remove</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
};

/** Small size (320px): centered header, buttons split full-width. */
export const Small: Story = {
    render: () => (
        <AlertDialog defaultOpen>
            <AlertDialogTrigger asChild>
                <Button variant="outline">Deploy sync</Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
                <AlertDialogHeader icon={<Activity />}>
                    <AlertDialogTitle>Deploy sync?</AlertDialogTitle>
                    <AlertDialogDescription>It will start syncing potentially for multiple connections. This will impact your billing.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Deploy</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
};

/** Small + destructive. */
export const SmallDestructive: Story = {
    render: () => (
        <AlertDialog defaultOpen>
            <AlertDialogTrigger asChild>
                <Button variant="danger">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm" destructive>
                <AlertDialogHeader icon={<Trash2 />}>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone. This will permanently delete your account from our servers.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
};

/**
 * A verbose action label (real delete-integration confirmation). The default dialog is capped at
 * its base width for short content but grows — up to the ceiling — so a long footer button fits on
 * one line instead of clipping.
 */
export const LongCtas: Story = {
    render: () => (
        <AlertDialog defaultOpen>
            <AlertDialogTrigger asChild>
                <Button variant="danger">Delete integration</Button>
            </AlertDialogTrigger>
            <AlertDialogContent destructive>
                <AlertDialogHeader icon={<Trash2 />}>
                    <AlertDialogTitle>Delete integration?</AlertDialogTitle>
                    <AlertDialogDescription>
                        You are about to permanently delete this integration, all of its associated connections and records. This operation is not reversible,
                        are you sure you wish to continue?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Delete integration, connections and records</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
};

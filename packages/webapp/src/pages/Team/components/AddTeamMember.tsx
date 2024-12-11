import { Cross1Icon, PlusIcon } from '@radix-ui/react-icons';
import { Button } from '../../../components/ui/button/Button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../../../components/ui/Dialog';
import type { ApiTeam } from '@nangohq/types';
import { useState } from 'react';
import { Input } from '../../../components/ui/input/Input';
import { useTeam } from '../../../hooks/useTeam';
import { useStore } from '../../../store';
import { useToast } from '../../../hooks/useToast';
import { cn } from '../../../utils/utils';
import { apiPostInvite } from '../../../hooks/useInvite';

const emailReg = /(.+)?<(.+[@].+)>/;
const invalidChar = /['()&=\\/;,?`$*$€^¨°<>]/;

export const AddTeamMember: React.FC<{ team: ApiTeam }> = ({ team }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutate } = useTeam(env);

    const [open, setOpen] = useState(false);
    const [emails, setEmails] = useState<{ value: string; error?: string | null }[]>([{ value: '' }]);
    const [loading, setLoading] = useState(false);

    const onUpdate = (value: string, index: number) => {
        const next = emails
            .map((v, i) => {
                return i === index ? { value } : v;
            })
            .filter((v) => v.value !== '');
        if (next.length === 0 || next[next.length - 1].value !== '') {
            next.push({ value: '' });
        }
        setEmails(next);
    };

    const onRemove = (index: number) => {
        if (index === 0 && emails.length === 1) {
            setEmails([{ value: '' }]);
        } else {
            setEmails(emails.filter((_, i) => i !== index));
        }
    };

    const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const filtered = handlePastedEmails(
            e.clipboardData.getData('Text'),
            emails.map((email) => email.value)
        );
        if (!filtered || filtered.size === 0) {
            return;
        }

        setEmails((prev) => {
            const copy = [...prev].filter((v) => v.value !== '');
            const next = Array.from(filtered);
            console.log({ copy, next });

            copy.push(...next.map((email) => ({ value: email })));
            copy.push({ value: '' });
            return copy;
        });
    };

    const onSubmit = async () => {
        setLoading(true);

        const created = await apiPostInvite(env, { emails: emails.map((email) => email.value).filter(Boolean) });

        if ('data' in created.json) {
            toast({ title: `${created.json.data.invited.length} new members have successfully been added to ${team.name}'s team`, variant: 'success' });
            setOpen(false);
            setEmails([{ value: '' }]);
            void mutate();
        } else if (created.res.status === 400 && 'error' in created.json && created.json.error.code === 'invalid_body') {
            // Append validation error to each email
            const errors = created.json.error.errors!;
            const tmp = emails.map(({ value }, index) => {
                return { value, error: errors.find((err) => err.path[0] === 'emails' && err.path[1] === index)?.message };
            });
            setEmails(tmp);
        } else {
            toast({ title: 'An unexpected error occurred', variant: 'error' });
        }

        setLoading(false);
    };

    return (
        <div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button>
                        <PlusIcon /> Add Team Member
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogTitle>Invite new members to {team.name}&apos;s team</DialogTitle>
                    <DialogDescription>
                        You are about to invite the following members to {team.name}&apos;s team, are you sure you wish to continue?
                    </DialogDescription>
                    <div className="my-6">
                        <h4 className="font-semibold text-white text-sm mb-4">Emails:</h4>
                        <div className="flex flex-col gap-2">
                            {emails.map((email, i) => {
                                return (
                                    <div key={i} className="flex flex-col gap-0.5">
                                        <div className="flex gap-2">
                                            <Input
                                                value={email.value}
                                                type="email"
                                                onChange={(e) => onUpdate(e.target.value, i)}
                                                inputSize={'lg'}
                                                variant={email.value === '' ? 'border' : 'black'}
                                                onPaste={(e) => onPaste(e)}
                                                className={cn(email.error && 'border-red-base')}
                                                placeholder="email@example.com"
                                            />
                                            <Button variant={'icon'} size="lg" onClick={() => onRemove(i)}>
                                                <Cross1Icon />
                                            </Button>
                                        </div>
                                        {email.error && <div className="text-red-base text-sm">{email.error}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant={'zinc'}>Cancel</Button>
                        </DialogClose>
                        <Button
                            variant={'primary'}
                            onClick={onSubmit}
                            isLoading={loading}
                            disabled={emails.filter((v) => v.value !== '').length <= 0}
                            className="disabled:bg-pure-black"
                        >
                            Invite new members
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

function handlePastedEmails(clip: string, prev: string[]) {
    if (!clip) {
        return;
    }

    const split = clip.split(/[\n, ]/g);

    const filtered = new Set<string>();
    for (const item of split) {
        let transformed = item.trim();

        // Match "foo bar <foo@bar.com>"
        const match = transformed.match(emailReg);
        if (match) {
            transformed = match[2];
        }

        if (transformed === '') {
            continue;
        }

        // Invalid split if all emails are concatenated we can't do much
        const hasAt = transformed.match(/@/g);
        if (!hasAt || hasAt.length > 1) {
            continue;
        }

        // invalid chars
        if (transformed.match(invalidChar)) {
            continue;
        }

        // dedup
        if (prev.find((v) => v === transformed)) {
            continue;
        }

        filtered.add(transformed);
    }
    return filtered;
}

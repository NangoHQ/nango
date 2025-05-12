import { IconCalendar, IconCheck } from '@tabler/icons-react';
import { format, subDays } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from './ui/Popover';
import { matchPresetFromPeriod, parsePeriod } from '../utils/dates';
import { cn } from '../utils/utils';
import { Button } from './ui/button/Button';

import type { Period, PeriodPreset } from '../utils/dates';

const dateTimeFormat = 'LLL dd, HH:mm';

export interface PeriodSelectorProps {
    period: Period;
    isLive: boolean;
    onChange: (date: Period | null, live: boolean) => void;
    presets: PeriodPreset[];
    defaultPreset?: PeriodPreset;
}

export const PeriodSelector = ({ period, isLive, onChange, presets, defaultPreset }: PeriodSelectorProps) => {
    const [open, setOpen] = useState(false);

    const [selectedPreset, setSelectedPreset] = useState<PeriodPreset | null>(null);

    const [customRangeInputValue, setCustomRangeInputValue] = useState<string>('');
    const [rangeInputErrorMessage, setRangeInputErrorMessage] = useState('');

    const rangeInputExample = useMemo(() => {
        return `${format(subDays(new Date(), 1), dateTimeFormat)} - ${format(new Date(), dateTimeFormat)}`;
    }, []);

    useEffect(() => {
        const preset = matchPresetFromPeriod(period, presets);
        setSelectedPreset(preset);
    }, [period, presets]);

    const onSubmitCustomRange = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setRangeInputErrorMessage('');

        const inputValue = e.currentTarget.querySelector('input')?.value;
        if (!inputValue) {
            setRangeInputErrorMessage('Set custom range');
            return;
        }

        const { period: dateRange, error } = parsePeriod(inputValue, dateTimeFormat, rangeInputExample);
        if (error || !dateRange) {
            setRangeInputErrorMessage(error || 'Invalid date');
            return;
        }

        setSelectedPreset(null);
        onChange(dateRange, false);
        setOpen(false);
    };

    const onPresetSelected = (preset: PeriodPreset) => {
        setSelectedPreset(preset);
        const dateRange = preset.toPeriod();
        const isLive = !dateRange?.to;
        onChange(dateRange, isLive);
        setOpen(false);
    };

    const buttonDisplay = useMemo(() => {
        if (selectedPreset !== null) {
            return selectedPreset.label;
        }
        if (period.from && period.to) {
            return `${format(period.from, dateTimeFormat)} - ${format(period.to, dateTimeFormat)}`;
        }
        return format(period.from, dateTimeFormat);
    }, [period, selectedPreset]);

    return (
        <Popover
            open={open}
            onOpenChange={(open) => {
                setOpen(open);

                if (open) {
                    setCustomRangeInputValue(`${format(period?.from, dateTimeFormat)} - ${format(period?.to ?? new Date(), dateTimeFormat)}`);
                    setRangeInputErrorMessage('');
                }
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    variant="zombieGray"
                    size={'sm'}
                    className={cn('flex-grow truncate text-text-light-gray', selectedPreset !== defaultPreset && 'text-white')}
                >
                    <IconCalendar size={18} />
                    {buttonDisplay} {isLive && '(live)'}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-fit p-4 pt-0 rounded-md text-sm text-grayscale-11 bg-grayscale-1" align="end">
                <div className="flex flex-col gap-4 w-80">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-grayscale-8 self-end">UTC{format(new Date(), 'XXX')}</span>
                        <div
                            className={cn(
                                'h-10 flex items-center bg-grayscale-3 rounded-md',
                                !selectedPreset && 'border border-grayscale-8',
                                rangeInputErrorMessage && 'border border-alert-red'
                            )}
                        >
                            <div className="w-12 flex-shrink-0 flex justify-center items-center h-full p-1 bg-grayscale-5 rounded-md font-medium">
                                <IconCalendar size={18} />
                            </div>
                            <form onSubmit={onSubmitCustomRange} className="w-full">
                                <input
                                    type="text"
                                    placeholder={rangeInputExample}
                                    className="w-full bg-transparent text-sm text-grayscale-13 placeholder:text-grayscale-10 focus:outline-none focus:ring-0 border-none"
                                    value={customRangeInputValue}
                                    onChange={(e) => setCustomRangeInputValue(e.target.value)}
                                />
                            </form>
                        </div>
                        {rangeInputErrorMessage && <span className="text-alert-red text-sm">{rangeInputErrorMessage}</span>}
                    </div>
                    <div className="flex flex-col gap-2 w-80">
                        {presets.map((preset) => {
                            return (
                                <div
                                    key={preset.name}
                                    className={cn(
                                        'flex items-center gap-2 cursor-pointer hover:bg-grayscale-3 rounded-md',
                                        selectedPreset?.name === preset.name && 'bg-grayscale-3 text-grayscale-13'
                                    )}
                                    onClick={() => onPresetSelected(preset)}
                                >
                                    <div className="flex-grow flex items-center gap-2">
                                        <div className="w-12 flex-shrink-0 flex justify-center items-center p-1 bg-grayscale-5 rounded-md font-medium">
                                            {preset.shortLabel}
                                        </div>
                                        <span>{preset.label}</span>
                                    </div>
                                    {selectedPreset?.name === preset.name && <IconCheck className="w-4 h-4 mr-2" />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};

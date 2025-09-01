import { IconMoon, IconSun } from '@tabler/icons-react';
import { Helmet } from 'react-helmet';

import { ColorInput } from './components/ColorInput';
import { ConnectUIPreview } from './components/ConnectUIPreview';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/button/Button';
import DashboardLayout from '../../layout/DashboardLayout';

export const ConnectUISettings = () => {
    return (
        <DashboardLayout selectedItem={LeftNavBarItems.ConnectUI} className="p-6 w-full h-full">
            <Helmet>
                <title>Connect UI - Nango</title>
            </Helmet>
            <div className="flex flex-col h-full">
                <h2 className="mb-8 text-3xl font-semibold tracking-tight text-white">Connect UI Settings</h2>
                {/** Form */}
                <div className="flex justify-center gap-8">
                    <div className="flex flex-col gap-8">
                        {/** Other settings */}
                        <div className="space-y-4">
                            <h2 className="text-lg font-bold text-grayscale-100 flex gap-2">Settings</h2>
                            <div className="flex gap-2 items-center">
                                <Checkbox id="showWatermark" />
                                <label htmlFor="showWatermark" className={`text-sm font-medium text-grayscale-300`}>
                                    Show watermark
                                </label>
                            </div>
                        </div>

                        {/** Theme */}
                        <div className="space-y-4">
                            <h2 className="text-lg font-bold text-grayscale-100 flex gap-2">Theme</h2>
                            <div className="flex gap-8 h-fit">
                                <div className="flex flex-col gap-4">
                                    <h3 className="text-md font-medium text-grayscale-100 flex gap-2">
                                        <IconSun className="w-6 h-6" /> Light
                                    </h3>

                                    <ColorInput name="background" id="background" label="Background" />
                                    <ColorInput name="foreground" id="foreground" label="Foreground" />
                                    <ColorInput name="primary" id="primary" label="Primary" />
                                    <ColorInput name="primaryForeground" id="primaryForeground" label="Primary Foreground" />
                                    <ColorInput name="textPrimary" id="textPrimary" label="Text Primary" />
                                    <ColorInput name="textMuted" id="textMuted" label="Text Muted" />
                                </div>
                                <div className="w-px bg-grayscale-4" />
                                <div className="flex flex-col gap-4">
                                    <h3 className="text-md font-medium text-grayscale-100 flex gap-2">
                                        <IconMoon className="w-6 h-6" /> Dark
                                    </h3>

                                    <ColorInput name="background" id="background" label="Background" />
                                    <ColorInput name="foreground" id="foreground" label="Foreground" />
                                    <ColorInput name="primary" id="primary" label="Primary" />
                                    <ColorInput name="primaryForeground" id="primaryForeground" label="Primary Foreground" />
                                    <ColorInput name="textPrimary" id="textPrimary" label="Text Primary" />
                                    <ColorInput name="textMuted" id="textMuted" label="Text Muted" />
                                </div>
                            </div>
                        </div>

                        {/** Save Button */}
                        <Button variant="primary" size="md" className="self-end">
                            Save settings
                        </Button>
                    </div>

                    {/** Preview */}
                    <ConnectUIPreview className="h-full w-[500px]" />
                </div>
            </div>
        </DashboardLayout>
    );
};

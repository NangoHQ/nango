import { IconChevronRight, IconLockOpen2, IconPencil, IconRefresh, IconTool } from '@tabler/icons-react';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import Button from '../../components/ui/button/Button';
import { Tag } from '../../components/ui/label/Tag';
import DashboardLayout from '../../layout/DashboardLayout';
import { useAnalyticsTrack } from '../../utils/analytics';
import { Helmet } from 'react-helmet';
import { useScript } from '@uidotdev/usehooks';
import { useEffect } from 'react';

export const GettingStarted: React.FC = () => {
    const analyticsTrack = useAnalyticsTrack();

    const ytLoaded = useScript('https://www.youtube.com/iframe_api');
    useEffect(() => {
        if (ytLoaded !== 'ready') {
            return;
        }

        // The API will call this function when page has finished downloading
        // @ts-expect-error yes I want this
        window.onYouTubeIframeAPIReady = () => {
            try {
                const player = window.YT.Player('player', {
                    height: '100%',
                    width: '100%',
                    videoId: 'oTpWlmnv7dM',
                    playerVars: {
                        playsinline: 1
                    },
                    events: {
                        onStateChange: (event: { data: number }) => {
                            switch (event.data) {
                                case 0:
                                    console.log('event on end');
                                    break;
                                case 1:
                                    console.log('event on playing');
                                    break;
                                case 2:
                                    console.log('event on playing');
                                    break;
                                default:
                            }
                        }
                    }
                });
                player.on('stateChange', (e) => {
                    console.log('vt', e);
                });
            } catch {
                // do nothing
            }
        };
        // @ts-expect-error yes I want this
        window.onPlayerStateChange = (event) => {
            console.log('prout global', event);
        };
    }, [ytLoaded]);

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.GettingStarted} className="flex flex-col gap-9">
            <Helmet>
                <title>Getting Started - Nango</title>
            </Helmet>
            <div className="border rounded-lg border-grayscale-700">
                <div id="player" style={{ aspectRatio: '16 / 9' }}></div>
            </div>
            <h1 className="text-xl font-semibold text-white">Build your first integration from here:</h1>
            <div className="grid grid-cols-2 text-white gap-7">
                <a
                    className="transition-all block border rounded-lg border-grayscale-700 p-7 group hover:border-gray-600 hover:shadow-card focus:shadow-card focus:border-gray-600 focus:outline-0"
                    href="https://docs.nango.dev/integrate/guides/authorize-an-api"
                    onClick={() => analyticsTrack('web:getting_started:authorize')}
                >
                    <header className="flex justify-between">
                        <div className="flex gap-3 items-start">
                            <Tag bgClassName="border border-grayscale-700 px-2" textClassName="text-white text-[12px]">
                                Guide 1
                            </Tag>
                            <h2>Authorize</h2>
                        </div>
                        <div className="rounded-full border border-grayscale-700 p-2 h-[33px] w-[33px]">
                            <IconLockOpen2 stroke={1} size={15} />
                        </div>
                    </header>
                    <main>
                        <p className="text-sm text-grayscale-400">Let users authorize an API from your app.</p>
                    </main>
                    <footer className="mt-4">
                        <Button variant={'link'} size={'auto'} className="group-hover:text-white group-focus:text-white">
                            Learn more <IconChevronRight stroke={1} size={20} />
                        </Button>
                    </footer>
                </a>

                <a
                    className="transition-all block border rounded-lg border-grayscale-700 p-7 group hover:border-gray-600 hover:shadow-card"
                    href="https://docs.nango.dev/integrate/guides/sync-data-from-an-api"
                    onClick={() => analyticsTrack('web:getting_started:read')}
                >
                    <header className="flex justify-between">
                        <div className="flex gap-3 items-start">
                            <Tag bgClassName="border border-grayscale-700 px-2" textClassName="text-white text-[12px]">
                                Guide 2
                            </Tag>
                            <h2>Read data</h2>
                        </div>
                        <div className="rounded-full border border-grayscale-700 p-2 h-[33px] w-[33px]">
                            <IconRefresh stroke={1} size={15} />
                        </div>
                    </header>
                    <main>
                        <p className="text-sm text-grayscale-400">Continuously sync data from an API.</p>
                    </main>
                    <footer className="mt-4">
                        <Button variant={'link'} size={'auto'} className="group-hover:text-white group-focus:text-white">
                            Learn more <IconChevronRight stroke={1} size={20} />
                        </Button>
                    </footer>
                </a>

                <a
                    className="transition-all block border rounded-lg border-grayscale-700 p-7 group hover:border-gray-600 hover:shadow-card"
                    href="https://docs.nango.dev/integrate/guides/perform-workflows-with-an-api"
                    onClick={() => analyticsTrack('web:getting_started:perform')}
                >
                    <header className="flex justify-between">
                        <div className="flex gap-3 items-start">
                            <Tag bgClassName="border border-grayscale-700 px-2" textClassName="text-white text-[12px]">
                                Guide 3
                            </Tag>
                            <h2>Write data</h2>
                        </div>
                        <div className="rounded-full border border-grayscale-700 p-2 h-[33px] w-[33px]">
                            <IconPencil stroke={1} size={15} />
                        </div>
                    </header>
                    <main>
                        <p className="text-sm text-grayscale-400">Write data back to APIs.</p>
                    </main>
                    <footer className="mt-4">
                        <Button variant={'link'} size={'auto'} className="group-hover:text-white group-focus:text-white">
                            Learn more <IconChevronRight stroke={1} size={20} />
                        </Button>
                    </footer>
                </a>

                <a
                    className="transition-all block border rounded-lg border-grayscale-700 p-7 group hover:border-gray-600 hover:shadow-card"
                    href="https://docs.nango.dev/customize/guides/create-a-custom-integration"
                    onClick={() => analyticsTrack('web:getting_started:custom')}
                >
                    <header className="flex justify-between">
                        <div className="flex gap-3 items-start">
                            <Tag bgClassName="border border-grayscale-700 px-2" textClassName="text-white text-[12px]">
                                Guide 4
                            </Tag>
                            <h2>Build custom integrations</h2>
                        </div>
                        <div className="rounded-full border border-grayscale-700 p-2 h-[33px] w-[33px]">
                            <IconTool stroke={1} size={15} />
                        </div>
                    </header>
                    <main>
                        <p className="text-sm text-grayscale-400">Go beyond pre-built integrations.</p>
                    </main>
                    <footer className="mt-4">
                        <Button variant={'link'} size={'auto'} className="group-hover:text-white group-focus:text-white">
                            Learn more <IconChevronRight stroke={1} size={20} />
                        </Button>
                    </footer>
                </a>
            </div>
        </DashboardLayout>
    );
};

import { ChatBubbleIcon, CubeIcon, RocketIcon, RulerSquareIcon } from '@radix-ui/react-icons';

import Button from '../../components/ui/button/Button';
import { useAnalyticsTrack } from '../../utils/analytics';

export const NextBloc: React.FC = () => {
    const analyticsTrack = useAnalyticsTrack();

    const onClickExplore = () => {
        analyticsTrack('web:demo:explore');
        window.open('https://docs.nango.dev/integrations/overview', '_blank');
    };

    const onClickGuides = () => {
        analyticsTrack('web:demo:guide');
        window.open('https://docs.nango.dev/introduction', '_blank');
    };

    const onClickNango = () => {
        analyticsTrack('web:demo:nango');
        window.open('https://docs.nango.dev/introduction', '_blank');
    };

    const onClickJoinCommunity = () => {
        analyticsTrack('web:demo:community');
        window.open('https://nango.dev/slack', '_blank');
    };

    return (
        <div className="mt-2">
            <div className="border-t border-zinc-800 flex pt-6">
                <div className="w-290px h-240px ml-4">
                    <img src="/images/ship.svg" className="" />
                </div>
                <div className="mt-10 ml-10">
                    <h2 className={'text-xl font-semibold leading-7 text-white'}>You&apos;re now ready to ship your first integration!</h2>
                    <h3 className="mt-1 text-sm">Build any integration for any API with Nango.</h3>
                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <Button type="button" variant="primary" onClick={onClickExplore} className="items-center">
                            <CubeIcon />
                            Explore templates
                        </Button>
                        <Button type="button" variant="secondary" onClick={onClickGuides}>
                            <RulerSquareIcon />
                            Explore guides
                        </Button>
                        <Button type="button" variant="secondary" onClick={onClickNango}>
                            <RocketIcon />
                            Learn about Nango
                        </Button>
                        <Button type="button" variant="secondary" onClick={onClickJoinCommunity}>
                            <ChatBubbleIcon />
                            Join the community
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

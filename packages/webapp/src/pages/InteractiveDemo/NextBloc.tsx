import { Steps } from './utils';
import Button from '../../components/ui/button/Button';
import { useAnalyticsTrack } from '../../utils/analytics';

export const NextBloc: React.FC<{ step: Steps }> = ({ step }) => {
    const analyticsTrack = useAnalyticsTrack();

    const onClickExplore = () => {
        analyticsTrack('web:getting_started:explore');
        window.open('https://docs.nango.dev/integrations/overview', '_blank');
    };

    const onClickGuides = () => {
        analyticsTrack('web:getting_started:guide');
        window.open('https://docs.nango.dev/introduction', '_blank');
    };

    const onClickJoinCommunity = () => {
        analyticsTrack('web:getting_started:community');
        window.open('https://nango.dev/slack', '_blank');
    };

    return (
        <div className="pb-8 ml-6">
            <h2 className={`text-xl${step < Steps.Write ? ' text-text-light-gray' : ''} ${step > Steps.Complete ? '' : 'mt-8 '}`}>
                Next: Ship your first integration!
            </h2>
            <h3 className="text-text-light-gray mb-6">Build any integration for any API with Nango.</h3>
            <div className="space-x-3">
                <Button type="button" variant="primary" onClick={onClickExplore}>
                    <img className="h-5" src="/images/explore-icon.svg" alt="" />
                    Explore pre-built APIs
                </Button>
                <Button type="button" variant="primary" onClick={onClickGuides}>
                    <img className="h-5" src="/images/learn-icon.svg" alt="" />
                    Step-by-step guides
                </Button>
                <Button type="button" variant="primary" onClick={onClickJoinCommunity}>
                    <img className="h-5" src="/images/community-icon.svg" alt="" />
                    Join the community
                </Button>
            </div>
        </div>
    );
};

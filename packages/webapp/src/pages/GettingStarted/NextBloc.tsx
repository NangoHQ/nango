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
            <div className={`p-4 rounded-md relative ${step > Steps.Ship ? 'mt-8 border border-green-900 bg-gradient-to-r from-[#0C1E1A] to-[#0E1115]' : ''}`}>
                <div
                    className={`absolute left-[-2.22rem] ${step > Steps.Ship ? 'top-4' : 'top-12'} w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center`}
                >
                    <div className={`w-2 h-2 rounded-full ring-1 ${step > Steps.Ship ? 'ring-[#318463]' : 'ring-white'} bg-transparent`}></div>
                </div>
                <h2 className={`text-xl${step < Steps.Write ? ' text-text-light-gray' : ''} ${step > Steps.Ship ? '' : 'mt-8 '}`}>
                    Next: Ship your first integration!
                </h2>
                {step >= Steps.Ship && (
                    <>
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
                    </>
                )}
            </div>
        </div>
    );
};

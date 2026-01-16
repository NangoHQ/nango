import Conf from 'conf';

const schema = {
    lastIgnoreUpgrade: {
        type: 'number'
    },
    completionCache: {
        type: 'object'
    }
};
export const state = new Conf({ projectName: 'nango', schema });

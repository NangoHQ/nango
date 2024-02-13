// @ts-expect-error this import requires "moduleResolution nodenext"
import Conf from 'conf';

const schema = {
    lastIgnoreUpgrade: {
        type: 'number'
    }
};
export const state = new Conf({ projectName: 'nango', schema });

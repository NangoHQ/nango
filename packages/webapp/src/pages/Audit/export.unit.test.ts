import { describe, expect, it } from 'vitest';

import { exportWindowField } from './export';

describe('exportWindowField', () => {
    it('names both ends of a closed window', () => {
        expect(exportWindowField('2026-08-01T00:00:00.000Z', '2026-08-15T00:00:00.000Z')).toMatchObject({ label: 'Window' });
        expect(exportWindowField('2026-08-01T00:00:00.000Z', '2026-08-15T00:00:00.000Z').value).toContain(' – ');
    });

    it('moves the preposition into the label so the value is only the date', () => {
        expect(exportWindowField('2026-08-01T00:00:00.000Z', undefined)).toMatchObject({ label: 'Since' });
        expect(exportWindowField('2026-08-01T00:00:00.000Z', undefined).value).not.toMatch(/since/i);
    });

    it('names the end when only that is set', () => {
        expect(exportWindowField(undefined, '2026-08-15T00:00:00.000Z')).toMatchObject({ label: 'Until' });
    });

    it('says what an absent window actually means, rather than leaving it blank', () => {
        expect(exportWindowField(undefined, undefined)).toEqual({ label: 'Window', value: 'All time' });
    });

    it('drops the sub-minute precision a range boundary has no use for', () => {
        expect(exportWindowField('2026-08-01T09:07:42.813Z', undefined).value).not.toMatch(/42|813/);
    });

    it('names the offset the boundary is shown in, since the CSV outlives the tab', () => {
        expect(exportWindowField('2026-08-01T00:00:00.000Z', undefined).zone).toMatch(/^UTC[+-]\d\d:\d\d$/);
    });

    it('has no offset to name when there is no boundary', () => {
        expect(exportWindowField(undefined, undefined).zone).toBeUndefined();
    });
});

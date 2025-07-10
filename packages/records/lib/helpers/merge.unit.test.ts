import { describe, expect, it } from 'vitest';

import { deepMergeRecordData } from './merge.js';

describe('deepMergeRecordData', () => {
    it('should shallow merge', () => {
        const oldData = {
            id: '12',
            name: 'John Smith'
        };

        const newData = {
            id: '12',
            name: 'John Doe'
        };

        const merged = deepMergeRecordData(oldData, newData);
        expect(merged).toMatchObject({ id: '12', name: 'John Doe' });
    });

    it('should deep merge', () => {
        const oldData = {
            id: '12',
            identity: {
                name: 'John Smith',
                age: 44
            }
        };

        const newData = {
            id: '12',
            identity: {
                name: 'John Doe'
            }
        };

        const merged = deepMergeRecordData(oldData, newData);
        expect(merged).toMatchObject({ id: '12', identity: { name: 'John Doe', age: 44 } });
    });

    it('should ignore arrays with no merge', () => {
        const oldData = {
            id: '12',
            identity: {
                name: 'John Smith',
                children: [{ name: 'Lucy' }, { name: 'Max' }]
            }
        };

        const newData = {
            id: '12',
            identity: {
                name: 'Joe Doe'
            }
        };

        const merged = deepMergeRecordData(oldData, newData);
        expect(merged).toMatchObject({ id: '12', identity: { name: 'Joe Doe', children: [{ name: 'Lucy' }, { name: 'Max' }] } });
    });

    it('should replace arrays', () => {
        const oldData = {
            id: '12',
            identity: {
                name: 'John Smith',
                children: [{ name: 'Lucy' }, { name: 'Max' }]
            }
        };

        const newData = {
            id: '12',
            identity: {
                children: [{ name: 'Bea' }, { name: 'Lucy' }, { name: 'Max' }]
            }
        };

        const merged = deepMergeRecordData(oldData, newData);
        expect(merged).toMatchObject({ id: '12', identity: { name: 'John Smith', children: [{ name: 'Bea' }, { name: 'Lucy' }, { name: 'Max' }] } });
    });
});

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import * as deployments from './deployments.js';
import { getTestDbClient } from '../db/helpers.test.js';
import { generateImage } from './helpers.js';

describe('Deployments', () => {
    const dbClient = getTestDbClient('deployments');
    const db = dbClient.db;
    beforeEach(async () => {
        await dbClient.migrate();
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    describe('create', () => {
        it('should create a deployment', async () => {
            const image = generateImage();
            const deployment = (await deployments.create(db, image)).unwrap();
            expect(deployment.image).toBe(image);
            expect(deployment.createdAt).toBeInstanceOf(Date);
            expect(deployment.supersededAt).toBe(null);
        });

        it('should supersede any active deployments', async () => {
            const image1 = generateImage();
            const image2 = generateImage();

            const deployment1 = (await deployments.create(db, image1)).unwrap();
            const deployment2 = (await deployments.create(db, image2)).unwrap();

            expect((await deployments.get(db, deployment1.id)).unwrap().supersededAt).not.toBe(null);
            expect((await deployments.get(db, deployment2.id)).unwrap().supersededAt).toBe(null);
        });
    });

    describe('getActive', () => {
        it('should return undefined if no deployments yet', async () => {
            const active = (await deployments.getActive(db)).unwrap();
            expect(active).toBe(undefined);
        });
    });
});

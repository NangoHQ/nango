import { DescribeImagesCommand, ECRClient } from '@aws-sdk/client-ecr';

import { Err, Ok } from '@nangohq/utils';

import { FleetError } from './utils/errors.js';

import type { ImageVerifier } from './image-verifier.js';
import type { Result } from '@nangohq/utils';

export class ECRImageVerifier implements ImageVerifier {
    private ecrClient: ECRClient;

    constructor() {
        this.ecrClient = new ECRClient();
    }

    async verify(image: string): Promise<Result<boolean, FleetError>> {
        //we expect the image to be in the form "qualifier/image-name@sha256:xxx"
        const [imagePart, tag] = image.split('@');
        if (!imagePart || !tag) {
            return Err(new FleetError('fleet_rollout_invalid_image', { context: { image } }));
        }

        const [qualifier, imageName] = imagePart.split('/');
        if (!qualifier || !imageName) {
            return Err(new FleetError('fleet_rollout_invalid_image', { context: { image } }));
        }
        let imageDigest;
        let imageTag;
        if (tag.startsWith('sha256:')) {
            imageDigest = tag;
        } else {
            imageTag = tag;
        }

        try {
            await this.ecrClient.send(
                new DescribeImagesCommand({
                    repositoryName: imagePart,
                    imageIds: [{ imageDigest, imageTag }]
                })
            );
        } catch (err: any) {
            if (err.name === 'ImageNotFoundException') {
                return Err(new FleetError('fleet_rollout_image_not_found', { context: { image } }));
            } else {
                return Err(new FleetError('fleet_rollout_image_verification_failed', { cause: err, context: { image } }));
            }
        }

        return Ok(true);
    }
}

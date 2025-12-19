import { Err, Ok } from '@nangohq/utils';

import { FleetError } from './utils/errors.js';

import type { ImageVerifier } from './image-verifier.js';
import type { Result } from '@nangohq/utils';

export class DockerImageVerifier implements ImageVerifier {
    async verify(image: string): Promise<Result<boolean, FleetError>> {
        const [name, tag] = image.split(':');
        if (!name || !tag) {
            return Err(new FleetError('fleet_rollout_invalid_image', { context: { image } }));
        }
        const res = await fetch(`https://hub.docker.com/v2/repositories/${name}/tags/${tag}`);
        if (!res.ok) {
            return Err(new FleetError('fleet_rollout_image_not_found', { context: { image } }));
        }
        return Ok(true);
    }
}

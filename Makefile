PIZZLY_IMAGE        = toucantoco/pizzly
PIZZLY_VERSION      = v`cat ./package.json | jq -r .version`
QUAYIO_IMAGE       	= $(PIZZLY_IMAGE)
QUAYIO_REGISTRY    	= quay.io

##
## Misc commands
## -----
##

list: ## Generate basic list of all targets
	@grep '^[^\.#[:space:]].*:' Makefile | \
		grep -v "=" | \
		cut -d':' -f1

help: ## Makefile help
	@grep -E '(^[a-zA-Z_-]+:.*?##.*$$)|(^##)' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[32m%-30s\033[0m %s\n", $$1, $$2}' | \
		sed -e 's/\[32m##/[33m/'

get-version:
	@echo ${PIZZLY_VERSION}

set-version:
	@if [ -z "${NEW_VERSION}" ]; then \
		echo "Usage: make set-version NEW_VERSION=X.Y.Z" && \
		exit 1; \
	fi
	@NEW_VERSION=`echo ${NEW_VERSION} | sed -e "s/^v//g"` && \
	jq -r ".version |= \"$${NEW_VERSION}\"" package.json > package.json.temp && \
	mv package.json.temp package.json

##
## Dev management commands
## -----
##

test:
	npm test

docker-test: docker-build-testing
	docker run \
		--name=pizzly \
		--entrypoint /usr/bin/make \
		--rm $(PIZZLY_IMAGE):testing-${BUILD_RANDOM_ID} \
		test

pizzly-docker-run: docker-build
	docker run \
		-p 3000:3000 \
		-it \
		--name=pizzly \
		--env-file=.env \
		--rm $(QUAYIO_REGISTRY)/$(QUAYIO_IMAGE):$(PIZZLY_VERSION)

##
## Docker images commands
## -----
##

docker-build-testing:
	docker build \
		-f Dockerfile-testing \
		-t $(PIZZLY_IMAGE):testing-${BUILD_RANDOM_ID} .

docker-build-prod:
	docker build --no-cache -t $(PIZZLY_IMAGE):$(PIZZLY_VERSION) .

push-to-registry:
	for tag in ${PIZZLY_VERSION} ${PIZZLY_IMAGE_MORE_TAGS}; do \
		docker tag ${PIZZLY_IMAGE}:${PIZZLY_VERSION} ${QUAYIO_REGISTRY}/${QUAYIO_IMAGE}:$${tag} && \
		docker push ${QUAYIO_REGISTRY}/${QUAYIO_IMAGE}:$${tag}; \
	done
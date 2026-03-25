# lambda-sf-compiler — common Docker, LocalStack, and AWS workflows
# Run from anywhere: make -f packages/lambda-sf-compiler/Makefile <target>
# Or: cd packages/lambda-sf-compiler && make <target>

MAKEFILE_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
REPO_ROOT := $(abspath $(MAKEFILE_DIR)/../..)
DOCKERFILE := $(MAKEFILE_DIR)/Dockerfile.lambda

# Image / Lambda names (override as needed)
ECR_REPO ?= nango-sf-compiler
IMAGE_TAG ?= local
FUNCTION_NAME ?= nango-sf-compiler-test
LOCAL_IMAGE := $(ECR_REPO):$(IMAGE_TAG)

# LocalStack ECR registry (use 127.0.0.1:4510 if localhost.localstack.cloud does not resolve)
LOCALSTACK_REGISTRY ?= localhost.localstack.cloud:4510
LOCALSTACK_IMAGE := $(LOCALSTACK_REGISTRY)/$(ECR_REPO):$(IMAGE_TAG)

# AWS deploy (set for aws-* targets)
AWS_REGION ?= us-west-2
AWS_ACCOUNT_ID ?= $(shell aws sts get-caller-identity --query Account --output text 2>/dev/null)
ECR_URI := $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/$(ECR_REPO):$(IMAGE_TAG)
# Required for aws-lambda-create; example: arn:aws:iam::123456789012:role/lambda-execution
ROLE_ARN ?= arn:aws:iam::224861044023:role/nango-sf-compiler-lambda

AWSLAMBDA ?= awslocal
AWS ?= aws

# Dummy credentials scoped to LocalStack targets only.
# aws-* targets use the real credential chain (SSO etc.) and must not have these set.
localstack-ecr-create localstack-ecr-login localstack-push localstack-create-lambda localstack-update localstack-deploy invoke-test: export AWS_ACCESS_KEY_ID = test
localstack-ecr-create localstack-ecr-login localstack-push localstack-create-lambda localstack-update localstack-deploy invoke-test: export AWS_SECRET_ACCESS_KEY = test
localstack-ecr-create localstack-ecr-login localstack-push localstack-create-lambda localstack-update localstack-deploy invoke-test: export AWS_DEFAULT_REGION = us-east-1

.DEFAULT_GOAL := help

.PHONY: help
help:
	@echo "lambda-sf-compiler — common commands (see README.md for details)"
	@echo ""
	@echo "Local TypeScript:"
	@echo "  make npm-build          Typecheck/build package via workspace (from repo root)"
	@echo ""
	@echo "Docker (context: repo root):"
	@echo "  make docker-build       Build $(LOCAL_IMAGE)"
	@echo ""
	@echo "LocalStack:"
	@echo "  make localstack-ecr-create     Create ECR repo (idempotent-ish)"
	@echo "  make localstack-push           Tag + push image to LocalStack ECR"
	@echo "  make localstack-create-lambda  One-time: create Lambda from pushed image"
	@echo "  make localstack-update         Rebuild, push, update-function-code"
	@echo "  make localstack-deploy         ecr-create + docker-build + push + update-function-code"
	@echo "       (first time: run localstack-create-lambda once after first push)"
	@echo "  make invoke-test               awslocal lambda invoke with sample action payload"
	@echo ""
	@echo "AWS (production):"
	@echo "  make aws-docker-build   Build tagged image for ECR"
	@echo "  make aws-ecr-ensure     Create ECR repo if missing"
	@echo "  make aws-ecr-login      docker login to ECR"
	@echo "  make aws-push           Login, tag, push to ECR"
	@echo "  make aws-grant-server-invoke  Add inline IAM policy so nango-server can invoke this Lambda (STAGE=development)"
	@echo "  make aws-revoke-server-invoke Remove that inline policy"
	@echo "  make aws-deploy         aws-push + aws-lambda-update (full redeploy)"
	@echo "  make aws-lambda-update  update-function-code with current IMAGE_TAG"
	@echo "  make aws-smoke          Invoke Lambda (empty code → validation error = OK)"
	@echo "  make aws-smoke-ok       Compile smoke/okta-users.ts — expects success: true"
	@echo "  make aws-smoke-error    Send gibberish — expects success: false, step: compilation"
	@echo ""
	@echo "Variables: ECR_REPO IMAGE_TAG FUNCTION_NAME LOCALSTACK_REGISTRY AWS_REGION ROLE_ARN AWSLAMBDA"

# --- Local TypeScript (no Docker) ---

.PHONY: npm-build
npm-build:
	cd $(REPO_ROOT) && npm run ts-build -w packages/lambda-sf-compiler

# --- Docker ---

.PHONY: docker-build
docker-build:
	docker build -f $(DOCKERFILE) -t $(LOCAL_IMAGE) $(REPO_ROOT)

.PHONY: aws-docker-build
aws-docker-build:
	docker build \
		--platform linux/arm64 \
		--provenance=false \
		-f $(DOCKERFILE) \
		-t $(ECR_REPO):$(IMAGE_TAG) \
		$(REPO_ROOT)

# --- LocalStack ---

.PHONY: localstack-ecr-create
localstack-ecr-create:
	-$(AWSLAMBDA) ecr create-repository --repository-name $(ECR_REPO)

.PHONY: localstack-ecr-login
localstack-ecr-login:
	$(AWSLAMBDA) ecr get-login-password | \
		docker login --username AWS --password-stdin $(LOCALSTACK_REGISTRY)

.PHONY: localstack-push
localstack-push: docker-build localstack-ecr-login
	docker tag $(LOCAL_IMAGE) $(LOCALSTACK_IMAGE)
	docker push $(LOCALSTACK_IMAGE)

.PHONY: localstack-create-lambda
localstack-create-lambda:
	$(AWSLAMBDA) lambda create-function \
		--function-name $(FUNCTION_NAME) \
		--package-type Image \
		--code ImageUri=$(LOCALSTACK_IMAGE) \
		--role arn:aws:iam::000000000000:role/lambda-role \
		--timeout 120 \
		--memory-size 1024

.PHONY: localstack-update
localstack-update: docker-build
	docker tag $(LOCAL_IMAGE) $(LOCALSTACK_IMAGE)
	docker push $(LOCALSTACK_IMAGE)
	$(AWSLAMBDA) lambda update-function-code \
		--function-name $(FUNCTION_NAME) \
		--image-uri $(LOCALSTACK_IMAGE)

# Best-effort: ensure repo exists, publish image, update code (create Lambda manually once via localstack-create-lambda)
.PHONY: localstack-deploy
localstack-deploy: localstack-ecr-create localstack-push
	-$(AWSLAMBDA) lambda update-function-code \
		--function-name $(FUNCTION_NAME) \
		--image-uri $(LOCALSTACK_IMAGE)

.PHONY: invoke-test
invoke-test:
	$(AWSLAMBDA) lambda invoke \
		--function-name $(FUNCTION_NAME) \
		--payload '{"integration_id":"my-integration","function_name":"my-action","function_type":"action","code":"import Nango from '\''nango'\''; export default createAction({ input: z.object({}), output: z.object({ id: z.string() }), async run(nango) { return { id: '\''test'\'' }; } });"}' \
		--cli-binary-format raw-in-base64-out \
		response.json && cat response.json && echo

# --- AWS ---

.PHONY: aws-ecr-ensure
aws-ecr-ensure:
	@$(AWS) ecr describe-repositories --repository-names $(ECR_REPO) --region $(AWS_REGION) >/dev/null 2>&1 || \
	$(AWS) ecr create-repository \
		--repository-name $(ECR_REPO) \
		--image-scanning-configuration scanOnPush=true \
		--region $(AWS_REGION)

.PHONY: aws-ecr-login
aws-ecr-login:
	@test -n "$(AWS_ACCOUNT_ID)" || (echo "Set AWS_ACCOUNT_ID or configure aws cli" && exit 1)
	$(AWS) ecr get-login-password --region $(AWS_REGION) | \
		docker login --username AWS --password-stdin $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com

.PHONY: aws-push
aws-push: aws-docker-build aws-ecr-ensure aws-ecr-login
	docker tag $(ECR_REPO):$(IMAGE_TAG) $(ECR_URI)
	docker push $(ECR_URI)

.PHONY: aws-deploy
aws-deploy: aws-push aws-lambda-update

.PHONY: aws-lambda-create
aws-lambda-create:
	@test -n "$(ROLE_ARN)" || (echo "Set ROLE_ARN=arn:aws:iam::<account>:role/<lambda-execution-role>" && exit 1)
	$(AWS) lambda create-function \
		--function-name $(FUNCTION_NAME) \
		--package-type Image \
		--code ImageUri=$(ECR_URI) \
		--role $(ROLE_ARN) \
		--architectures arm64 \
		--timeout 120 \
		--memory-size 1024 \
		--region $(AWS_REGION)

.PHONY: aws-lambda-update
aws-lambda-update:
	$(AWS) lambda update-function-code \
		--function-name $(FUNCTION_NAME) \
		--image-uri $(ECR_URI) \
		--region $(AWS_REGION)

# Grants the nango-server pod identity role permission to invoke this Lambda.
# Run once per environment when testing without touching the infra repo.
# Usage: make aws-grant-server-invoke STAGE=development
STAGE ?= development
SERVER_ROLE_NAME ?= eks-podidentity-nango-server-$(STAGE)

.PHONY: aws-grant-server-invoke
aws-grant-server-invoke:
	$(AWS) iam put-role-policy \
		--role-name $(SERVER_ROLE_NAME) \
		--policy-name sf-compiler-invoke-$(STAGE) \
		--policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["lambda:InvokeFunction"],"Resource":"arn:aws:lambda:$(AWS_REGION):$(AWS_ACCOUNT_ID):function:$(FUNCTION_NAME)"}]}'
	@echo "Granted lambda:InvokeFunction on $(FUNCTION_NAME) to $(SERVER_ROLE_NAME)"

.PHONY: aws-revoke-server-invoke
aws-revoke-server-invoke:
	$(AWS) iam delete-role-policy \
		--role-name $(SERVER_ROLE_NAME) \
		--policy-name sf-compiler-invoke-$(STAGE)
	@echo "Revoked sf-compiler-invoke-$(STAGE) from $(SERVER_ROLE_NAME)"

SMOKE_DIR := $(MAKEFILE_DIR)/smoke

.PHONY: aws-smoke
aws-smoke:
	$(AWS) lambda invoke \
		--function-name $(FUNCTION_NAME) \
		--payload '{"integration_id":"smoke-test","function_name":"hello","function_type":"action","code":""}' \
		--cli-binary-format raw-in-base64-out \
		--region $(AWS_REGION) \
		response.json && cat response.json && echo

# Compile a real sync — expects { success: true, bundledJs, flow } back
.PHONY: aws-smoke-ok
aws-smoke-ok:
	jq -Rs '{"integration_id":"okta","function_name":"okta-users","function_type":"sync","code":.}' \
		$(SMOKE_DIR)/okta-users.ts > /tmp/nango-sf-smoke-ok.json
	$(AWS) lambda invoke \
		--function-name $(FUNCTION_NAME) \
		--payload file:///tmp/nango-sf-smoke-ok.json \
		--cli-binary-format raw-in-base64-out \
		--region $(AWS_REGION) \
		response.json && cat response.json && echo

# Send gibberish — expects { success: false, step: "compilation" } back
.PHONY: aws-smoke-error
aws-smoke-error:
	$(AWS) lambda invoke \
		--function-name $(FUNCTION_NAME) \
		--payload '{"integration_id":"smoke-error","function_name":"broken","function_type":"action","code":"this is not valid typescript!!!"}' \
		--cli-binary-format raw-in-base64-out \
		--region $(AWS_REGION) \
		response.json && cat response.json && echo

		

# lambda-sf-compiler

Lambda function that compiles and bundles Nango SF functions (syncs/actions) from TypeScript source code.

**Invoked by:** `POST /sf-deploy` on the server
**Returns:** `{ bundledJs, flow }` — the server handles `deploy()` and file persistence

---

## How it works

1. Receives `{ integration_id, function_name, function_type, code }` as the Lambda event
2. Creates an isolated temp workspace with the nango template project
3. Type-checks the TypeScript source with `tsc`
4. Bundles it with `esbuild` (CJS, npm packages marked external)
5. Loads the bundle in a VM sandbox to extract the function definition
6. Returns `{ success: true, bundledJs, flow }` or `{ success: false, step, message }`

---

## Running locally with LocalStack

### Prerequisites

- [LocalStack](https://docs.localstack.cloud/getting-started/installation/) running (`localstack start`)
- [AWS CLI](https://aws.amazon.com/cli/) installed
- [awslocal](https://github.com/localstack/awscli-local) wrapper: `pip install awscli-local`
- Docker

### Credentials note

`awslocal` is a thin wrapper that adds `--endpoint-url http://localhost:4566` to every `aws` command. If your machine uses AWS SSO or named profiles, the real AWS CLI will still try to resolve credentials before sending the request — and fail if your session is expired.

Fix: export dummy credentials in your shell before running any `awslocal` commands. LocalStack accepts any value.

```bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
```

Or prefix individual commands:

```bash
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1 awslocal ecr create-repository ...
```

Alternatively, add a `localstack` profile to `~/.aws/config` and pass `--profile localstack` (or set `AWS_PROFILE=localstack`) so it never touches your real credentials:

```ini
# ~/.aws/config
[profile localstack]
region = us-east-1
output = json

# ~/.aws/credentials
[localstack]
aws_access_key_id = test
aws_secret_access_key = test
```

```bash
export AWS_PROFILE=localstack
```

### 1. Build the image

From the repo root:

```bash
docker build \
  -f packages/lambda-sf-compiler/Dockerfile.lambda \
  -t nango-sf-compiler:local \
  .
```

### 2. Push the image to LocalStack's ECR

```bash
# Create a local ECR repo
awslocal ecr create-repository --repository-name nango-sf-compiler

# Authenticate Docker to LocalStack's ECR
awslocal ecr get-login-password | \
  docker login --username AWS --password-stdin \
  localhost.localstack.cloud:4510

# Tag and push
docker tag nango-sf-compiler:local localhost.localstack.cloud:4510/nango-sf-compiler:local
docker push localhost.localstack.cloud:4510/nango-sf-compiler:local
```

> If `localhost.localstack.cloud` doesn't resolve on your machine, use `127.0.0.1:4510` instead.

### 3. Create the Lambda function

```bash
awslocal lambda create-function \
  --function-name nango-sf-compiler \
  --package-type Image \
  --code ImageUri=localhost.localstack.cloud:4510/nango-sf-compiler:local \
  --role arn:aws:iam::000000000000:role/lambda-role \
  --timeout 120 \
  --memory-size 1024
```

### 4. Point the server at LocalStack

Add to your `.env` (or the server's environment):

```bash
SF_COMPILER_LAMBDA_NAME=nango-sf-compiler
AWS_ENDPOINT_URL=http://localhost:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
```

The `@aws-sdk/client-lambda` picks up `AWS_ENDPOINT_URL` automatically (SDK v3).

### 5. Invoke manually to test

```bash
awslocal lambda invoke \
  --function-name nango-sf-compiler \
  --payload '{"integration_id":"smoke-test","function_name":"hello","function_type":"action","code":""}' \
  --cli-binary-format raw-in-base64-out \
  response.json && cat response.json
# Expected: { "success": false, "step": "validation", "message": "..." }
# Empty code fails validation — confirms the function is reachable
```

### Updating the function after a code change

```bash
docker build -f packages/lambda-sf-compiler/Dockerfile.lambda -t nango-sf-compiler:local . \
  && docker tag nango-sf-compiler:local localhost.localstack.cloud:4510/nango-sf-compiler:local \
  && docker push localhost.localstack.cloud:4510/nango-sf-compiler:local \
  && awslocal lambda update-function-code \
       --function-name nango-sf-compiler \
       --image-uri localhost.localstack.cloud:4510/nango-sf-compiler:local
```

---

## Deploying to AWS manually

### Prerequisites

- AWS CLI configured (`aws configure`) with permissions for ECR and Lambda
- An existing Lambda execution role with at minimum `AWSLambdaBasicExecutionRole`

### 1. Set variables

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=us-east-1   # change as needed
ECR_REPO=nango-sf-compiler
FUNCTION_NAME=nango-sf-compiler
IMAGE_TAG=latest        # or a git SHA for traceability
ROLE_ARN=arn:aws:iam::${AWS_ACCOUNT_ID}:role/<your-lambda-execution-role>
```

### 2. Build the image

```bash
docker build \
  -f packages/lambda-sf-compiler/Dockerfile.lambda \
  -t ${ECR_REPO}:${IMAGE_TAG} \
  .
```

### 3. Push to ECR

```bash
# Create the repo if it doesn't exist yet
aws ecr describe-repositories --repository-names ${ECR_REPO} 2>/dev/null || \
  aws ecr create-repository \
    --repository-name ${ECR_REPO} \
    --image-scanning-configuration scanOnPush=true

# Authenticate Docker to ECR
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Tag and push
docker tag ${ECR_REPO}:${IMAGE_TAG} \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}

docker push \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}
```

### 4. Create or update the Lambda

**First deploy:**

```bash
aws lambda create-function \
  --function-name ${FUNCTION_NAME} \
  --package-type Image \
  --code ImageUri=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG} \
  --role ${ROLE_ARN} \
  --architectures arm64 \
  --timeout 120 \
  --memory-size 1024 \
  --region ${AWS_REGION}
```

**Subsequent deploys (update image):**

```bash
aws lambda update-function-code \
  --function-name ${FUNCTION_NAME} \
  --image-uri ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG} \
  --region ${AWS_REGION}
```

### 5. Configure the server

Set on the server that runs `POST /sf-deploy`:

```bash
SF_COMPILER_LAMBDA_NAME=nango-sf-compiler   # or the full ARN
AWS_REGION=us-east-1
```

The server's IAM role needs `lambda:InvokeFunction` on the function ARN.

### 6. Smoke test

```bash
aws lambda invoke \
  --function-name ${FUNCTION_NAME} \
  --payload '{"integration_id":"smoke-test","function_name":"hello","function_type":"action","code":""}' \
  --cli-binary-format raw-in-base64-out \
  --region ${AWS_REGION} \
  response.json && cat response.json
# Expected: { "success": false, "step": "validation", "message": "..." }
# (empty code fails validation — that confirms the function is reachable)
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NANGO_SF_TEMPLATE_PROJECT_PATH` | pre-baked at `/opt/nango-sf-template` | Path to the nango template project. Pre-baked in the Docker image — do not override unless you know what you're doing. |
| `NANGO_SF_WORKDIR` | `/tmp/nango-sf` | Root dir for per-invocation workspaces. Must be writable (`/tmp` in Lambda). |

The server also needs:

| Variable | Default | Description |
|---|---|---|
| `SF_COMPILER_LAMBDA_NAME` | `nango-sf-compiler` | Lambda function name or ARN to invoke for compilation. |

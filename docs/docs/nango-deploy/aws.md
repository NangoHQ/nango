# Deploy Nango to AWS (EC2)

:::info
Your should read the [self-hosting instructions](./oss-instructions.md) before deploying to production.
:::

Deploy Nango on AWS in less than 5 minutes.

## Create a VM {#create-vm}

Go to the [EC2 service](https://console.aws.amazon.com/ec2/v2/home) and click _Launch Instance_. Create an instance with default settings except:

-   `t2.medium` for testing, `t2.large` for production
-   Enable _Allow HTTPS traffic from the internet_ and _Allow HTTP traffic from the internet_

## Install Docker

Go to your EC2 instance page and click _Connect,_ then _Connect_ again on the next page to access your instance’s console via SSH.

Install Docker & Docker Compose with the following commands:

```bash
sudo yum update -y && sudo yum install -y docker && sudo service docker start && sudo usermod -a -G docker $USER
curl -s https://api.github.com/repos/docker/compose/releases/latest | grep browser_download_url  | grep docker-compose-linux-x86_64 | cut -d '"' -f 4 | wget -qi -
chmod +x docker-compose-linux-x86_64 && sudo mv docker-compose-linux-x86_64 /usr/local/bin/docker-compose
docker-compose --version
```

:::info
Refresh the VM console page to activate the new configuration.
:::

## Run Nango

Still in your VM’s console, install Nango by running:

```bash
mkdir nango && cd nango
wget https://raw.githubusercontent.com/NangoHQ/nango/master/docker/aws/docker-compose.yaml && wget https://raw.githubusercontent.com/NangoHQ/nango/master/.env
docker-compose up -d # Nango is now running!
```

## Update Nango

In your VM’s console, run:

```bash
docker-compose stop
docker-compose rm -f
docker-compose pull
docker-compose up -d
```

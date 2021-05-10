job "pizzly" {
  type = "system"
  datacenters = ["Miami1", "NorthCarolina1","Chicago2"]
  group "main" {
    count = 1
    network {
      port "pizzly" { to = 80 }
    }
    task "server" {
      driver = "docker"
      env {
        DASHBOARD_USERNAME="a"
        DASHBOARD_PASSWORD="a"
        SECRET_KEY="a"
        PUBLISHABLE_KEY="a"
        #
        # 3. Allow or disable requests to the proxy service using a publishable key.
        #    FALSE by default to allow request with a publishable key or a secret key.
        #    Set to TRUE to only allow access having a valid secret key.
        #
        PROXY_USES_SECRET_KEY_ONLY=FALSE
        #
        # 4. Replace the default cookie secret to an unguessable string
        #    Learn more: https://github.com/expressjs/cookie-session
        #
        COOKIE_SECRET="a"
        NODE_ENV="production"
        DB_USER="pizzly"
        DB_PASSWORD="a"
        DB_HOST="38.83.135.15"
        DB_PORT=""
        DB_DATABASE="pizzly"
      }
      config {
        image = "neogenai/pizzly:latest"
        auth {
          username = "mattriddell"
          password = ""
        }
        ports = ["pizzly"]
      }
    }
    service {
      name = "pizzly"
      port = "pizzly"
      tags = [
        "traefik.enable=true",
        "traefik.http.routers.pizzly-https.tls=true",
        "traefik.http.routers.pizzly-https.rule=Host(`pizzly.neogen.ai`)",
        "traefik.http.routers.pizzly-https.tls.certresolver=myresolver",
        "traefik.http.routers.pizzly-https.tls.domains[0].main=pizzly.neogen.ai",
        "traefik.http.routers.pizzly-http.rule=Host(`pizzly.neogen.ai`)",
      ]
      check {
        port     = "pizzly"
        type     = "http"
        path     = "/"
        interval = "2s"
        timeout  = "2s"
      }
    }
  }
}
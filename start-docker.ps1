param(
  [string]$FrontendUrl = "https://acme.stanciulescu.xyz",
  [string]$ApiBase = "https://api.stanciulescu.xyz/api",
  [string]$JwtSecret = "dev-secret",
  [string]$DbHost = "host.docker.internal",
  [int]$DbPort = 5433,
  [string]$DbUser = "base_user",
  [string]$DbPassword = "1234",
  [string]$DefaultTenantSlug = "dev",
  [string]$DefaultTenantDb = "devdb",
  [string]$ServerImage = "crm-server-test",
  [string]$ClientImage = "crm-client-test",
  [string]$ServerContainer = "crm-server",
  [string]$ClientContainer = "crm-client"
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Message,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
  & $Command
}

function Remove-ContainerIfExists {
  param([string]$Name)

  $containerId = docker ps -aq --filter "name=^/$Name$"
  if ($containerId) {
    docker rm -f $Name | Out-Host
  } else {
    Write-Host "Containerul '$Name' nu exista, sar peste remove."
  }
}

$DatabaseUrl = "postgres://$DbUser`:$DbPassword@$DbHost`:$DbPort/$DefaultTenantDb"

Invoke-Step "Build backend image '$ServerImage'" {
  docker build -t $ServerImage ./server
}

Invoke-Step "Build frontend image '$ClientImage' cu API '$ApiBase'" {
  docker build --build-arg "NUXT_PUBLIC_API_BASE=$ApiBase" -t $ClientImage ./client
}

Invoke-Step "Remove containere vechi" {
  Remove-ContainerIfExists $ServerContainer
  Remove-ContainerIfExists $ClientContainer
}

Invoke-Step "Pornesc backend '$ServerContainer'" {
  docker run -d --name $ServerContainer -p 4000:4000 `
    -e "JWT_SECRET=$JwtSecret" `
    -e "DATABASE_URL=$DatabaseUrl" `
    -e "DB_HOST=$DbHost" `
    -e "DB_PORT=$DbPort" `
    -e "DB_USER=$DbUser" `
    -e "DB_PASSWORD=$DbPassword" `
    -e "DEFAULT_TENANT_SLUG=$DefaultTenantSlug" `
    -e "DEFAULT_TENANT_DB=$DefaultTenantDb" `
    -e "FRONTEND_URL=$FrontendUrl" `
    $ServerImage | Out-Host
}

Invoke-Step "Pornesc frontend '$ClientContainer'" {
  docker run -d --name $ClientContainer -p 3000:3000 `
    -e "NUXT_PUBLIC_API_BASE=$ApiBase" `
    $ClientImage | Out-Host
}

Write-Host ""
Write-Host "Gata." -ForegroundColor Green
Write-Host "Frontend:  $FrontendUrl"
Write-Host "API base:  $ApiBase"
Write-Host "Backend local: http://localhost:4000"
Write-Host "Frontend local: http://localhost:3000"
Write-Host ""
Write-Host "Debug logs:"
Write-Host "  docker logs -f $ServerContainer"
Write-Host "  docker logs -f $ClientContainer"

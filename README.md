# 🏥 Lacrei Saúde – DevOps Challenge

> Pipeline de deploy seguro, escalável e eficiente para a plataforma Lacrei Saúde.  
> Aplicação Node.js conteinerizada com Docker, CI/CD via GitHub Actions e deploy em ambientes de staging e produção na AWS (ECS Fargate + ALB + CloudWatch).

---

## 📋 Índice

1. [Visão Geral](#-visão-geral)
2. [Tecnologias Utilizadas](#-tecnologias-utilizadas)
3. [Estrutura do Repositório](#-estrutura-do-repositório)
4. [Como Rodar Localmente](#-como-rodar-localmente)
5. [Fluxo CI/CD](#-fluxo-cicd)
6. [Setup dos Ambientes AWS](#-setup-dos-ambientes-aws)
7. [Segurança](#-segurança)
8. [Observabilidade](#-observabilidade)
9. [Rollback](#-rollback)
10. [Integração Asaas (Bônus)](#-integração-asaas-bônus)
11. [Checklist de Segurança](#-checklist-de-segurança)
12. [Erros Encontrados e Decisões Técnicas](#-erros-encontrados-e-decisões-técnicas)

---

## 🎯 Visão Geral

Este repositório implementa o desafio técnico de DevOps da Lacrei Saúde, entregando:

| Item | Status |
|---|---|
| API Node.js (`/status`, `/health`) | ✅ |
| Containerização com Docker (multi-stage, non-root) | ✅ |
| Pipeline CI completo (lint + testes + build + scan) | ✅ |
| Pipeline CD (staging automático + produção com aprovação) | ✅ |
| Rollback via GitHub Actions (`workflow_dispatch`) | ✅ |
| HTTPS/TLS via ALB + ACM | ✅ |
| Gerenciamento de secrets (GitHub Secrets + AWS Secrets Manager) | ✅ |
| Logs via CloudWatch | ✅ |
| Alertas (CloudWatch Alarms + SNS + Slack) | ✅ |
| Proposta de integração Asaas | ✅ |

---

## 🛠️ Tecnologias Utilizadas

| Categoria | Tecnologia |
|---|---|
| Runtime | Node.js 20 (LTS) |
| Framework | Express 4 |
| Containerização | Docker (multi-stage), Docker Compose |
| CI/CD | GitHub Actions |
| Registro de imagens | Amazon ECR |
| Orquestração | Amazon ECS Fargate |
| Load Balancer | Application Load Balancer (ALB) |
| TLS | AWS Certificate Manager (ACM) |
| Logs | Amazon CloudWatch Logs |
| Alertas | CloudWatch Alarms + SNS + Slack |
| Segurança (scan) | Trivy |
| Testes | Jest + Supertest |
| Linting | ESLint |

---

## 📁 Estrutura do Repositório

```
lacrei-devops/
├── src/
│   ├── app.js              # Aplicação Express (rotas, middlewares)
│   ├── server.js           # Entry point (graceful shutdown)
│   └── app.test.js         # Testes Jest + Supertest
├── .github/
│   └── workflows/
│       ├── ci.yml          # CI: lint → test → build → scan
│       ├── cd.yml          # CD: build → staging → smoke test → prod
│       └── rollback.yml    # Rollback manual via workflow_dispatch
├── infra/
│   ├── iam/
│   │   └── github-actions-policy.json  # Política IAM (menor privilégio)
│   └── setup.md            # Guia de provisionamento AWS (CLI)
├── docs/
│   ├── monitoring.md       # Observabilidade: logs, alarmes, dashboards
│   └── asaas-integration.md # Proposta de integração Asaas
├── Dockerfile              # Multi-stage build
├── .dockerignore
├── docker-compose.yml      # Desenvolvimento local
├── .env.example            # Template de variáveis de ambiente
├── package.json
├── .eslintrc.json
├── CHANGELOG.md
└── README.md               # Este arquivo
```

---

## 💻 Como Rodar Localmente

### Pré-requisitos
- Node.js 20+
- Docker & Docker Compose

### Com Node.js

```bash
# Clonar o repositório
git clone https://github.com/seu-usuario/lacrei-devops.git
cd lacrei-devops

# Instalar dependências
npm install

# Copiar variáveis de ambiente
cp .env.example .env

# Iniciar o servidor
npm start

# Em modo desenvolvimento (com nodemon)
npm run dev

# Executar testes
npm test

# Executar lint
npm run lint
```

### Com Docker Compose

```bash
# Subir o container de desenvolvimento
docker compose up --build

# Verificar os endpoints
curl http://localhost:3000/status
curl http://localhost:3000/health
```

### Endpoints disponíveis

| Rota | Método | Descrição |
|---|---|---|
| `GET /` | GET | Informações do projeto |
| `GET /status` | GET | Status da aplicação (env, versão, timestamp) |
| `GET /health` | GET | Health check para o ALB/ECS |

**Exemplo de resposta do `/status`:**
```json
{
  "status": "ok",
  "env": "staging",
  "version": "1.2.0",
  "timestamp": "2024-12-28T18:30:00.000Z"
}
```

---

## 🔄 Fluxo CI/CD

### Diagrama do Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PULL REQUEST → develop / main                   │
│                                                                          │
│  ┌─────────┐   ┌─────────┐   ┌───────────────┐   ┌──────────────────┐ │
│  │ 🔍 Lint  │──>│ 🧪 Test  │──>│ 🐳 Docker Build│──>│ 🔐 Trivy Scan    │ │
│  │ ESLint  │   │ Jest+cov │   │ (sem push)    │   │ CRITICAL/HIGH    │ │
│  └─────────┘   └─────────┘   └───────────────┘   └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │ Aprovado
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           PUSH → main                                   │
│                                                                          │
│  ┌───────────────────┐   ┌──────────────────┐   ┌──────────────────┐  │
│  │ 🏗️ Build & Push ECR│──>│ 🚀 Deploy Staging │──>│ 💨 Smoke Test    │  │
│  │ tags: main+sha    │   │ ECS Fargate      │   │ /health /status  │  │
│  └───────────────────┘   └──────────────────┘   └────────┬─────────┘  │
│                                                           │ ✅ OK        │
└───────────────────────────────────────────────────────────┼─────────────┘
                                                            │
┌───────────────────────────────────────────────────────────▼─────────────┐
│                         TAG → v*.*.* (push)                             │
│                                                                          │
│  ┌─────────────────────────────────────────┐   ┌──────────────────┐    │
│  │ ⏳ Aguarda aprovação manual (Environment │──>│ 🏁 Deploy Prod    │    │
│  │    "production" com reviewer obrigatório)│   │ ECS Fargate      │    │
│  └─────────────────────────────────────────┘   └────────┬─────────┘    │
│                                                          │               │
│                                                 ┌────────▼─────────┐    │
│                                                 │ 📢 Slack Notify   │    │
│                                                 └──────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Gatilhos do Pipeline

| Evento | Pipeline disparado |
|---|---|
| PR aberto para `main` ou `develop` | CI (lint + test + build + scan) |
| Push em `main` | CD → staging + smoke test |
| Push de tag `v*.*.*` | CD → produção (aprovação manual) |
| `workflow_dispatch` (rollback.yml) | Rollback em staging ou produção |

### Configuração de Secrets no GitHub

Vá em **Settings → Secrets and variables → Actions** e adicione:

| Secret | Descrição |
|---|---|
| `AWS_ACCESS_KEY_ID` | Access Key do IAM User de CI/CD |
| `AWS_SECRET_ACCESS_KEY` | Secret Key do IAM User de CI/CD |
| `ECR_REGISTRY` | URI do ECR (ex: `123456789012.dkr.ecr.us-east-1.amazonaws.com`) |
| `STAGING_URL` | URL HTTPS do ambiente de staging |
| `PRODUCTION_URL` | URL HTTPS do ambiente de produção |
| `SLACK_WEBHOOK_URL` | URL do Incoming Webhook do Slack (opcional) |

---

## ☁️ Setup dos Ambientes AWS

> **Guia completo com todos os comandos AWS CLI**: [`infra/setup.md`](infra/setup.md)

### Resumo da Infraestrutura

```
Internet
   │
   ▼
┌──────────────────────────────────────────────┐
│          Application Load Balancer           │
│   HTTPS :443 (ACM cert) → HTTP :3000        │
│   HTTP  :80  → redirect para HTTPS          │
└──────────────────┬───────────────────────────┘
                   │
          ┌────────┴─────────┐
          ▼                  ▼
  ┌──────────────┐  ┌──────────────┐
  │  ECS Fargate │  │  ECS Fargate │
  │  (Staging)   │  │  (Produção)  │
  │  1 task      │  │  2 tasks     │
  │  0.25 vCPU   │  │  0.5 vCPU   │
  │  0.5 GB RAM  │  │  1 GB RAM    │
  └──────┬───────┘  └──────┬───────┘
         │                  │
         ▼                  ▼
  ┌─────────────────────────────┐
  │     Amazon CloudWatch       │
  │  /ecs/lacrei-staging (30d)  │
  │  /ecs/lacrei-prod    (90d)  │
  └─────────────────────────────┘
```

### Recursos AWS Criados

| Recurso | Staging | Produção |
|---|---|---|
| ECS Cluster | `lacrei-staging` | `lacrei-prod` |
| ECS Service | `lacrei-service-staging` | `lacrei-service-prod` |
| ECR Repository | `lacrei-api` (tag: `main`) | `lacrei-api` (tag: `v*.*.*`) |
| ALB | `lacrei-alb-staging` | `lacrei-alb-prod` |
| CloudWatch Log Group | `/ecs/lacrei-staging` | `/ecs/lacrei-prod` |
| Task Definition | `lacrei-task-staging` | `lacrei-task-prod` |

---

## 🔐 Segurança

### Princípio do Menor Privilégio (IAM)

O IAM User utilizado pelo GitHub Actions possui apenas as permissões estritamente necessárias:
- `ecr:*` apenas para o repositório `lacrei-api`
- `ecs:UpdateService`, `ecs:RegisterTaskDefinition` apenas para os clusters e serviços específicos
- `iam:PassRole` restrito ao serviço `ecs-tasks.amazonaws.com`

Política completa: [`infra/iam/github-actions-policy.json`](infra/iam/github-actions-policy.json)

### Gerenciamento de Secrets

| Local | Dados armazenados |
|---|---|
| **GitHub Secrets** | Credenciais AWS, URLs dos ambientes, Slack webhook |
| **AWS Secrets Manager** | Variáveis sensíveis da aplicação (ex: chaves de API Asaas) |

> Secrets nunca são logados ou expostos em outputs do GitHub Actions.

### HTTPS/TLS

- ALB configurado com listener HTTPS na porta 443
- Certificado emitido via **AWS Certificate Manager (ACM)** — gratuito
- Redirecionamento automático HTTP → HTTPS no ALB
- TLS 1.2+ enforçado

### Segurança da Aplicação

- **Helmet.js**: headers HTTP de segurança (`X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, etc.)
- **CORS**: origins restritas por ambiente via variável `ALLOWED_ORIGINS`
- **Usuário não-root** no container Docker
- **Trivy**: scan de vulnerabilidades na imagem a cada build (bloqueia CRITICAL/HIGH)

### Scan de Vulnerabilidades

O Trivy é executado em dois momentos:
1. **No CI** (PRs): scan na imagem construída localmente
2. **No CD** (após push para ECR): scan na imagem publicada

---

## 📊 Observabilidade

> Documentação detalhada: [`docs/monitoring.md`](docs/monitoring.md)

### Logs

- **Aplicação**: enviados para **CloudWatch Logs** via driver `awslogs` do ECS
  - Staging: `/ecs/lacrei-staging` (retenção: 30 dias)
  - Produção: `/ecs/lacrei-prod` (retenção: 90 dias)
- **Pipeline**: logado automaticamente pelo GitHub Actions

### Métricas e Alarmes

| Alarme | Threshold | Ação |
|---|---|---|
| HTTP 5xx errors | ≥ 5 em 2 min | SNS → Email + Slack |
| CPU utilization | ≥ 80% em 5 min | SNS → Email |
| Unhealthy hosts | ≥ 1 | SNS → Email + Slack |

### Acesso aos Logs via CLI

```bash
# Seguir logs em tempo real (staging)
aws logs tail /ecs/lacrei-staging --follow

# Filtrar erros na última hora (produção)
aws logs filter-log-events \
  --log-group-name /ecs/lacrei-prod \
  --filter-pattern '"ERROR"' \
  --start-time $(date -d '1 hour ago' +%s000)
```

---

## 🔄 Rollback

### Estratégia Implementada: Rollback via GitHub Actions

O workflow [`rollback.yml`](.github/workflows/rollback.yml) permite restaurar uma versão anterior de forma **segura e auditável**.

**Como executar:**

1. Acesse **GitHub → Actions → Rollback – Restore Previous ECS Task Definition**
2. Clique em **Run workflow**
3. Preencha:
   - **environment**: `staging` ou `production`
   - **image_tag**: tag da imagem ECR a restaurar (ex: `v1.2.3` ou `sha-abc1234`)
   - **confirm**: digite `CONFIRMAR`
4. O workflow irá:
   - Atualizar a Task Definition do ECS com a imagem anterior
   - Forçar novo deploy do ECS Service
   - Aguardar estabilidade do serviço
   - Verificar o `/health` do ambiente
   - Notificar o Slack

### Identificar a imagem estável anterior

```bash
# Listar imagens no ECR com timestamps
aws ecr describe-images \
  --repository-name lacrei-api \
  --query 'sort_by(imageDetails, &imagePushedAt)[*].[imagePushedAt,imageTags[0]]' \
  --output table
```

### Rollback Manual (emergência)

Se o workflow não estiver disponível:

```bash
# 1. Identificar a revisão anterior da Task Definition
aws ecs list-task-definitions \
  --family-prefix lacrei-task-prod \
  --status ACTIVE \
  --sort DESC

# 2. Atualizar o serviço para a revisão anterior
aws ecs update-service \
  --cluster lacrei-prod \
  --service lacrei-service-prod \
  --task-definition lacrei-task-prod:N  # substitua N pelo número da revisão anterior
  --force-new-deployment

# 3. Aguardar estabilidade
aws ecs wait services-stable \
  --cluster lacrei-prod \
  --services lacrei-service-prod

# 4. Verificar saúde
curl https://api.lacrei.example.com/health
```

### Proteção Automática

O pipeline CD possui um **gate de proteção**: o deploy para produção **nunca é executado** se o smoke test no staging falhar. Isso garante que somente versões validadas cheguem à produção.

---

## 💳 Integração Asaas (Bônus)

> Documento completo: [`docs/asaas-integration.md`](docs/asaas-integration.md)

A Asaas é usada para **split de pagamento** entre a plataforma Lacrei Saúde (20%) e os profissionais de saúde (80%).

### Fluxo Resumido

```
Paciente paga → Asaas processa → Webhook confirma → BD atualizado → Profissional notificado
```

### Ambientes

| Ambiente | URL Asaas |
|---|---|
| Staging | `https://sandbox.asaas.com/api/v3` |
| Produção | `https://api.asaas.com/v3` |

---

## ✅ Checklist de Segurança

| Item | Implementado | Detalhes |
|---|---|---|
| Secrets não expostos no código | ✅ | GitHub Secrets + `.gitignore` |
| HTTPS obrigatório | ✅ | ALB + ACM + redirect HTTP→HTTPS |
| Usuário não-root no container | ✅ | `USER appuser` no Dockerfile |
| Menor privilégio IAM | ✅ | Política restrita por recurso ARN |
| Scan de vulnerabilidades | ✅ | Trivy a cada build (CI e CD) |
| Headers de segurança HTTP | ✅ | Helmet.js |
| CORS restrito por ambiente | ✅ | `ALLOWED_ORIGINS` env var |
| Imagem base mínima | ✅ | `node:20-alpine` |
| Secrets sensíveis da app | ✅ | AWS Secrets Manager (Task Definition) |
| Logs sem dados sensíveis | ✅ | `morgan` com formato `combined` (sem body) |
| Validação de webhook | ✅ | Token de acesso Asaas |
| Rotação de access keys | 📋 | Recomendado: a cada 90 dias |
| MFA no usuário IAM root | 📋 | Recomendado: configurar obrigatoriamente |
| VPC privada para ECS | ✅ | Tasks em subnets privadas, ALB público |

---

## 📝 Erros Encontrados e Decisões Técnicas

### Decisão: ECS Fargate vs EC2 vs Lightsail

**Escolhido: ECS Fargate**

- **Motivo**: serverless containers eliminam a gestão de servidores EC2 (patching, SSH, etc.), são mais seguros por padrão e se alinham com o princípio de menor superfície de ataque.
- **Custo**: ligeiramente maior que EC2 puro, mas o custo operacional (tempo de gestão) é muito menor.
- **Staging usa FARGATE_SPOT**: reduz custo em ~70% para o ambiente não-crítico.

### Decisão: Multi-stage Docker build

- **Stage builder**: instala todas as dependências (incluindo devDeps) para compilar/testar
- **Stage production**: parte do zero com `npm ci --omit=dev`, imagem ~3x menor, sem devDeps
- **dumb-init**: garante que sinais SIGTERM/SIGINT sejam tratados corretamente dentro do container

### Decisão: Aprovação manual para produção via GitHub Environments

- O ambiente `production` no GitHub tem **required reviewers** configurados
- Isso cria um gate de aprovação humana antes do deploy em produção
- Alinhado com boas práticas de controle de mudanças em ambientes sensíveis

### Decisão: Trivy scan bloqueia CRITICAL e HIGH CVEs

- O CI falha se qualquer vulnerabilidade CRITICAL ou HIGH for encontrada na imagem
- `--ignore-unfixed: true` evita falsos positivos de CVEs sem patch disponível
- Resultados são publicados no GitHub Security tab via SARIF

### Erro #1: Porta 3000 exposta publicamente

**Problema**: Na primeira versão, o Security Group do ECS permitia tráfego de `0.0.0.0/0` na porta 3000.  
**Solução**: Security Group das tasks ECS só aceita tráfego do Security Group do ALB na porta 3000. Acesso externo somente via ALB.

### Erro #2: Variáveis de ambiente em texto plano na Task Definition

**Problema**: Colocar valores sensíveis diretamente em `environment` na Task Definition os expõe no console AWS e nos logs.  
**Solução**: Usar `secrets` na Task Definition apontando para **AWS Secrets Manager** ou **Parameter Store**. Apenas variáveis não-sensíveis ficam em `environment`.

### Erro #3: Container rodando como root

**Problema**: Imagem inicial rodava com usuário `root`, risco de escalonamento de privilégio.  
**Solução**: Criação de usuário e grupo dedicados (`appuser:appgroup`) no Dockerfile, com `USER appuser`.

### Melhoria Proposta: Blue/Green com CodeDeploy

Para zero-downtime deployments em produção, a próxima evolução seria usar **AWS CodeDeploy** integrado ao ECS para troca de tráfego gradual entre a versão atual (Blue) e a nova (Green), com rollback automático baseado em alarmes CloudWatch.

---

## 📬 Contato

**Desenvolvedor**: Riquelmy  
**E-mail de entrega**: desenvolvimento.humano@lacreisaude.com.br

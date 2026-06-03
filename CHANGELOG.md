# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).  
Este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [Unreleased]

### Added
- Integração futura com Asaas (split de pagamento)
- Auto-scaling ECS baseado em CPU/memória
- Blue/Green deployment com AWS CodeDeploy

---

## [1.0.0] – 2024-12-28

### Added
- API Node.js com rotas `/`, `/status` e `/health`
- Middleware de segurança: helmet, cors (origins restritas por ambiente), morgan
- Dockerfile multi-stage com usuário não-root e dumb-init
- `docker-compose.yml` para desenvolvimento local
- Pipeline CI com GitHub Actions: lint (ESLint), testes (Jest + Supertest), build Docker, scan Trivy
- Pipeline CD com GitHub Actions: build/push ECR, deploy ECS staging, smoke tests, deploy produção (aprovação manual)
- Workflow de rollback manual via `workflow_dispatch`
- Infraestrutura AWS: ECS Fargate, ECR, ALB com HTTPS, CloudWatch Logs
- Política IAM de menor privilégio para o usuário do GitHub Actions
- Documentação completa: README, setup AWS, monitoramento, integração Asaas
- Alertas CloudWatch: HTTP 5xx, CPU alta, hosts não saudáveis → SNS → Email + Slack

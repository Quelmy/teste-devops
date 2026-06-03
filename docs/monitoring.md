# Observabilidade – Logs e Monitoramento

## 1. Acessando Logs da Aplicação (CloudWatch)

### Via Console AWS
1. Acesse **CloudWatch → Log groups**
2. Selecione `/ecs/lacrei-staging` ou `/ecs/lacrei-prod`
3. Clique no stream mais recente (formato `ecs/lacrei-api/<task-id>`)
4. Use **Filter events** para buscar por padrão (ex.: `"ERROR"`, `"SIGTERM"`)

### Via AWS CLI
```bash
# Últimos 100 eventos de log do staging
aws logs tail /ecs/lacrei-staging --follow

# Filtrar por erros
aws logs filter-log-events \
  --log-group-name /ecs/lacrei-staging \
  --filter-pattern '"ERROR"' \
  --start-time $(date -d '1 hour ago' +%s000)

# Filtrar por erros – produção
aws logs filter-log-events \
  --log-group-name /ecs/lacrei-prod \
  --filter-pattern '"ERROR"' \
  --start-time $(date -d '1 hour ago' +%s000)
```

---

## 2. Métricas do ECS (CloudWatch Metrics)

```bash
# CPU Utilization – produção
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions \
    Name=ClusterName,Value=lacrei-prod \
    Name=ServiceName,Value=lacrei-service-prod \
  --start-time $(date -u -d '1 hour ago' +"%Y-%m-%dT%H:%M:%SZ") \
  --end-time $(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  --period 300 \
  --statistics Average

# Memory Utilization – produção
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name MemoryUtilization \
  --dimensions \
    Name=ClusterName,Value=lacrei-prod \
    Name=ServiceName,Value=lacrei-service-prod \
  --start-time $(date -u -d '1 hour ago' +"%Y-%m-%dT%H:%M:%SZ") \
  --end-time $(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  --period 300 \
  --statistics Average
```

---

## 3. Alarmes Configurados

| Alarme | Métrica | Threshold | Ação |
|---|---|---|---|
| `Lacrei-Prod-5xx-Errors` | ALB HTTPCode_Target_5XX_Count | ≥ 5 em 2 min | SNS → Email + Slack |
| `Lacrei-Prod-High-CPU` | ECS CPUUtilization | ≥ 80% em 5 min | SNS → Email |
| `Lacrei-Prod-Unhealthy-Hosts` | ALB UnHealthyHostCount | ≥ 1 | SNS → Email + Slack |

### Criar alarme de CPU alta
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "Lacrei-Prod-High-CPU" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --dimensions \
    Name=ClusterName,Value=lacrei-prod \
    Name=ServiceName,Value=lacrei-service-prod \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2 \
  --alarm-actions $SNS_TOPIC_ARN
```

---

## 4. Dashboard CloudWatch

Crie um dashboard customizado no console:
1. CloudWatch → **Dashboards** → **Create dashboard** → `Lacrei-Overview`
2. Adicione widgets:
   - **Line chart**: CPUUtilization + MemoryUtilization (ECS prod + staging)
   - **Number**: `HealthyHostCount` e `UnHealthyHostCount` (ALB)
   - **Bar chart**: `HTTPCode_Target_5XX_Count` por período
   - **Log Insights query**: Top 10 errors da última hora

### Query sugerida para Log Insights
```
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 10
```

---

## 5. Logs do Pipeline CI/CD (GitHub Actions)

- Cada workflow é logado automaticamente pelo GitHub Actions
- Acesse: **GitHub → Actions → [workflow run] → [job] → [step]**
- Steps críticos usam `::group::` para agrupamento visual
- Artifacts de cobertura de testes são retidos por 7 dias

---

## 6. Proposta de Evolução – Grafana + Prometheus

Para uma stack de observabilidade mais robusta em estágios futuros:

```
ECS Tasks → AWS CloudWatch → CloudWatch Metrics Stream → Amazon Managed Grafana
                           → Log Insights → Dashboard unificado
```

Ou, se preferir open-source:
```
ECS Tasks → Prometheus (sidecar ou pushgateway) → Grafana Cloud
          → Loki (logs) → Grafana dashboards
```

# Provisionamento Manual da Infraestrutura AWS

> **Pré-requisitos**: AWS CLI v2 instalado e configurado com um usuário administrador.  
> Substitua `ACCOUNT_ID`, `CERTIFICATE_ARN` e `VPC_ID` pelos valores reais da sua conta.

---

## Variáveis de ambiente (exporte antes de executar os comandos)

```bash
export AWS_REGION="us-east-1"
export ACCOUNT_ID="123456789012"          # aws sts get-caller-identity --query Account --output text
export VPC_ID="vpc-xxxxxxxxxxxxxxxxx"
export SUBNET_PUBLIC_1="subnet-xxxxxxxxx"
export SUBNET_PUBLIC_2="subnet-xxxxxxxxx"
export CERTIFICATE_ARN="arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/xxxxxxxx"
```

---

## 1. ECR – Elastic Container Registry

```bash
# Criar repositório (único, usado para staging e produção com tags diferentes)
aws ecr create-repository \
  --repository-name lacrei-api \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256 \
  --region $AWS_REGION

# Exportar URI do repositório
export ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
echo "ECR Registry: $ECR_REGISTRY"
```

---

## 2. CloudWatch Log Groups

```bash
# Staging
aws logs create-log-group \
  --log-group-name /ecs/lacrei-staging \
  --region $AWS_REGION

aws logs put-retention-policy \
  --log-group-name /ecs/lacrei-staging \
  --retention-in-days 30

# Produção
aws logs create-log-group \
  --log-group-name /ecs/lacrei-prod \
  --region $AWS_REGION

aws logs put-retention-policy \
  --log-group-name /ecs/lacrei-prod \
  --retention-in-days 90
```

---

## 3. ECS Clusters

```bash
# Staging
aws ecs create-cluster \
  --cluster-name lacrei-staging \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE_SPOT,weight=1 \
  --region $AWS_REGION

# Produção
aws ecs create-cluster \
  --cluster-name lacrei-prod \
  --capacity-providers FARGATE \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1 \
  --region $AWS_REGION
```

---

## 4. IAM Role – ECS Task Execution Role

```bash
# Criar a trust policy
cat > /tmp/ecs-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file:///tmp/ecs-trust-policy.json

aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

---

## 5. Security Groups

```bash
# Security Group do ALB
export SG_ALB=$(aws ec2 create-security-group \
  --group-name lacrei-alb-sg \
  --description "Lacrei ALB Security Group" \
  --vpc-id $VPC_ID \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ALB \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ALB \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

# Security Group das Tasks ECS
export SG_ECS=$(aws ec2 create-security-group \
  --group-name lacrei-ecs-sg \
  --description "Lacrei ECS Tasks Security Group" \
  --vpc-id $VPC_ID \
  --query GroupId --output text)

# Permite apenas tráfego do ALB na porta 3000
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ECS \
  --protocol tcp --port 3000 \
  --source-group $SG_ALB
```

---

## 6. Application Load Balancers

```bash
# ──── STAGING ────────────────────────────────────────────────────────
export ALB_STAGING=$(aws elbv2 create-load-balancer \
  --name lacrei-alb-staging \
  --subnets $SUBNET_PUBLIC_1 $SUBNET_PUBLIC_2 \
  --security-groups $SG_ALB \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# Target Group Staging
export TG_STAGING=$(aws elbv2 create-target-group \
  --name lacrei-tg-staging \
  --protocol HTTP --port 3000 \
  --target-type ip \
  --vpc-id $VPC_ID \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# Listener HTTPS (443) – staging
aws elbv2 create-listener \
  --load-balancer-arn $ALB_STAGING \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=$CERTIFICATE_ARN \
  --default-actions Type=forward,TargetGroupArn=$TG_STAGING

# Redirect HTTP → HTTPS – staging
aws elbv2 create-listener \
  --load-balancer-arn $ALB_STAGING \
  --protocol HTTP --port 80 \
  --default-actions \
    Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}"

# ──── PRODUÇÃO ────────────────────────────────────────────────────────
export ALB_PROD=$(aws elbv2 create-load-balancer \
  --name lacrei-alb-prod \
  --subnets $SUBNET_PUBLIC_1 $SUBNET_PUBLIC_2 \
  --security-groups $SG_ALB \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

export TG_PROD=$(aws elbv2 create-target-group \
  --name lacrei-tg-prod \
  --protocol HTTP --port 3000 \
  --target-type ip \
  --vpc-id $VPC_ID \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

aws elbv2 create-listener \
  --load-balancer-arn $ALB_PROD \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=$CERTIFICATE_ARN \
  --default-actions Type=forward,TargetGroupArn=$TG_PROD

aws elbv2 create-listener \
  --load-balancer-arn $ALB_PROD \
  --protocol HTTP --port 80 \
  --default-actions \
    Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}"
```

---

## 7. ECS Task Definitions

```bash
# ──── STAGING ────────────────────────────────────────────────────────
aws ecs register-task-definition --cli-input-json '{
  "family": "lacrei-task-staging",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::'$ACCOUNT_ID':role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "lacrei-api",
      "image": "'$ECR_REGISTRY'/lacrei-api:main",
      "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
      "essential": true,
      "environment": [
        { "name": "NODE_ENV", "value": "staging" },
        { "name": "PORT", "value": "3000" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/lacrei-staging",
          "awslogs-region": "'$AWS_REGION'",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 15
      }
    }
  ]
}'

# ──── PRODUÇÃO ────────────────────────────────────────────────────────
aws ecs register-task-definition --cli-input-json '{
  "family": "lacrei-task-prod",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::'$ACCOUNT_ID':role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "lacrei-api",
      "image": "'$ECR_REGISTRY'/lacrei-api:latest",
      "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
      "essential": true,
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/lacrei-prod",
          "awslogs-region": "'$AWS_REGION'",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 15
      }
    }
  ]
}'
```

---

## 8. ECS Services

```bash
# ──── STAGING ────────────────────────────────────────────────────────
aws ecs create-service \
  --cluster lacrei-staging \
  --service-name lacrei-service-staging \
  --task-definition lacrei-task-staging \
  --launch-type FARGATE \
  --desired-count 1 \
  --network-configuration "awsvpcConfiguration={
    subnets=[$SUBNET_PUBLIC_1,$SUBNET_PUBLIC_2],
    securityGroups=[$SG_ECS],
    assignPublicIp=DISABLED
  }" \
  --load-balancers "targetGroupArn=$TG_STAGING,containerName=lacrei-api,containerPort=3000" \
  --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100" \
  --health-check-grace-period-seconds 60

# ──── PRODUÇÃO ────────────────────────────────────────────────────────
aws ecs create-service \
  --cluster lacrei-prod \
  --service-name lacrei-service-prod \
  --task-definition lacrei-task-prod \
  --launch-type FARGATE \
  --desired-count 2 \
  --network-configuration "awsvpcConfiguration={
    subnets=[$SUBNET_PUBLIC_1,$SUBNET_PUBLIC_2],
    securityGroups=[$SG_ECS],
    assignPublicIp=DISABLED
  }" \
  --load-balancers "targetGroupArn=$TG_PROD,containerName=lacrei-api,containerPort=3000" \
  --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100" \
  --health-check-grace-period-seconds 60
```

---

## 9. IAM User para GitHub Actions

```bash
# Criar usuário
aws iam create-user --user-name github-actions-lacrei

# Aplicar política de menor privilégio
aws iam put-user-policy \
  --user-name github-actions-lacrei \
  --policy-name LacreGitHubActionsPolicy \
  --policy-document file://infra/iam/github-actions-policy.json

# Gerar access keys (salve os valores e configure nos GitHub Secrets)
aws iam create-access-key --user-name github-actions-lacrei
```

---

## 10. Configurar GitHub Secrets

Após criar o IAM User e os recursos acima, configure os seguintes secrets no GitHub:

| Secret | Valor |
|---|---|
| `AWS_ACCESS_KEY_ID` | Access Key ID do IAM User |
| `AWS_SECRET_ACCESS_KEY` | Secret Access Key do IAM User |
| `AWS_REGION` | `us-east-1` |
| `ECR_REGISTRY` | `ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com` |
| `STAGING_URL` | URL do ALB de staging (ex: `https://staging.lacrei.example.com`) |
| `PRODUCTION_URL` | URL do ALB de produção |
| `SLACK_WEBHOOK_URL` | URL do Incoming Webhook do Slack (opcional) |

---

## 11. CloudWatch Alarm para erros 5xx (Bônus)

```bash
# Criar SNS Topic para alertas
export SNS_TOPIC=$(aws sns create-topic \
  --name lacrei-alerts \
  --query TopicArn --output text)

# Subscrever e-mail
aws sns subscribe \
  --topic-arn $SNS_TOPIC \
  --protocol email \
  --notification-endpoint seu-email@exemplo.com

# Alarme de HTTP 5xx no ALB de produção
aws cloudwatch put-metric-alarm \
  --alarm-name "Lacrei-Prod-5xx-Errors" \
  --alarm-description "Alerta de erros HTTP 5xx no ALB de produção" \
  --metric-name HTTPCode_Target_5XX_Count \
  --namespace AWS/ApplicationELB \
  --dimensions Name=LoadBalancer,Value=$(aws elbv2 describe-load-balancers \
    --names lacrei-alb-prod \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text | sed 's|.*loadbalancer/||') \
  --statistic Sum \
  --period 60 \
  --threshold 5 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2 \
  --alarm-actions $SNS_TOPIC \
  --treat-missing-data notBreaching
```

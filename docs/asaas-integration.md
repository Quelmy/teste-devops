# Proposta de Integração – Asaas (Split de Pagamento)

> Este documento descreve a proposta de arquitetura para integrar a plataforma  
> Lacrei Saúde com a API da Asaas, focando no fluxo de **split de pagamento**  
> entre a plataforma e os profissionais de saúde cadastrados.

---

## Visão Geral

A Asaas é uma plataforma de pagamentos brasileira que oferece funcionalidades de:
- Cobranças via Pix, boleto e cartão de crédito
- **Split de pagamento**: divisão automática de valores entre múltiplos recebedores
- Webhooks para notificações de eventos de pagamento

---

## Fluxo Proposto

```
Paciente                Lacrei Saúde API          Asaas API          Profissional
    │                         │                       │                     │
    │── POST /appointments ──>│                       │                     │
    │                         │── POST /payments ────>│                     │
    │                         │   (split configurado) │                     │
    │                         │<── { paymentUrl } ───│                     │
    │<── { paymentUrl } ──────│                       │                     │
    │                         │                       │                     │
    │── [Realiza Pagamento] ──────────────────────────>│                    │
    │                         │                       │                     │
    │                         │<── [Webhook] ─────────│                     │
    │                         │   { event: PAYMENT_CONFIRMED }              │
    │                         │                       │                     │
    │                         │── [Atualiza BD] ──────│                     │
    │                         │── [Notifica] ─────────────────────────────>│
    │<── [Confirmação] ───────│                       │                     │
```

---

## Arquitetura de Integração

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Lacrei Saúde – Backend                         │
│                                                                          │
│  ┌──────────────┐    ┌────────────────┐    ┌───────────────────────┐   │
│  │  Appointment │───>│ Payment Service │───>│   Asaas HTTP Client   │   │
│  │  Controller  │    │                │    │  (axios + retry)       │   │
│  └──────────────┘    └────────────────┘    └──────────┬────────────┘   │
│                                                        │                 │
│  ┌──────────────┐    ┌────────────────┐               │                 │
│  │  Webhook     │    │  Event Queue   │    Asaas API  │                 │
│  │  Controller  │───>│  (SQS/BullMQ)  │<─────────────┘                 │
│  └──────────────┘    └────────────────┘                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Endpoints Mock

### POST `/payments/create`
Cria um pagamento com split configurado.

**Request:**
```json
{
  "appointmentId": "appt_abc123",
  "patient": {
    "name": "Maria Silva",
    "cpfCnpj": "12345678901",
    "email": "maria@exemplo.com"
  },
  "professional": {
    "asaasAccountId": "acc_profissional_xyz"
  },
  "amount": 15000,
  "split": [
    {
      "walletId": "acc_profissional_xyz",
      "percentualValue": 80
    },
    {
      "walletId": "acc_lacrei_saude",
      "percentualValue": 20
    }
  ],
  "billingType": "PIX",
  "dueDate": "2024-12-31"
}
```

**Response (Asaas API):**
```json
{
  "id": "pay_asaas_xyz789",
  "status": "PENDING",
  "value": 150.00,
  "netValue": 148.50,
  "billingType": "PIX",
  "pixQrCode": "00020126...",
  "pixCopiaECola": "00020126...",
  "dueDate": "2024-12-31",
  "split": [
    { "walletId": "acc_profissional_xyz", "value": 118.80 },
    { "walletId": "acc_lacrei_saude", "value": 29.70 }
  ]
}
```

---

### POST `/webhooks/asaas`
Recebe eventos da Asaas e processa em fila.

**Payload de Webhook (PAYMENT_CONFIRMED):**
```json
{
  "event": "PAYMENT_CONFIRMED",
  "payment": {
    "id": "pay_asaas_xyz789",
    "status": "CONFIRMED",
    "value": 150.00,
    "confirmedDate": "2024-12-28",
    "externalReference": "appt_abc123"
  }
}
```

---

## Implementação do Webhook Handler (pseudocódigo)

```javascript
// src/webhooks/asaas.webhook.js
const crypto = require('crypto');

/**
 * Valida a assinatura do webhook da Asaas.
 * A Asaas envia o header 'asaas-access-token' com o token configurado.
 */
function validateAsaasWebhook(req) {
  const token = req.headers['asaas-access-token'];
  if (!token || token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    throw new Error('Invalid webhook token');
  }
}

async function handleAsaasWebhook(req, res) {
  try {
    validateAsaasWebhook(req);

    const { event, payment } = req.body;

    switch (event) {
      case 'PAYMENT_CONFIRMED':
        await paymentService.confirmPayment(payment.externalReference);
        await notificationService.notifyProfessional(payment.externalReference);
        break;

      case 'PAYMENT_OVERDUE':
        await paymentService.markAsOverdue(payment.externalReference);
        break;

      case 'PAYMENT_REFUNDED':
        await paymentService.processRefund(payment.externalReference);
        break;

      default:
        console.log(`Unhandled Asaas event: ${event}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(401).json({ error: err.message });
  }
}
```

---

## Segurança da Integração

| Aspecto | Implementação |
|---|---|
| **API Key** | Armazenada no AWS Secrets Manager, injetada via ECS Task Definition |
| **Validação de Webhook** | Token de acesso validado em toda requisição recebida |
| **HTTPS** | Toda comunicação com a Asaas via HTTPS (TLS 1.2+) |
| **Ambiente Sandbox** | Usar `https://sandbox.asaas.com/api/v3` em staging |
| **Idempotência** | `externalReference` = ID da consulta para evitar duplicatas |
| **Rate Limiting** | Implementar exponential backoff + retry (máx. 3 tentativas) |

---

## Variáveis de Ambiente Necessárias

```bash
ASAAS_API_KEY=your_api_key_here          # Obtida no painel Asaas
ASAAS_API_URL=https://api.asaas.com/v3   # Produção
# ASAAS_API_URL=https://sandbox.asaas.com/api/v3  # Staging
ASAAS_WEBHOOK_TOKEN=your_webhook_token
LACREI_WALLET_ID=acc_lacrei_saude
```

---

## Referências

- [Documentação Asaas – Split de Pagamento](https://docs.asaas.com/reference/criar-nova-cobranca)
- [Documentação Asaas – Webhooks](https://docs.asaas.com/reference/introducao-a-webhooks)
- [Sandbox Asaas](https://sandbox.asaas.com)

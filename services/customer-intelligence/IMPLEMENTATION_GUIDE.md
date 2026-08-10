# AAIQ Customer & Marketing Intelligence

This independent FastAPI service is the production boundary for consented customer behavior, identity reconciliation, PMS/POS spending, cohort calculation, and approval-controlled activation. It does not access or modify HNE.

## Runtime

- FastAPI receives validated website and transaction events.
- PostgreSQL is authoritative for profiles, identity links, transactions, activation requests, and audit records.
- Celery and Redis provide retryable asynchronous processing.
- Anonymous clickstream properties are allow-listed and reject email, phone, payment, and government identifiers.
- Identity stitching runs transactionally inside tenant and property scope.
- External activation defaults to `DRY_RUN`.

Start locally:

```bash
cp .env.example .env
docker compose up --build
curl http://localhost:8080/healthz
```

All write requests require `X-AAIQ-Service-Key`.

## Tracking event

```json
{
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "property_id": "22222222-2222-2222-2222-222222222222",
  "idempotency_key": "website-session-42-event-7",
  "event_name": "Searched_Vegan_Menu",
  "anonymous_id": "anon_77d168d9",
  "customer_id": null,
  "timestamp": "2026-07-28T12:00:00Z",
  "source": "WEBSITE",
  "properties": {"search_term": "vegan menu", "page_url": "/restaurant/menu"}
}
```

When a later verified event includes both IDs, the worker links prior events for the same anonymous ID. It refuses cross-property or conflicting identity links.

## Transaction webhook

```json
{
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "property_id": "22222222-2222-2222-2222-222222222222",
  "external_transaction_id": "pos-check-18442",
  "customer_id": "33333333-3333-3333-3333-333333333333",
  "amount_spent": 186.50,
  "department": "restaurant",
  "items_purchased": ["steak", "wine pairing"],
  "business_date": "2026-07-28T04:00:00Z",
  "source": "POS"
}
```

The webhook is idempotent. Cohorts are recalculated after each accepted transaction:

- High-Net-Worth: hotel ticket over $500 or restaurant ticket over $150.
- Corporate-Traveler: repeated Monday–Thursday hotel activity.
- Luxury-Wellness: verified spa or wine-pairing intent.

These are configurable business rules, not protected-class inferences.

## Activation connectors

- Meta uses `https://graph.facebook.com/{version}/{pixel_id}/events`, normalized SHA-256 identifiers, event IDs, and retry handling.
- Google Customer Match creates, populates, and runs an `OfflineUserDataJob`; it requires Google Ads OAuth, developer token, customer ID, and user-list resource.
- SendGrid uses `POST /v3/mail/send`, a verified sender, a dynamic template, and a suppression group.
- Postiz remains the organic social publishing connector. Paid advertising uses the advertising network’s API and separate approval.

Set `ACTIVATION_MODE=LIVE` only after:

1. consent and suppression imports are verified;
2. a privacy/legal review is recorded;
3. connector credentials are stored in the vault;
4. test events are accepted by each provider;
5. administrator approval and budget limits are configured.

## Manual fallback

Missing credentials, low confidence, consent failure, provider outage, or rate limiting must produce a visible exception/approval record. Never drop an event, publish content, create spend, or send a loyalty message silently.

## Platform adapters

Add further channels behind the same contract:

`validate configuration → verify consent → create approval request → approve → execute idempotently → store provider response → report → audit`

Unsupported platforms remain `CONFIGURATION_REQUIRED`; they are never represented as connected.

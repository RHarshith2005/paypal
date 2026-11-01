# PayPal sandbox capability report

This file records what has actually been exercised against PayPal, not what the
integration intends to do. It is updated only from a real `pnpm paypal:smoke`
run.

## Current status

| Capability                             | Endpoint                                          | Status           | Notes                                                                    |
| -------------------------------------- | ------------------------------------------------- | ---------------- | ------------------------------------------------------------------------ |
| OAuth client credentials + token cache | `POST /v1/oauth2/token`                           | **NOT VERIFIED** | Implemented with a cache and 60s expiry skew; needs sandbox credentials. |
| Create order                           | `POST /v2/checkout/orders`                        | **NOT VERIFIED** | Implemented; unit-tested against recorded request shapes.                |
| Get order                              | `GET /v2/checkout/orders/{id}`                    | **NOT VERIFIED** | Implemented; unit-tested.                                                |
| Capture order                          | `POST /v2/checkout/orders/{id}/capture`           | **NOT VERIFIED** | Implemented; unit-tested.                                                |
| Refund capture                         | `POST /v2/payments/captures/{capture_id}/refund`  | **NOT VERIFIED** | Implemented; unit-tested.                                                |
| List disputes                          | `GET /v1/customer/disputes`                       | **NOT VERIFIED** | Implemented; requires the Disputes feature enabled on the app.           |
| Webhook signature verification         | `POST /v1/notifications/verify-webhook-signature` | **NOT VERIFIED** | Needs `PAYPAL_WEBHOOK_ID` plus a real or simulated delivery.             |

**Why everything is NOT VERIFIED:** this environment has no PayPal sandbox
credentials (`PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` are unset), so no
request has been sent to PayPal from this machine. `pnpm paypal:smoke` exits `2`
in that state and prints the same conclusion instead of inventing results.

## How to verify

1. Create a sandbox REST app at <https://developer.paypal.com/dashboard/applications/sandbox>.
   Enable **Disputes** in the app's feature options if you want dispute listing.
2. Put the credentials in `.env`:

   ```bash
   PAYPAL_MODE=sandbox
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   ```

3. Run:

   ```bash
   pnpm paypal:smoke
   ```

4. Paste the resulting table into this file, replacing the row statuses with
   what the run reported. Keep failures as failures.

## Known limitations from the docs

- **Disputes are read/list only for merchants.** PayPal's Disputes v1 reference
  states that merchants cannot create disputes in the live environment; creation
  is a limited-release feature. `listDisputes` is therefore the only dispute
  capability in the provider.
- **Webhook delivery needs HTTPS on port 443.** Verification itself works
  locally via the postback endpoint, but a real delivery to `localhost` will not
  happen. The mock-event simulator is the usual way to test a listener.
- **Orders are created with `intent: CAPTURE`.** A sandbox buyer still has to
  approve the order (the `approve` link) unless the app is set up for automatic
  approval. The smoke script captures immediately; without an approved order
  PayPal returns a 422 `ORDER_NOT_APPROVED`, which the script reports verbatim.
- **Amounts are decimal strings on the wire and integer cents in the domain.**
  Conversion happens exactly once, at the adapter edge.

## Why the Agent Toolkit is not in the payment path

`@paypal/agent-toolkit` and the MCP server expose PayPal operations as tools for
an LLM (create_order, pay_order, create_refund, list_disputes, ...). Handshake's
rule is that money movement is deterministic and must work with no model in the
loop, so the provider calls the documented REST endpoints directly and mirrors
the same capability names. The toolkit remains the right choice for the
conversational layer, not for the payment executor.

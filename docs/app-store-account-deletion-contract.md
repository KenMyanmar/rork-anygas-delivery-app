# AnyGas App Store account deletion contract

Status: `delete-customer-account` v1 is live. The app integration is implemented separately from the shared backend.

The current **Remove account from this device** action is a secure local sign-out. It must not be relabeled as permanent deletion. Apple requires a separate in-app permanent deletion flow because the app supports customer registration.

## Live edge function

`delete-customer-account`

- Method: authenticated `POST`
- Request body: empty. The app performs PIN and typed confirmation locally before calling the function.
- Identity: derive the Supabase Auth user ID and phone from the verified JWT. Never accept `auth_user_id`, phone or customer ID as authoritative request fields.
- Response on success: `{ "ok": true, "request_id": "<uuid>" }`
- Response errors: `409 active_orders` when an order must be completed or cancelled first; authenticated/server failures remain visible and retryable in the app.

## Transactional behavior

1. Locate customer records linked to the authenticated user.
2. Revoke active sessions and prevent new customer-app access.
3. Delete or anonymize customer profile, saved addresses, device tokens and app-only preferences.
4. Preserve only order/accounting records required for safety, fraud prevention, accounting or law, with direct identifiers removed where permitted.
5. Record an internal deletion audit event containing the request ID, completion state and retention reason—not the deleted profile payload.
6. Delete the Supabase Auth user only after application-data cleanup succeeds.

## App flow

1. Profile → **Delete account permanently**.
2. Explain what is deleted, what may be legally retained and that deletion cannot be undone.
3. Require an explicit destructive confirmation.
4. Call the edge function with the current access token.
5. On success, clear SecureStore, customer-scoped caches and React Query state, then return to login.
6. On failure, retain the session, show a retryable error and provide the 8484 support path.

## Verification evidence

- A customer cannot authenticate or resume a parked session after deletion.
- The deleted customer cannot read orders or addresses through RLS.
- Another customer is unaffected.
- A repeated deletion request is safe and returns a stable result.
- Retained order records contain only fields approved by the retention policy.
- App Review receives a working reviewer test phone/code that can exercise the deletion flow.

# Implementation verification

Approved by the user: “Okay basla frontende tesdiqledim dizayni” (2026-11-02).

Customer route: /{en|ru|az}/trips/{bookingId}/cancellation.
Operations: Customer requests → Review cancellation.

Implemented: whole-trip and selected-service requests, reason/message/explicit request checkbox, per-service agreed terms, pending/declined/approved outcomes, private customer explanation projection, per-service amounts, zero-refund handling, remaining-service handling after partial cancellation, and authenticated PDF summary download.

Office staff allocate received funds, enter supplier references and explicit time bands, select fee basis, verify supplier terms, save a version, preview the customer summary and approve. Unsaved changes, over-allocation and missing checks block approval. Internal notes stay private. Pre-contract zero-payment requests have a separate simple decision path.

Partial cancellation preserves remaining services. Payment issuance and offer amendments after partial cancellation require a separate manual plan review; the payment gateway is not enabled. Refund progress represents an approved plan with pending funds, not a completed transfer. The summary PDF is generated in English with embedded Inter Unicode font and original policy/customer explanation text.

Validation: customer form submission in browser; office allocation 201/200 rejected in UI; corrected allocation save/preview/approve; customer 200/46/154 result; EN/AZ and RU at 320px; mobile 390px with no horizontal overflow; API tests for partial/full transitions, privacy, ownership and PDF delivery. QA sample amounts were fixture data only, without bank funds.

Screenshots are retained beside these notes. Request screenshot was taken before the final spacing adjustment; result screenshots reflect the final responsive layout.

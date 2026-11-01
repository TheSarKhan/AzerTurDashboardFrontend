# Operator request review and customer offer — proposal v1

Status: approved and implemented, 1 November 2026. See approval.md and implementation.md. Original design brief preserved below. The approved implementation and verification are recorded in implementation.md.

## Deliverables

- request-review-desktop.png — complete office request review workspace.
- offer-composer-desktop.png — complete customer offer preparation workspace.
- service-editor-desktop.png — full service edit dialog with workspace context.
- prompts.json — exact built-in GPT Images prompts.
- manifest.json — status, generated asset dimensions and sample accounting.

Desktop is primary because the user specified office staff only. Driver/guide apps are separate. These are three distinct screens/states, not competing visual directions. Interface example copy is EN; implementation must support EN/RU/AZ.

## Visual and content direction

Continue the approved planner and customer cabinet palette, typography and restrained components. Use a white office navigation sidebar, practical tables/forms, explicit text statuses and a right-side review summary. No pills, eyebrow labels, neon, gradients, analytics filler or decorative card grids. No marketing hero or fake inventory. Original accepted project imagery remains the brand reference, with minimal imagery appropriate for office work.

Sample only: request 42bf2845, Alex Morgan / alex@example.com, 15–16 May 2027, Quba → Khinalug, 2 travelers, 2 days/1 night. The sample is independent of the current QA booking's operational state. Driver €180 + Comfort stay €110 + guide €130 + transfer €35 + craft €40 = €495 group total. Paid €0. The catalog's from-price is not added. No invented fees, tax behavior, discount or fixed deposit rule.

## Screen behaviors

Request review is an early review stage: 2/5 services checked, 2/5 service terms reviewed. Staff inspect the customer's original route, notes and selected services, check suppliers manually, and record internal notes. Prepare offer may open a draft before all checks are complete. Saving a note or preparing a draft does not approve a booking or open payment.

Offer composer is a later draft of the same example: all five services checked, four terms reviewed, hotel terms missing and customer preview not yet reviewed. Editable service unit prices/quantities recalculate each line and the total. The example remains €495. Sending remains disabled while required information is incomplete. Preview remains available to inspect the draft. Currency must remain internally consistent; do not silently change the currency of paid bookings. The illustrative header revision 1 is a proposed future persisted revision, not an existing backend capability.

Service editor changes one line only: source, supplier/property, location, explicit availability, unit basis, customer price, customer-facing cancellation policy and separate internal supplier note. Blank supplier and policy fields are honest missing-data states. Source Manual is available initially; show partner connectors only after real integration exists. An office availability confirmation is not a supplier booking guarantee. Save service must preserve unrelated services and route selections.

Policies belong to each service/provider and include relevant time cutoffs and refund conditions. Do not hardcode a universal 48–72h window or refund percentage. Reviewed means staff explicitly reviewed a nonempty customer-facing policy. A checkbox alone must not fabricate policy text.

Customer preview must show exactly what will be sent: route, dates, travelers, selected services and their final prices, message and service-specific terms. Internal notes and supplier-only commentary must never be included. Sending creates an immutable customer-visible offer revision, not a payment or acceptance event. Later customer agreement/PDF contract approval precedes deposit and service-specific payment requests, under the user's agreed business sequence.

## Existing backend and required implementation

Current Spring Boot BookingOperationsController supports booking review (approve/reject note) and resolving customer change/cancellation requests. Existing review approval directly moves PENDING_REVIEW to AWAITING_PAYMENT and notifies the customer that demo payment is available. QuoteCalculator currently calculates fixed demo service rates. The existing frontend can create replacement quotes for amendments but does not have a persisted line-editable offer draft/send workflow.

Therefore these new controls cannot honestly be implemented as a visual wrapper over the current approve endpoint. Implementation needs durable offer drafts/revisions, editable service pricing/quantity snapshots, per-service availability/provider/policy metadata, internal vs customer-visible fields, a preview/send operation, validation and audit events. Sending an offer must not reuse the current approval-to-payment transition. New customer-visible offer status and later contract/payment gates must be wired end to end. Exact API/state names will be chosen during implementation; these mocks do not claim they are already available.

Staff permissions stay restricted to operations. Draft saves and sending need conflict handling, duplicate-send prevention and clear unsaved/saved state. Failed saves keep edits. Existing pending customer change/cancellation requests must be shown and resolved or explicitly reconciled before stale offers are sent. Missing/expired/changed availability must block sending until rechecked. No arbitrary automatic response SLA or supplier hold guarantee is introduced.

Emails use the existing notification/outbox pattern and later Gmail SMTP, never SMS. No email or offer was sent during this design pass. No real contract or supplier agreement has been created.

## Research

Primary visual references are the project's approved customer cabinet v1 and planner v1. No third-party UI assets were copied or downloaded.

- CRM UI Kit listing: https://codeintra.com/free/customizable-ui-kit-for-crm-system-figma-resources — describes web screens/components and CRM activity management; internal Figma frames were not inspected and the gated download was not used.
- Creator's Free Invoice Template listing: https://noahelhadedy.com/resources/free-invoice-template — reviewed its line-item and editorial-document layout description; the .fig download requires an email and was not obtained. Used only as a general reading reference for legible itemized pricing. An offer is not an invoice or payment request.

## Approval archive

Keep this proposal under design/modules/operator-offers/v1 until approval. Then copy accepted originals, prompts and approval quote to design/approved/operator-offers/v1 and appropriate repository archives. Preserve previous approved versions.

## Visual review and implementation source of truth

All three originals were inspected. Request and composer are distinct complete desktop pages, with five service line items, correct €495 group total, sidebar, summary and bottom actions. Composer shows a missing hotel policy and a disabled Send offer. Service editor is complete and preserves separate customer-facing terms and internal note. It contains no send/payment action.

Generated incidental copy is not an instruction to change business rules: the first review screen's checked “Confirm selected suppliers” item must instead reflect all five actual checks (2/5 is not complete). The checklist gates sending, not opening a draft. The editor's dimmed background is incidental; implementation must use the actual approved composer/review backdrop, not copy alternate sample timestamps, phone numbers or extra controls from it. Character counters must count real field content. Use flat restrained orange in code, canonical spelling and proper EN/RU/AZ translations.

No dashboard/backend changes, emails, supplier bookings, contract acceptance or payments were made during this design pass. The Send offer action requires the future persisted offer workflow described above; it must never be wired to the existing approve-and-open-demo-payment endpoint.

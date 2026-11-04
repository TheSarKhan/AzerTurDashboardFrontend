# Office original-document workspace

The booking offer workspace includes an original ticket/voucher/document module independently of whether an offer has already been sent. It shows the actual customer's name/email and booking reference, accepts PDF/JPG/PNG up to 10 MB, records document type/service, ISO validity instants with offsets, IANA display timezone and customer instructions.

After upload, the operator opens the original, checks customer/journey and records preview before Publish is enabled. Publication supersedes the previous slot; rows retain history. Published documents may be revoked explicitly. The API enforces owner access, preview actor/hash and latest version; UI controls alone are not the authorization boundary. No barcode/QR is generated. Requires backend feature/travel-documents (V17–V18).

Validation: `npm run build`. Synthetic local UI/API verification uses separate QA data, with email and push delivery disabled. Production supplier documents and final native device validation remain release prerequisites.

Independent passengers/flight legs use separate document groups. Upload defaults to a new document; explicit `replaces` references an existing document in the same booking/service/kind and creates a new version only within that group. Publishing one passenger’s ticket never supersedes a different passenger’s original.

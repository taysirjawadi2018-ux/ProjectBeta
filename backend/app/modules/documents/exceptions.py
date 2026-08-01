"""documents module exceptions.

Two flows are not covered by core errors: verifying a document that is not
pending (a 409 — the row exists, the transition is illegal), and verification
attempts that cannot satisfy chk_documents_verification_complete (a 422).
"""

from app.core.errors import Conflict, UnprocessableEntity


class DocumentNotPending(Conflict):
    code = "document_not_pending"

    def __init__(self) -> None:
        super().__init__("Only pending documents can be verified.")


class VerificationIncomplete(UnprocessableEntity):
    code = "verification_incomplete"

    def __init__(self) -> None:
        super().__init__(
            "A verification must name the verifier and set the new status."
        )

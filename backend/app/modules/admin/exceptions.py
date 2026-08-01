"""admin module exceptions."""

from app.core.errors import NotFound


class RoleNotFound(NotFound):
    code = "role_not_found"

    def __init__(self) -> None:
        super().__init__("Role not found.")

"""
Recipient management for message campaigns.

Recipients can be added three ways, mirroring the source TMMS feature set:

* **manual** -- one entry at a time (username or numeric user id),
* **CSV import** -- with a configurable column mapping so arbitrary CSV
  layouts can be ingested,
* **audience pull** -- from already-collected users (rows produced elsewhere
  in the panel).

A :class:`RecipientList` de-duplicates on a normalized key and tracks a
per-recipient send status (pending / sent / failed) so a campaign can report
progress and retry only the failures.

This module is pure logic (stdlib ``csv`` only) so it is unit-testable without
any Telegram or network dependency.
"""
from __future__ import annotations

import csv
import io
import logging
from typing import Dict, Iterable, List, Mapping, Optional

logger = logging.getLogger(__name__)

# Per-recipient send states.
STATUS_PENDING = "pending"
STATUS_SENT = "sent"
STATUS_FAILED = "failed"

# Default mapping from CSV header name -> recipient field. Callers can override
# any subset via parse_recipients_csv(..., column_map=...).
DEFAULT_COLUMN_MAP = {
    "username": "username",
    "first_name": "first_name",
    "last_name": "last_name",
    "phone": "phone",
}


class Recipient:
    """A single campaign recipient and its send state."""

    def __init__(
        self,
        username: Optional[str] = None,
        first_name: str = "",
        last_name: str = "",
        phone: Optional[str] = None,
        source: str = "manual",
    ) -> None:
        self.username = _normalize_username(username)
        self.first_name = first_name or ""
        self.last_name = last_name or ""
        self.phone = _normalize_phone(phone)
        self.source = source
        self.status = STATUS_PENDING
        self.error_message: Optional[str] = None
        self.account_id: Optional[object] = None

    @property
    def key(self) -> str:
        """Stable identity used for de-duplication.

        Prefers username, then phone. An entry with neither is not a valid
        target and gets a blank key (filtered out on add).
        """
        if self.username:
            return f"u:{self.username.lower()}"
        if self.phone:
            return f"p:{self.phone}"
        return ""

    @property
    def is_valid(self) -> bool:
        return bool(self.key)

    def mark_sent(self, account_id: Optional[object] = None) -> None:
        self.status = STATUS_SENT
        self.error_message = None
        self.account_id = account_id

    def mark_failed(
        self, error_message: str, account_id: Optional[object] = None
    ) -> None:
        self.status = STATUS_FAILED
        self.error_message = error_message
        self.account_id = account_id

    def to_dict(self) -> Dict[str, object]:
        return {
            "username": self.username,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "phone": self.phone,
            "source": self.source,
            "status": self.status,
            "error_message": self.error_message,
            "account_id": self.account_id,
        }

    def context(self) -> Dict[str, object]:
        """Substitution context for :func:`src.templates.substitute`."""
        return {
            "username": self.username or "",
            "first_name": self.first_name,
            "last_name": self.last_name,
            "phone": self.phone or "",
        }


def _normalize_username(username: Optional[str]) -> Optional[str]:
    if username is None:
        return None
    cleaned = str(username).strip().lstrip("@")
    return cleaned or None


def _normalize_phone(phone: Optional[str]) -> Optional[str]:
    if phone is None:
        return None
    cleaned = str(phone).strip()
    return cleaned or None


def parse_recipients_csv(
    content: str,
    column_map: Optional[Mapping[str, str]] = None,
    source: str = "csv",
) -> List[Recipient]:
    """Parse CSV ``content`` into :class:`Recipient` objects.

    Args:
        content: Raw CSV text (must include a header row).
        column_map: Optional mapping of CSV header -> recipient field. Only the
            fields ``username``, ``first_name``, ``last_name`` and ``phone``
            are recognised; unknown targets are ignored. Defaults to
            :data:`DEFAULT_COLUMN_MAP`.
        source: Value recorded as each recipient's ``source``.

    Returns:
        A list of recipients (invalid rows -- no username and no phone -- are
        skipped).
    """
    if not content or not content.strip():
        return []

    mapping = dict(column_map) if column_map is not None else dict(DEFAULT_COLUMN_MAP)
    valid_fields = {"username", "first_name", "last_name", "phone"}

    reader = csv.DictReader(io.StringIO(content))
    recipients: List[Recipient] = []
    for row in reader:
        fields: Dict[str, str] = {}
        for header, target in mapping.items():
            if target not in valid_fields:
                continue
            value = row.get(header)
            if value is not None:
                fields[target] = value.strip()
        recipient = Recipient(source=source, **fields)
        if recipient.is_valid:
            recipients.append(recipient)
        else:
            logger.debug("Skipping invalid CSV row (no username/phone): %s", row)
    return recipients


class RecipientList:
    """An ordered, de-duplicated collection of recipients with status tracking."""

    def __init__(self) -> None:
        self._recipients: List[Recipient] = []
        self._keys: set = set()

    def __len__(self) -> int:
        return len(self._recipients)

    def __iter__(self):
        return iter(self._recipients)

    def add(self, recipient: Recipient) -> bool:
        """Add one recipient. Returns False if invalid or a duplicate."""
        if not recipient.is_valid or recipient.key in self._keys:
            return False
        self._keys.add(recipient.key)
        self._recipients.append(recipient)
        return True

    def add_many(self, recipients: Iterable[Recipient]) -> int:
        """Add several recipients. Returns the number actually added."""
        added = 0
        for recipient in recipients:
            if self.add(recipient):
                added += 1
        return added

    def add_manual(
        self,
        username: Optional[str] = None,
        first_name: str = "",
        last_name: str = "",
        phone: Optional[str] = None,
    ) -> bool:
        return self.add(
            Recipient(
                username=username,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                source="manual",
            )
        )

    def add_from_csv(
        self, content: str, column_map: Optional[Mapping[str, str]] = None
    ) -> int:
        return self.add_many(parse_recipients_csv(content, column_map))

    def add_from_audience(self, rows: Iterable[Mapping[str, object]]) -> int:
        """Add recipients from collected-audience rows.

        Each row may carry ``username``, ``first_name``, ``last_name`` and
        ``phone`` keys (extra keys are ignored).
        """
        recipients = [
            Recipient(
                username=row.get("username"),  # type: ignore[arg-type]
                first_name=str(row.get("first_name", "") or ""),
                last_name=str(row.get("last_name", "") or ""),
                phone=row.get("phone"),  # type: ignore[arg-type]
                source="audience",
            )
            for row in rows
        ]
        return self.add_many(recipients)

    def pending(self) -> List[Recipient]:
        return [r for r in self._recipients if r.status == STATUS_PENDING]

    def failed(self) -> List[Recipient]:
        return [r for r in self._recipients if r.status == STATUS_FAILED]

    def sent(self) -> List[Recipient]:
        return [r for r in self._recipients if r.status == STATUS_SENT]

    def reset_failed(self) -> int:
        """Move all failed recipients back to pending. Returns how many."""
        count = 0
        for recipient in self._recipients:
            if recipient.status == STATUS_FAILED:
                recipient.status = STATUS_PENDING
                recipient.error_message = None
                count += 1
        return count

    def stats(self) -> Dict[str, int]:
        return {
            "total": len(self._recipients),
            "pending": len(self.pending()),
            "sent": len(self.sent()),
            "failed": len(self.failed()),
        }

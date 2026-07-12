"""
Reusable message templates with variable substitution.

A template is text containing ``{variable}`` placeholders (for example
``Hi {first_name}!``). At send time the placeholders are filled from a
per-recipient context. Substitution is deliberately compatible with the
spintax syntax in :mod:`src.spintax`: only bare-identifier placeholders such
as ``{first_name}`` are substituted, while spintax groups like ``{a|b|c}``
(which contain a ``|``) are left untouched. The intended pipeline is
``substitute(...)`` first, then spintax ``process(...)``.

Templates are persisted as JSON so the store matches the rest of the project's
file-based config approach (see :class:`src.Config.ConfigManager`).
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Callable, Dict, List, Mapping, Optional

logger = logging.getLogger(__name__)

# A placeholder is a single bare identifier wrapped in braces: {first_name}.
# The lack of a ``|`` means spintax groups are never matched here.
_VARIABLE_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


def extract_variables(text: str) -> List[str]:
    """Return the distinct ``{variable}`` names used in ``text`` (in order)."""
    if not text or not isinstance(text, str):
        return []
    seen: List[str] = []
    for name in _VARIABLE_RE.findall(text):
        if name not in seen:
            seen.append(name)
    return seen


def substitute(
    text: str,
    context: Optional[Mapping[str, object]] = None,
    *,
    keep_unknown: bool = True,
) -> str:
    """Fill ``{variable}`` placeholders in ``text`` from ``context``.

    Args:
        text: The template text.
        context: Mapping of variable name -> replacement value.
        keep_unknown: When True (default), placeholders with no matching key
            are left verbatim. When False they are replaced with an empty
            string.

    Returns:
        The substituted text. Spintax groups (containing ``|``) are untouched.
    """
    if not text or not isinstance(text, str):
        return ""
    ctx = context or {}

    def _replace(match: "re.Match[str]") -> str:
        name = match.group(1)
        if name in ctx:
            value = ctx[name]
            return "" if value is None else str(value)
        return match.group(0) if keep_unknown else ""

    return _VARIABLE_RE.sub(_replace, text)


class MessageTemplate:
    """A named, reusable message template."""

    def __init__(
        self,
        template_id: str,
        name: str,
        content: str,
        category: str = "general",
        created_at: Optional[str] = None,
        updated_at: Optional[str] = None,
    ) -> None:
        self.id = template_id
        self.name = name
        self.content = content
        self.category = category
        self.created_at = created_at
        self.updated_at = updated_at

    @property
    def variables(self) -> List[str]:
        """Variable names the template expects (derived from its content)."""
        return extract_variables(self.content)

    def render(
        self,
        context: Optional[Mapping[str, object]] = None,
        *,
        keep_unknown: bool = True,
    ) -> str:
        """Substitute ``context`` into the template content."""
        return substitute(self.content, context, keep_unknown=keep_unknown)

    def to_dict(self) -> Dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "content": self.content,
            "category": self.category,
            "variables": self.variables,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, object]) -> "MessageTemplate":
        return cls(
            template_id=str(data["id"]),
            name=str(data.get("name", "")),
            content=str(data.get("content", "")),
            category=str(data.get("category", "general")),
            created_at=data.get("created_at"),  # type: ignore[arg-type]
            updated_at=data.get("updated_at"),  # type: ignore[arg-type]
        )


class TemplateStore:
    """JSON-backed CRUD store for :class:`MessageTemplate` objects."""

    def __init__(
        self,
        path: str,
        now_func: Callable[[], str] = lambda: datetime.now(timezone.utc).isoformat(),
    ) -> None:
        self.path = path
        self._now = now_func
        self._templates: Dict[str, MessageTemplate] = {}
        self._next_id = 1
        self._load()

    def _load(self) -> None:
        if not os.path.exists(self.path):
            return
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Could not load templates from %s: %s", self.path, exc)
            return
        for item in data.get("templates", []):
            template = MessageTemplate.from_dict(item)
            self._templates[template.id] = template
            try:
                self._next_id = max(self._next_id, int(template.id) + 1)
            except (TypeError, ValueError):
                pass

    def _save(self) -> None:
        payload = {"templates": [t.to_dict() for t in self._templates.values()]}
        directory = os.path.dirname(self.path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)

    def create(
        self, name: str, content: str, category: str = "general"
    ) -> MessageTemplate:
        """Create and persist a new template. Returns it with an assigned id."""
        template_id = str(self._next_id)
        self._next_id += 1
        stamp = self._now()
        template = MessageTemplate(
            template_id=template_id,
            name=name,
            content=content,
            category=category,
            created_at=stamp,
            updated_at=stamp,
        )
        self._templates[template_id] = template
        self._save()
        return template

    def get(self, template_id: str) -> Optional[MessageTemplate]:
        return self._templates.get(str(template_id))

    def list(self, category: Optional[str] = None) -> List[MessageTemplate]:
        templates = list(self._templates.values())
        if category is not None:
            templates = [t for t in templates if t.category == category]
        return templates

    def update(
        self,
        template_id: str,
        *,
        name: Optional[str] = None,
        content: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Optional[MessageTemplate]:
        """Update fields on an existing template. Returns None if not found."""
        template = self._templates.get(str(template_id))
        if template is None:
            return None
        if name is not None:
            template.name = name
        if content is not None:
            template.content = content
        if category is not None:
            template.category = category
        template.updated_at = self._now()
        self._save()
        return template

    def delete(self, template_id: str) -> bool:
        """Delete a template. Returns True if it existed."""
        if str(template_id) in self._templates:
            del self._templates[str(template_id)]
            self._save()
            return True
        return False

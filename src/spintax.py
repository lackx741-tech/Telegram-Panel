"""
Spintax processing for message variation.

Spintax lets a single message template expand into many randomized variants
using the ``{option1|option2|option3}`` syntax. Selecting a fresh variant per
send helps avoid multiple accounts sending byte-identical text, which is a
common spam signal.

This module is intentionally self-contained (pure logic, no Telethon / network
dependency) so it can be unit-tested in isolation and reused from the bot,
CLI, and campaign flows alike.

Nested spintax (a pattern inside another pattern) is deliberately *not*
supported: it is reported as invalid by :meth:`SpintaxProcessor.validate`
rather than silently mis-expanded.
"""
from __future__ import annotations

import logging
import random
import re
from typing import List, NamedTuple, Optional

logger = logging.getLogger(__name__)

# Matches a single flat ``{...}`` group with no nested braces inside it.
_PATTERN_RE = re.compile(r"\{[^{}]*\}")


class SpintaxResult(NamedTuple):
    """Outcome of expanding a spintax template.

    Attributes:
        text: The rendered text with one variant chosen per pattern.
        variables_used: Distinct variant strings that appeared across all
            patterns (order-preserving, de-duplicated).
        variants_count: Total number of distinct texts the template could
            produce (product of the variant count of each pattern).
    """

    text: str
    variables_used: List[str]
    variants_count: int


class SpintaxValidation(NamedTuple):
    """Result of validating a spintax template."""

    valid: bool
    errors: List[str]
    warnings: List[str]
    patterns_count: int
    variants_count: int


class SpintaxProcessor:
    """Parse and expand ``{a|b|c}`` spintax templates.

    An optional integer ``seed`` makes variant selection deterministic, which
    is useful for reproducible previews and tests. Without a seed the module's
    shared :mod:`random` generator is used.
    """

    def __init__(self, seed: Optional[int] = None) -> None:
        self._rng = random.Random(seed) if seed is not None else random

    @staticmethod
    def _split_by_pipe(content: str) -> List[str]:
        """Split the inside of a pattern on top-level ``|`` characters.

        A brace counter is tracked so that pipes belonging to a nested group
        are not treated as separators. (Nested groups are invalid, but the
        splitter stays robust so validation can report them cleanly.)
        """
        parts: List[str] = []
        current: List[str] = []
        brace_count = 0

        for char in content:
            if char == "{":
                brace_count += 1
                current.append(char)
            elif char == "}":
                brace_count -= 1
                current.append(char)
            elif char == "|" and brace_count == 0:
                parts.append("".join(current))
                current = []
            else:
                current.append(char)

        parts.append("".join(current))
        return parts

    def process(self, text: str) -> SpintaxResult:
        """Expand ``text``, choosing one variant per pattern.

        Args:
            text: The spintax template.

        Returns:
            A :class:`SpintaxResult`. Empty / non-string input yields an empty
            result with ``variants_count`` of 0. Text with no patterns is
            returned verbatim with ``variants_count`` of 1.
        """
        if not text or not isinstance(text, str):
            return SpintaxResult(text="", variables_used=[], variants_count=0)

        patterns = _PATTERN_RE.findall(text)
        if not patterns:
            return SpintaxResult(text=text, variables_used=[], variants_count=1)

        result = text
        variables_used: List[str] = []
        variants_count = 1

        for pattern in patterns:
            inner = pattern[1:-1]  # strip the surrounding braces
            variants = [v.strip() for v in self._split_by_pipe(inner)]
            if not variants:
                continue

            for variant in variants:
                if variant and variant not in variables_used:
                    variables_used.append(variant)

            variants_count *= len(variants)
            selected = self._rng.choice(variants)
            # Replace only this occurrence so identical patterns can each get
            # their own independent choice.
            result = result.replace(pattern, selected, 1)

        return SpintaxResult(
            text=result,
            variables_used=variables_used,
            variants_count=variants_count,
        )

    def validate(self, text: str) -> SpintaxValidation:
        """Check ``text`` for spintax problems without expanding for output.

        Detects unmatched braces, empty variants, and nested patterns. Nested
        patterns are reported in both ``errors`` and ``warnings`` so callers
        that only surface warnings still tell the user.
        """
        errors: List[str] = []
        warnings: List[str] = []

        if not text or not isinstance(text, str):
            return SpintaxValidation(
                valid=True, errors=[], warnings=[], patterns_count=0, variants_count=0
            )

        open_count = text.count("{")
        close_count = text.count("}")
        if open_count != close_count:
            errors.append(
                f"Unmatched braces: {open_count} open, {close_count} close"
            )

        # Detect nesting by walking the string and tracking brace depth.
        depth = 0
        nested_detected = False
        for char in text:
            if char == "{":
                depth += 1
                if depth > 1:
                    nested_detected = True
            elif char == "}":
                depth = max(0, depth - 1)
        if nested_detected:
            errors.append("Nested spintax not supported")
            warnings.append("Nested spintax not supported")

        patterns = _PATTERN_RE.findall(text)
        for pattern in patterns:
            inner = pattern[1:-1]
            variants = [v.strip() for v in self._split_by_pipe(inner)]
            if not variants:
                errors.append(f"Empty variant in pattern: {pattern}")
                continue
            if any(v == "" for v in variants):
                errors.append(f"Empty variant in pattern: {pattern}")

        variants_count = self.process(text).variants_count

        return SpintaxValidation(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            patterns_count=len(patterns),
            variants_count=variants_count,
        )

    def get_preview_samples(self, text: str, count: int = 10) -> List[str]:
        """Return ``count`` expanded samples of ``text``.

        Each sample is an independent :meth:`process` call, so seeded
        processors produce a reproducible sequence while unseeded ones vary.
        """
        if count <= 0:
            return []
        return [self.process(text).text for _ in range(count)]


# Shared, unseeded singleton for callers that do not need reproducibility.
spintax_processor = SpintaxProcessor()

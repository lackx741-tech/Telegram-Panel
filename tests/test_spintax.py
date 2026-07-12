"""
Unit tests for the SpintaxProcessor.
"""
import pytest

from src.spintax import SpintaxProcessor, spintax_processor


class TestSpintaxProcess:
    """Tests for SpintaxProcessor.process()"""

    def test_simple_spintax(self):
        processor = SpintaxProcessor()
        result = processor.process("Hello {John|Jane|User}")
        assert result.text in ("Hello John", "Hello Jane", "Hello User")
        assert result.variants_count == 3
        assert len(result.variables_used) == 3
        assert set(result.variables_used) == {"John", "Jane", "User"}

    def test_multiple_spintax(self):
        processor = SpintaxProcessor()
        result = processor.process(
            "Hello {John|Jane}, welcome to {our|the} service!"
        )
        assert result.variants_count == 4
        assert result.text.startswith("Hello ")
        assert result.text.endswith(" service!")

    def test_no_spintax(self):
        processor = SpintaxProcessor()
        result = processor.process("Hello World")
        assert result.text == "Hello World"
        assert result.variants_count == 1
        assert result.variables_used == []

    def test_empty_input(self):
        processor = SpintaxProcessor()
        result = processor.process("")
        assert result.text == ""
        assert result.variants_count == 0
        assert result.variables_used == []

    def test_non_string_input(self):
        processor = SpintaxProcessor()
        result = processor.process(None)  # type: ignore[arg-type]
        assert result.text == ""
        assert result.variants_count == 0

    def test_repeated_pattern_counts_each(self):
        processor = SpintaxProcessor()
        result = processor.process("{a|b} and {a|b}")
        # Two independent 2-variant patterns -> 4 combinations.
        assert result.variants_count == 4

    def test_singleton_available(self):
        result = spintax_processor.process("Hi {there|world}")
        assert result.text in ("Hi there", "Hi world")


class TestSpintaxValidate:
    """Tests for SpintaxProcessor.validate()"""

    def test_valid_template(self):
        processor = SpintaxProcessor()
        validation = processor.validate("Hello {John|Jane|User}")
        assert validation.valid is True
        assert validation.errors == []
        assert validation.patterns_count == 1
        assert validation.variants_count == 3

    def test_nested_spintax_warning(self):
        processor = SpintaxProcessor()
        validation = processor.validate("Hello {John|{Jane|User}}")
        assert validation.valid is False
        assert any("Nested spintax not supported" in w for w in validation.warnings)
        assert any("Nested spintax not supported" in e for e in validation.errors)

    def test_empty_variant(self):
        processor = SpintaxProcessor()
        validation = processor.validate("Hello {|Jane|User}")
        assert validation.valid is False
        assert any("Empty variant" in e for e in validation.errors)

    def test_unmatched_braces(self):
        processor = SpintaxProcessor()
        validation = processor.validate("Hello {John|Jane")
        assert validation.valid is False
        assert any("Unmatched braces" in e for e in validation.errors)

    def test_no_spintax_is_valid(self):
        processor = SpintaxProcessor()
        validation = processor.validate("Just plain text")
        assert validation.valid is True
        assert validation.patterns_count == 0


class TestSpintaxPreview:
    """Tests for SpintaxProcessor.get_preview_samples()"""

    def test_preview_samples_count(self):
        processor = SpintaxProcessor()
        samples = processor.get_preview_samples("Hello {John|Jane|User}", 5)
        assert len(samples) == 5
        for sample in samples:
            assert sample.startswith("Hello ")
            assert sample.split(" ", 1)[1] in ("John", "Jane", "User")

    def test_preview_zero_count(self):
        processor = SpintaxProcessor()
        assert processor.get_preview_samples("Hello {a|b}", 0) == []


class TestSpintaxSeed:
    """Reproducibility with a fixed seed."""

    def test_seed_reproducibility(self):
        a = SpintaxProcessor(seed=42)
        b = SpintaxProcessor(seed=42)
        text = "Hello {John|Jane|User}, welcome to {our|the} service!"
        assert a.process(text).text == b.process(text).text

    def test_seed_preview_reproducibility(self):
        a = SpintaxProcessor(seed=7)
        b = SpintaxProcessor(seed=7)
        assert a.get_preview_samples("{a|b|c|d}", 6) == b.get_preview_samples(
            "{a|b|c|d}", 6
        )

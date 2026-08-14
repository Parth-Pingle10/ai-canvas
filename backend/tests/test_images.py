from __future__ import annotations

import base64

import pytest

from app.images import InvalidImageError, decode_and_validate_image
from tests.conftest import make_test_png


def test_decode_valid_png():
    b64 = base64.b64encode(make_test_png(64, 48)).decode()
    img = decode_and_validate_image(
        b64, declared_format="png", max_bytes=8_000_000, min_dimension=8, max_dimension=4096
    )
    assert img.width == 64
    assert img.height == 48
    assert img.mime == "image/png"


def test_rejects_invalid_base64():
    with pytest.raises(InvalidImageError):
        decode_and_validate_image(
            "!!!not base64!!!", declared_format="png", max_bytes=8_000_000, min_dimension=8, max_dimension=4096
        )


def test_rejects_format_mismatch():
    b64 = base64.b64encode(make_test_png(64, 48)).decode()
    with pytest.raises(InvalidImageError):
        decode_and_validate_image(
            b64, declared_format="webp", max_bytes=8_000_000, min_dimension=8, max_dimension=4096
        )


def test_rejects_oversized_payload():
    b64 = base64.b64encode(make_test_png(64, 48)).decode()
    with pytest.raises(InvalidImageError):
        decode_and_validate_image(
            b64, declared_format="png", max_bytes=10, min_dimension=8, max_dimension=4096
        )


def test_rejects_dimension_below_minimum():
    b64 = base64.b64encode(make_test_png(4, 4)).decode()
    with pytest.raises(InvalidImageError):
        decode_and_validate_image(
            b64, declared_format="png", max_bytes=8_000_000, min_dimension=8, max_dimension=4096
        )


def test_rejects_dimension_above_maximum():
    b64 = base64.b64encode(make_test_png(64, 48)).decode()
    with pytest.raises(InvalidImageError):
        decode_and_validate_image(
            b64, declared_format="png", max_bytes=8_000_000, min_dimension=8, max_dimension=32
        )


def test_rejects_empty_payload():
    with pytest.raises(InvalidImageError):
        decode_and_validate_image(
            "", declared_format="png", max_bytes=8_000_000, min_dimension=8, max_dimension=4096
        )

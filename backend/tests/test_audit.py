"""Tests du hash d'audit (intégrité, déterminisme)."""

from __future__ import annotations

from app.audit import payload_hash


def test_hash_is_order_independent() -> None:
    assert payload_hash({"a": 1, "b": 2}) == payload_hash({"b": 2, "a": 1})


def test_hash_length_is_sha256() -> None:
    assert len(payload_hash({"x": 1})) == 64


def test_hash_differs_on_change() -> None:
    assert payload_hash({"a": 1}) != payload_hash({"a": 2})


def test_hash_none_is_stable() -> None:
    assert payload_hash(None) == payload_hash({})

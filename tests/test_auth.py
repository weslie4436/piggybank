"""Tests for PiggyBank PIN and token auth primitives."""

from __future__ import annotations

import re
import unittest

from piggybank.auth import hash_pin, new_token, token_hash, verify_pin

SCRYPT_PATTERN = re.compile(
    r"^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$"
)


class TestPinHash(unittest.TestCase):
    def test_hash_and_verify_correct_pin(self):
        encoded = hash_pin("123456")
        self.assertTrue(verify_pin("123456", encoded))

    def test_verify_rejects_wrong_pin(self):
        encoded = hash_pin("123456")
        self.assertFalse(verify_pin("654321", encoded))

    def test_hash_rejects_non_six_digit_pin(self):
        with self.assertRaises(ValueError):
            hash_pin("12345")
        with self.assertRaises(ValueError):
            hash_pin("1234567")
        with self.assertRaises(ValueError):
            hash_pin("12a456")

    def test_unicode_digits_are_rejected_as_non_ascii(self):
        with self.assertRaisesRegex(
            ValueError,
            "PIN must be exactly six ASCII digits",
        ):
            hash_pin("１２３４５６")
        self.assertFalse(verify_pin("１２３４５６", hash_pin("123456")))

    def test_verify_rejects_invalid_pin_and_malformed_encoded(self):
        encoded = hash_pin("123456")
        self.assertFalse(verify_pin("12345", encoded))
        self.assertFalse(verify_pin("123456", "not-a-valid-encoding"))
        self.assertFalse(verify_pin("123456", "scrypt$bad"))

    def test_hash_uses_unique_salt_each_call(self):
        first = hash_pin("123456")
        second = hash_pin("123456")
        self.assertNotEqual(first, second)
        self.assertTrue(SCRYPT_PATTERN.match(first))
        self.assertTrue(SCRYPT_PATTERN.match(second))


class TestToken(unittest.TestCase):
    def test_new_token_is_long_and_unique(self):
        first = new_token()
        second = new_token()
        self.assertGreaterEqual(len(first), 32)
        self.assertNotEqual(first, second)

    def test_token_hash_is_stable_and_hides_plaintext(self):
        token = "sample-token-value"
        digest = token_hash(token)
        self.assertEqual(digest, token_hash(token))
        self.assertEqual(len(digest), 64)
        self.assertNotIn(token, digest)
        self.assertTrue(all(ch in "0123456789abcdef" for ch in digest))

    def test_token_hash_rejects_empty_token(self):
        with self.assertRaises(ValueError):
            token_hash("")


if __name__ == "__main__":
    unittest.main()

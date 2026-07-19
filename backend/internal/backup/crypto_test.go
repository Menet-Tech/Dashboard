package backup_test

import (
	"bytes"
	"fmt"
	"testing"

	"menettech/dashboard/backend/internal/backup"
)

func TestCrypto_EncryptDecrypt(t *testing.T) {
	plaintext := []byte("hello world this is a test backup payload with some secret info")
	password := "my-secure-backup-password-123!"

	t.Run("Encrypt and decrypt success", func(t *testing.T) {
		ciphertext, err := backup.EncryptAES256CBC(plaintext, password)
		if err != nil {
			t.Fatalf("failed to encrypt: %v", err)
		}

		if len(ciphertext) < 16 {
			t.Fatal("ciphertext is too short")
		}

		decrypted, err := backup.DecryptAES256CBC(ciphertext, password)
		if err != nil {
			t.Fatalf("failed to decrypt: %v", err)
		}

		if !bytes.Equal(plaintext, decrypted) {
			t.Errorf("expected decrypted %s, got %s", plaintext, decrypted)
		}
	})

	t.Run("Decrypt fails with wrong password", func(t *testing.T) {
		// Run a few times with different wrong passwords to avoid 1/256 PKCS7 padding collision flake
		for i := 0; i < 5; i++ {
			ciphertext, err := backup.EncryptAES256CBC(plaintext, password)
			if err != nil {
				t.Fatalf("failed to encrypt: %v", err)
			}

			_, err = backup.DecryptAES256CBC(ciphertext, fmt.Sprintf("wrong-password-%d", i))
			if err != nil {
				return // Success: failed as expected
			}
		}
		t.Fatal("expected error with wrong password across multiple trials, got nil")
	})

	t.Run("Decrypt fails with empty password", func(t *testing.T) {
		_, err := backup.EncryptAES256CBC(plaintext, "")
		if err == nil {
			t.Fatal("expected error with empty encryption password, got nil")
		}
	})

	t.Run("Decrypt fails with invalid data structure", func(t *testing.T) {
		_, err := backup.DecryptAES256CBC([]byte("too-short"), password)
		if err == nil {
			t.Fatal("expected error for data too short, got nil")
		}

		badMagic := []byte("BadMagic__salt1234ciphertext")
		_, err = backup.DecryptAES256CBC(badMagic, password)
		if err == nil {
			t.Fatal("expected error for bad magic header, got nil")
		}
	})
}

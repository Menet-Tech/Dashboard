package backup

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/pbkdf2"
)

const (
	SaltedMagic      = "Salted__"
	PBKDF2Iterations = 10000
)

// EncryptAES256CBC encrypts the plaintext with a password using OpenSSL-compatible PBKDF2 AES-256-CBC.
func EncryptAES256CBC(plaintext []byte, password string) ([]byte, error) {
	if password == "" {
		return nil, errors.New("encryption password cannot be empty")
	}

	// 1. Generate 8-byte random salt
	salt := make([]byte, 8)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, fmt.Errorf("generate salt: %w", err)
	}

	// 2. Derive key (32 bytes) and IV (16 bytes) using PBKDF2 with SHA-256
	derived := pbkdf2.Key([]byte(password), salt, PBKDF2Iterations, 32+16, sha256.New)
	key := derived[:32]
	iv := derived[32:]

	// 3. Apply PKCS7 padding to plaintext
	padded := pkcs7Pad(plaintext, aes.BlockSize)

	// 4. Encrypt with AES-CBC
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher block: %w", err)
	}

	ciphertext := make([]byte, len(padded))
	mode := cipher.NewCBCEncrypter(block, iv)
	mode.CryptBlocks(ciphertext, padded)

	// 5. Build output: "Salted__" + salt + ciphertext
	out := make([]byte, 0, len(SaltedMagic)+len(salt)+len(ciphertext))
	out = append(out, []byte(SaltedMagic)...)
	out = append(out, salt...)
	out = append(out, ciphertext...)

	return out, nil
}

// DecryptAES256CBC decrypts the ciphertext with a password using OpenSSL-compatible PBKDF2 AES-256-CBC.
func DecryptAES256CBC(data []byte, password string) ([]byte, error) {
	if len(data) < 16 {
		return nil, errors.New("data too short")
	}
	if string(data[:8]) != SaltedMagic {
		return nil, errors.New("invalid magic header")
	}

	salt := data[8:16]
	ciphertext := data[16:]

	// Derive key and IV
	derived := pbkdf2.Key([]byte(password), salt, PBKDF2Iterations, 32+16, sha256.New)
	key := derived[:32]
	iv := derived[32:]

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	if len(ciphertext)%aes.BlockSize != 0 {
		return nil, errors.New("ciphertext block size is invalid")
	}

	decrypted := make([]byte, len(ciphertext))
	mode := cipher.NewCBCDecrypter(block, iv)
	mode.CryptBlocks(decrypted, ciphertext)

	// Unpad PKCS7
	unpadded, err := pkcs7Unpad(decrypted, aes.BlockSize)
	if err != nil {
		return nil, fmt.Errorf("unpad plaintext: %w", err)
	}

	return unpadded, nil
}

func pkcs7Pad(data []byte, blockSize int) []byte {
	padding := blockSize - (len(data) % blockSize)
	padText := make([]byte, padding)
	for i := range padText {
		padText[i] = byte(padding)
	}
	return append(data, padText...)
}

func pkcs7Unpad(data []byte, blockSize int) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("empty data")
	}
	if len(data)%blockSize != 0 {
		return nil, errors.New("invalid block size")
	}
	padding := int(data[len(data)-1])
	if padding < 1 || padding > blockSize {
		return nil, errors.New("invalid padding value")
	}
	for i := len(data) - padding; i < len(data); i++ {
		if int(data[i]) != padding {
			return nil, errors.New("padding mismatch")
		}
	}
	return data[:len(data)-padding], nil
}

package main

import (
	"archive/zip"
	"bytes"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"menettech/dashboard/backend/internal/backup"
)

func main() {
	inPath := flag.String("in", "", "Path ke file backup (.zip atau .enc)")
	outDir := flag.String("out", "", "Path ke folder output hasil dekripsi (opsional)")
	passwordFlag := flag.String("password", "", "Password dekripsi (opsional, jika kosong akan ditanyakan)")
	flag.Parse()

	if *inPath == "" {
		fmt.Println("=====================================================================")
		fmt.Println("                 MENET-TECH BACKUP DECRYPTION TOOL                   ")
		fmt.Println("=====================================================================")
		fmt.Println("Penggunaan:")
		flag.Usage()
		os.Exit(1)
	}

	// Read input file
	data, err := os.ReadFile(*inPath)
	if err != nil {
		fmt.Printf("Error: Gagal membaca file input: %v\n", err)
		os.Exit(1)
	}

	// Get password
	password := *passwordFlag
	if password == "" {
		fmt.Print("Masukkan password dekripsi backup: ")
		_, err := fmt.Scanln(&password)
		if err != nil || password == "" {
			fmt.Println("Error: Password tidak boleh kosong.")
			os.Exit(1)
		}
	}

	// Resolve output directory
	outputDir := *outDir
	if outputDir == "" {
		outputDir = filepath.Dir(*inPath)
	}
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		fmt.Printf("Error: Gagal membuat folder output: %v\n", err)
		os.Exit(1)
	}

	// 1. Is it a legacy encrypted file at the root?
	if len(data) >= 8 && string(data[:8]) == backup.SaltedMagic {
		fmt.Println("Mendeteksi file backup terenkripsi root (format lama). Mendekripsi...")
		decrypted, err := backup.DecryptAES256CBC(data, password)
		if err != nil {
			fmt.Printf("Error: Gagal mendekripsi: %v. Pastikan password benar.\n", err)
			os.Exit(1)
		}
		data = decrypted
	}

	// 2. Is it a ZIP archive?
	if len(data) >= 4 && string(data[:4]) == "PK\x03\x04" {
		fmt.Println("Mendeteksi berkas ZIP. Mengekstrak dan mendekripsi isi ZIP...")
		reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			fmt.Printf("Error: Gagal membaca berkas ZIP: %v\n", err)
			os.Exit(1)
		}

		for _, f := range reader.File {
			rc, err := f.Open()
			if err != nil {
				fmt.Printf("Error: Gagal membuka file %s di dalam ZIP: %v\n", f.Name, err)
				continue
			}
			fileBytes, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				fmt.Printf("Error: Gagal membaca file %s di dalam ZIP: %v\n", f.Name, err)
				continue
			}

			var finalBytes []byte
			var finalName string

			if strings.HasSuffix(f.Name, ".enc") {
				fmt.Printf(" -> Mendekripsi file: %s...\n", f.Name)
				dec, err := backup.DecryptAES256CBC(fileBytes, password)
				if err != nil {
					fmt.Printf("    Warning: Gagal mendekripsi %s: %v. Menyimpan file asli.\n", f.Name, err)
					finalBytes = fileBytes
					finalName = f.Name
				} else {
					finalBytes = dec
					finalName = strings.TrimSuffix(f.Name, ".enc")
				}
			} else {
				fmt.Printf(" -> Mengekstrak file: %s...\n", f.Name)
				finalBytes = fileBytes
				finalName = f.Name
			}

			destPath := filepath.Join(outputDir, finalName)
			if err := os.WriteFile(destPath, finalBytes, 0644); err != nil {
				fmt.Printf("Error: Gagal menulis file hasil ekstraksi %s: %v\n", destPath, err)
			} else {
				fmt.Printf("    Sukses menulis: %s\n", destPath)
			}
		}
		fmt.Println("\nProses dekripsi dan ekstraksi ZIP selesai!")
		return
	}

	// 3. Is it a raw SQLite database?
	if len(data) >= 16 && string(data[:16]) == "SQLite format 3\x00" {
		fmt.Println("Mendeteksi file database SQLite plain. Menulis ke folder output...")
		destPath := filepath.Join(outputDir, "extracted_dashboard.db")
		if err := os.WriteFile(destPath, data, 0644); err != nil {
			fmt.Printf("Error: Gagal menulis database: %v\n", err)
		} else {
			fmt.Printf("    Sukses menulis: %s\n", destPath)
		}
		return
	}

	fmt.Println("Error: Format file tidak dikenal.")
	os.Exit(1)
}

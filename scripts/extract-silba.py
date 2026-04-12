#!/usr/bin/env python3
import pdfplumber
import sys
import os

pdf_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'public', 'reference', 'The Silba _Story_ Framework - Silba.pdf')

try:
    with pdfplumber.open(pdf_path) as pdf:
        print(f"Total pages: {len(pdf.pages)}\n")
        print("=" * 80)

        for i, page in enumerate(pdf.pages, 1):
            print(f"\n--- PAGE {i} ---\n")
            text = page.extract_text()
            if text:
                print(text)
            else:
                print("[No text found on this page]")
            print("\n" + "=" * 80)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)

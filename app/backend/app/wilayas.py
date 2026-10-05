"""Versioned official national directory, shared with the frontend.
Law 26-06 (JO 25/2026) and Presidential Decree 26-206 (JO 40/2026).
Codes 53/54 denote In Salah/In Guezzam respectively.
"""
import json
from pathlib import Path
WILAYAS: list[dict] = json.loads((Path(__file__).resolve().parents[2] / "reference" / "wilayas.json").read_text())
VERSION = "DZ-26-06-26-206-v1"
SOURCES = ["https://www.joradp.dz/FTP/jo-francais/2026/F2026025.pdf", "https://www.joradp.dz/FTP/jo-francais/2026/F2026040.pdf"]

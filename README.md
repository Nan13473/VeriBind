# VeriBind

VeriBind is a fixture-driven credential demo with three trust phases: source-derived identity registration, institution issuance with a Merkle root and encrypted CID, and selective field verification.

## Run

```powershell
npm install
npm run compile
npm test
npm run frontend
```

## Python virtual environment

The project-local Python environment is available at `.venv`. The current app
uses Node.js for Hardhat and Vite, so no Python packages are required yet.

```powershell
# Activate in PowerShell
.\.venv\Scripts\Activate.ps1

# Confirm the environment
python --version
python -c "import sys; print(sys.executable)"

# Leave the environment
deactivate
```

The frontend is a self-contained demo shell. Its copy deliberately distinguishes source provenance, chain integrity, issuer approval, recipient confirmation, and field-level proof verification.

## Recipient QR presentation

After the recipient confirms a credential, the **Present** view creates a signed, versioned QR payload from the recipient wallet. The QR contains only the selected field, its Merkle proof, the credential reference, chain/contract binding, nonce, and holder signature. It never contains the full certificate, encrypted file, AES key, or private key.

The verifier can import a QR image or paste its payload in **Verify**. Validation checks the configured network and contract, current credential status, recipient binding, holder signature, issuance digest, expiry, and Merkle proof. Pending, Disputed, expired, malformed, or unavailable live-chain credentials must not render as valid.

Set `VITE_OFFICIAL_CHAIN_ID`, `VITE_VERIBIND_CONTRACT_ADDRESS`, and `VITE_DEMO_RECIPIENT_ADDRESS` before using the live verifier. The current browser demo uses synthetic fixture values and the local Merkle implementation for presentation generation.

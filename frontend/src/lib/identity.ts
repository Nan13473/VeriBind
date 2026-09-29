export type VerifiedIdentity = {
  sourceType: string;
  recordId: string;
  verifiedAt: string;
  adapterVersion: string;
  name: string;
  dateOfBirth: string;
  address: string;
  documentNumber: string;
};

export function canonicalizeIdentity(identity: VerifiedIdentity): string {
  return [
    "veribind-identity-v1",
    identity.name.trim().normalize("NFC"),
    identity.dateOfBirth,
    identity.address.trim().normalize("NFC"),
    identity.documentNumber.trim().normalize("NFC"),
    identity.sourceType,
    identity.recordId,
    identity.verifiedAt,
    identity.adapterVersion,
  ].join("|");
}

export async function computeDocHash(identity: VerifiedIdentity): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeIdentity(identity));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

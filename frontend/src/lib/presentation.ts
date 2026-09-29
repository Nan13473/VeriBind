import { getBytes, keccak256, toUtf8Bytes, verifyMessage, type BrowserProvider } from "ethers";
import { hashField, verifyMerkleProof, type MerkleProof } from "./merkle";

export type Disclosure = {
  fieldName: string;
  fieldValue: string;
  fieldIndex: number;
  merkleProof: MerkleProof;
};

export type VeribindPresentation = {
  type: "veribind-presentation";
  version: 1;
  chainId: number;
  contractAddress: string;
  tokenId: string;
  recipientAddress: string;
  credentialStatus: "Confirmed";
  disclosures: Disclosure[];
  certificateMerkleRoot: string;
  issuanceDigest: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  holderSignature: string;
};

export type PresentationCheck = {
  valid: boolean;
  reason?: string;
  recoveredSigner?: string;
};

export type OnChainPresentationContext = {
  chainId: number;
  contractAddress: string;
  recipientAddress: string;
  tokenId: string;
  status: "Pending" | "Confirmed" | "Disputed";
  certificateMerkleRoot: string;
  issuanceDigest: string;
  issuedAt: number;
  expiresAt: number;
};

export function canonicalPresentationPayload(presentation: Omit<VeribindPresentation, "holderSignature">): string {
  return JSON.stringify({
    type: presentation.type,
    version: presentation.version,
    chainId: presentation.chainId,
    contractAddress: presentation.contractAddress.toLowerCase(),
    tokenId: presentation.tokenId,
    recipientAddress: presentation.recipientAddress.toLowerCase(),
    credentialStatus: presentation.credentialStatus,
    disclosures: presentation.disclosures,
    certificateMerkleRoot: presentation.certificateMerkleRoot,
    issuanceDigest: presentation.issuanceDigest,
    issuedAt: presentation.issuedAt,
    expiresAt: presentation.expiresAt,
    nonce: presentation.nonce,
  });
}

export function presentationDigest(presentation: Omit<VeribindPresentation, "holderSignature">): string {
  return keccak256(toUtf8Bytes(`veribind-presentation-v1|${canonicalPresentationPayload(presentation)}`));
}

export async function signPresentation(
  provider: BrowserProvider,
  payload: Omit<VeribindPresentation, "holderSignature">,
): Promise<VeribindPresentation> {
  const signer = await provider.getSigner();
  const signature = await signer.signMessage(getBytes(presentationDigest(payload)));
  return { ...payload, holderSignature: signature };
}

export async function checkPresentation(
  presentation: VeribindPresentation,
  chain: OnChainPresentationContext,
): Promise<PresentationCheck> {
  if (presentation.type !== "veribind-presentation" || presentation.version !== 1) return { valid: false, reason: "Unsupported presentation schema" };
  if (presentation.chainId !== chain.chainId) return { valid: false, reason: "Wrong network" };
  if (presentation.contractAddress.toLowerCase() !== chain.contractAddress.toLowerCase()) return { valid: false, reason: "Unrecognized contract" };
  if (presentation.tokenId !== chain.tokenId) return { valid: false, reason: "Token ID mismatch" };
  if (chain.status !== "Confirmed") return { valid: false, reason: `Credential is ${chain.status}` };
  if (presentation.recipientAddress.toLowerCase() !== chain.recipientAddress.toLowerCase()) return { valid: false, reason: "Recipient mismatch" };
  if (presentation.certificateMerkleRoot !== chain.certificateMerkleRoot) return { valid: false, reason: "Merkle root mismatch" };
  if (presentation.issuanceDigest !== chain.issuanceDigest) return { valid: false, reason: "Issuance digest mismatch" };
  if (presentation.expiresAt > 0 && presentation.expiresAt < Math.floor(Date.now() / 1000)) return { valid: false, reason: "Presentation expired" };

  const unsigned = { ...presentation };
  delete (unsigned as Partial<VeribindPresentation>).holderSignature;
  const recoveredSigner = verifyMessage(getBytes(presentationDigest(unsigned)), presentation.holderSignature);
  if (recoveredSigner.toLowerCase() !== presentation.recipientAddress.toLowerCase()) return { valid: false, reason: "Invalid holder signature", recoveredSigner };

  for (const disclosure of presentation.disclosures) {
    const leaf = await hashField(1, disclosure.fieldName, disclosure.fieldValue);
    const proofOk = await verifyMerkleProof(leaf, disclosure.merkleProof, chain.certificateMerkleRoot);
    if (!proofOk) return { valid: false, reason: `Merkle proof failed for ${disclosure.fieldName}`, recoveredSigner };
  }
  return { valid: true, recoveredSigner };
}

export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

import { useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { buildMerkleProof, buildMerkleRoot, hashField } from "./lib/merkle";
import { checkPresentation, randomNonce, signPresentation, type VeribindPresentation } from "./lib/presentation";

type View = "identity" | "institution" | "holder" | "presentation" | "verify" | "debug";
type Status = "Pending" | "Confirmed" | "Disputed";
type Role = "holder" | "issuer" | "verifier";

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string }) => Promise<unknown> };
  }
}

const fields = [
  ["Name", "Ananya Rao"],
  ["Credential", "Bachelor of Computer Science"],
  ["Institution", "Northstar Institute of Technology"],
  ["Issued", "14 September 2026"],
];

function App() {
  const [session, setSession] = useState<{
    role: Role;
    address: string;
  } | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [view, setView] = useState<View>("identity");
  const [registered, setRegistered] = useState(false);
  const [approved, setApproved] = useState(3);
  const [minted, setMinted] = useState(false);
  const [status, setStatus] = useState<Status>("Pending");
  const [field, setField] = useState("Credential");
  const [proofRequested, setProofRequested] = useState(false);
  const [proofSent, setProofSent] = useState(false);
  const [proofDenied, setProofDenied] = useState(false);

  if (!session)
    return (
      <WalletLogin
        onConnect={(role, address) => {
          setSession({ role, address });
          setView(
            role === "holder"
              ? "identity"
              : role === "issuer"
              ? "institution"
              : "verify"
          );
        }}
      />
    );

  const allNav: [View, string, string][] = [
    ["identity", "Identity", "01"],
    ["institution", "Issue", "02"],
    ["holder", "Review", "03"],
    ["presentation", "Present", "04"],
    ["verify", "Verify", "05"],
    ["debug", "Debug", "06"],
  ];
  const nav = allNav.filter(
    ([key]) =>
      key === "debug" ||
      (session.role === "holder" && (key === "identity" || key === "holder" || key === "presentation")) ||
      (session.role === "issuer" && key === "institution") ||
      (session.role === "verifier" && key === "verify")
  );
  const title =
    view === "identity"
      ? "Register your identity"
      : view === "institution"
      ? "Issue a credential"
      : view === "holder"
      ? "Review your credential"
      : view === "presentation"
      ? "Create a verification QR"
      : view === "verify"
      ? "Verify a credential"
      : "Flow debugger";
  const eyebrow =
    view === "identity"
      ? "YOUR IDENTITY"
      : view === "institution"
      ? "INSTITUTION"
      : view === "holder"
      ? "YOUR CREDENTIAL"
      : view === "presentation"
      ? "YOUR WALLET"
      : view === "verify"
      ? "PUBLIC CHECK"
      : "DEVELOPER MODE";

  return (
    <div className={`app-shell ${darkMode ? "dark" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">V</span>
          <span>veribind</span>
        </div>
        <nav>
          {nav.map(([key, label, number]) => (
            <button
              className={`nav-item ${view === key ? "active" : ""}`}
              onClick={() => setView(key)}
              key={key}
            >
              <span className="nav-number">{number}</span>
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
          </div>
          <div className="header-meta">
            <span className="chain-pill">
              <span className="green-dot" /> {session.role} ·{" "}
              {shortAddress(session.address)}
            </span>
            <button
              className="theme-button"
              onClick={() => setDarkMode((value) => !value)}
              aria-label="Toggle dark theme"
            >
              {darkMode ? "Light" : "Dark"}
            </button>
            <button className="session-button" onClick={() => setSession(null)}>
              Switch wallet
            </button>
          </div>
        </header>
        {view === "identity" && (
          <Identity
            registered={registered}
            onRegister={() => {
              setRegistered(true);
              setView("holder");
            }}
          />
        )}
        {view === "institution" && (
          <Institution
            registered={registered}
            approved={approved}
            setApproved={setApproved}
            minted={minted}
            setMinted={setMinted}
          />
        )}
        {view === "holder" && (
          <Holder
            minted={minted}
            status={status}
            setStatus={setStatus}
            field={field}
            proofRequested={proofRequested}
            proofSent={proofSent}
            proofDenied={proofDenied}
            setProofSent={setProofSent}
            setProofDenied={setProofDenied}
          />
        )}
        {view === "presentation" && (
          <Presentation
            minted={minted}
            status={status}
            recipientAddress={session.address}
            field={field}
            onWalletConnected={(address) => setSession({ ...session, address })}
          />
        )}
        {view === "verify" && (
          <Verifier
            minted={minted}
            status={status}
            field={field}
            setField={setField}
            proofRequested={proofRequested}
            setProofRequested={setProofRequested}
            proofSent={proofSent}
            setProofSent={setProofSent}
            proofDenied={proofDenied}
            setProofDenied={setProofDenied}
          />
        )}
        {view === "debug" && (
          <Debug
            status={status}
            registered={registered}
            approved={approved}
            minted={minted}
            proofRequested={proofRequested}
            proofSent={proofSent}
            proofDenied={proofDenied}
            field={field}
            walletAddress={session.address}
          />
        )}
      </main>
    </div>
  );
}

function WalletLogin({
  onConnect,
}: {
  onConnect: (role: Role, address: string) => void;
}) {
  const [error, setError] = useState("");
  const connect = async () => {
    setError("");
    if (!window.ethereum) return setError("MetaMask was not detected. Install it or use a fixture wallet for the demo.");
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (accounts[0]) onConnect(roleForAddress(accounts[0]), accounts[0]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet connection was cancelled.");
    }
  };
  return (
    <main className="developer-login">
      <div className="login-mark">V</div>
      <span className="eyebrow">VERIBIND / WALLET ACCESS</span>
      <h1>Connect your wallet</h1>
      <p>
        Your wallet is your login. VeriBind uses the connected address and
        on-chain permissions to load the right workspace.
      </p>
      <button className="primary-action wallet-connect" onClick={connect}>
        Connect MetaMask <span>→</span>
      </button>
      {error && <p className="presentation-error">{error}</p>}
      <div className="demo-wallets">
        <span className="eyebrow">LOCAL FIXTURE WALLETS</span>
        <button onClick={() => onConnect("holder", "0x71B4...a42D")}>
          Holder wallet <small>identity + review</small>
        </button>
        <button onClick={() => onConnect("issuer", "0x1111...1111")}>
          Issuer wallet <small>certificate issuance</small>
        </button>
        <button onClick={() => onConnect("verifier", "0x2222...2222")}>
          Verifier wallet <small>read-only checks</small>
        </button>
      </div>
      <small className="login-note">
        No email, password, or role selector · demo addresses are local fixtures
      </small>
    </main>
  );
}

function roleForAddress(address: string): Role {
  const normalized = address.toLowerCase();
  if (normalized.includes("71b4") || normalized.includes("holder"))
    return "holder";
  if (normalized.includes("1111")) return "issuer";
  return "verifier";
}

function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;
}

function Steps({ active }: { active: number }) {
  return (
    <div className="step-rail">
      {[
        "Source identity",
        "Build certificate",
        "Issuer approval",
        "Mint & review",
      ].map((label, index) => (
        <div
          className={`rail-step ${index < active ? "done" : ""} ${
            index === active ? "current" : ""
          }`}
          key={label}
        >
          <span>{index < active ? "✓" : `0${index + 1}`}</span>
          <label>{label}</label>
        </div>
      ))}
    </div>
  );
}

function Identity({
  registered,
  onRegister,
}: {
  registered: boolean;
  onRegister: () => void;
}) {
  return (
    <div className="workspace">
      <div className="identity-ownership">
        <span className="eyebrow">STEP 01 / USER-OWNED</span>
        <h2>Your identity starts with a verified record</h2>
        <p>
          Choose the record that belongs to you. VeriBind hashes the sourced
          data in your browser, then your wallet signs the registration. The
          institution never registers your identity for you.
        </p>
      </div>
      <div className="content-grid">
        <section className="primary-column">
          <SourceCard />
          <IdentityFields />
          <button
            className="primary-action"
            onClick={onRegister}
            disabled={registered}
          >
            {registered
              ? "Identity registered on DIDRegistry"
              : "Sign & register my identity"}
            <span>→</span>
          </button>
          <p className="helper">
            Only the hash is written on-chain. Your name and source record stay
            private.
          </p>
        </section>
        <aside className="side-panel">
          <PanelTitle title="What happens" eyebrow="YOUR WALLET" />
          <div className="boundary-list">
            <Boundary label="1. Source" value="Verified record" />
            <Boundary label="2. Hash" value="Browser only" />
            <Boundary label="3. Sign" value="Your wallet" />
            <Boundary label="4. Store" value="Address → docHash" />
          </div>
          <div className="panel-callout">
            <span>i</span>
            <p>
              This demo uses synthetic records. Registration proves which hash
              your wallet approved, not that the upstream source is truthful.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SourceCard() {
  return (
    <div className="source-card">
      <div className="source-logo">DL</div>
      <div className="source-copy">
        <strong>DigiLocker fixture</strong>
        <span>Verified source adapter · fixture-v1</span>
        <small>Record DL-DEMO-2048-118 · checked 20 Sep 2026</small>
      </div>
      <span className="verified-badge">✓ verified source</span>
    </div>
  );
}

function IdentityFields() {
  return (
    <div className="identity-preview">
      {fields.slice(0, 2).map(([label, value]) => (
        <div className="data-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      <div className="hash-row">
        <span>Local docHash</span>
        <code>0x8bd4...e91c</code>
        <span className="local-badge">never uploaded</span>
      </div>
    </div>
  );
}

function Institution({
  registered,
  approved,
  setApproved,
  minted,
  setMinted,
}: {
  registered: boolean;
  approved: number;
  setApproved: (value: number) => void;
  minted: boolean;
  setMinted: (value: boolean) => void;
}) {
  return (
    <div className="workspace">
      <Steps active={minted ? 3 : registered ? (approved >= 3 ? 2 : 1) : 0} />
      <div className="content-grid">
        <section className="primary-column">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                PHASE 02 / CERTIFICATE PREPARATION
              </span>
              <h2>Prepare the credential</h2>
            </div>
            <span className="state-tag">
              {registered ? "IDENTITY READY" : "WAITING"}
            </span>
          </div>
          <div className="identity-gate">
            <strong>
              {registered
                ? "Recipient identity is registered"
                : "Waiting for recipient identity"}
            </strong>
            <span>
              {registered
                ? "You can prepare and approve this issuance."
                : "The recipient must complete Identity before you can issue."}
            </span>
          </div>
          <div className="issuance-card simple-package">
            <div className="package-line">
              <div className="file-icon">▧</div>
              <div>
                <strong>ananya-rao-degree.json</strong>
                <span>4 fields · AES-GCM encrypted · IPFS pinned</span>
              </div>
              <code>bafybeig...k2mx</code>
            </div>
            <div className="root-line">
              <span>Certificate Merkle root</span>
              <code>0x6a1f2e8c...d440</code>
              <span className="separate">≠ docHash</span>
            </div>
          </div>
        </section>
        <aside className="side-panel">
          <PanelTitle title="Issuer approval" eyebrow="3 OF 5 REQUIRED" />
          <div className="approval-bar">
            <span style={{ width: `${approved * 20}%` }} />
          </div>
          <div className="issuer-row">
            {["NS", "VK", "PM", "JO", "AL"].map((initials, index) => (
              <button
                key={initials}
                className={`issuer ${index < approved ? "signed" : ""}`}
                onClick={() => setApproved(Math.max(approved, index + 1))}
              >
                <span>{index < approved ? "✓" : initials}</span>
                <small>{index < approved ? "signed" : "awaiting"}</small>
              </button>
            ))}
          </div>
          <button
            className="secondary-action"
            onClick={() => setMinted(true)}
            disabled={!registered || approved < 3 || minted}
          >
            {minted ? "Pending NFT minted" : "Finalize & mint Pending NFT"}
            <span>→</span>
          </button>
          <p className="helper">
            Minting creates Pending status. It is not trusted until the holder
            confirms.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Holder({
  minted,
  status,
  setStatus,
  field,
  proofRequested,
  proofSent,
  proofDenied,
  setProofSent,
  setProofDenied,
}: {
  minted: boolean;
  status: Status;
  setStatus: (value: Status) => void;
  field: string;
  proofRequested: boolean;
  proofSent: boolean;
  proofDenied: boolean;
  setProofSent: (value: boolean) => void;
  setProofDenied: (value: boolean) => void;
}) {
  if (!minted)
    return (
      <Empty
        title="Nothing to review yet"
        text="The institution must register the identity, collect 3 issuer approvals, and mint the Pending credential first."
      />
    );
  if (proofRequested && status === "Confirmed" && !proofSent && !proofDenied)
    return (
      <div className="proof-inbox">
        <span className="eyebrow">NEW REQUEST / FROM VERIFIER</span>
        <h2>Someone is asking for one field</h2>
        <p>
          Share only the selected claim and its Merkle proof. Your document and
          encryption key stay private.
        </p>
        <div className="request-preview">
          <span>Requested field</span>
          <strong>{field}</strong>
          <small>Credential #001 · proof will be generated locally</small>
        </div>
        <div className="proof-decision"><button className="confirm-button" onClick={() => setProofSent(true)}>Share this proof <span>→</span></button><button className="dispute-button" onClick={() => setProofDenied(true)}>Deny request</button></div>
      </div>
    );
  if (status === "Confirmed")
    return <VerifiedCredential field={field} proofRequested={proofRequested} proofSent={proofSent} proofDenied={proofDenied} />;
  return (
    <div className="workspace">
      <div className="status-banner">
        <div>
          <span className="eyebrow">CREDENTIAL #001 / RECIPIENT VIEW</span>
          <h2>Review before you confirm</h2>
          <p>
            The institution issued a credential bound to your registered
            identity. Read the decrypted copy privately, then choose a permanent
            outcome.
          </p>
        </div>
        <StatusPill status={status} />
      </div>
      <div className="content-grid holder-grid">
        <section className="primary-column">
          <div className="certificate-sheet">
            <div className="sheet-top">
              <span className="document-kicker">NORTHSTAR INSTITUTE</span>
              <span className="sheet-stamp">DECRYPTED LOCALLY</span>
            </div>
            <h2>Certificate of completion</h2>
            <p className="recipient-name">Ananya Rao</p>
            <div className="certificate-rule" />
            {fields.slice(1).map(([label, value]) => (
              <div className="cert-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
            <div className="sheet-footer">
              <span>Schema v1 · issued 14 Sep 2026</span>
              <span>Root 0x6a1f...d440</span>
            </div>
          </div>
          {status === "Pending" && (
            <div className="decision-row">
              <button
                className="confirm-button"
                onClick={() => setStatus("Confirmed")}
              >
                Confirm credential <span>✓</span>
              </button>
              <button
                className="dispute-button"
                onClick={() => setStatus("Disputed")}
              >
                Dispute this credential
              </button>
            </div>
          )}
          {status === "Disputed" && (
            <div className="dispute-notice">
              <strong>Dispute recorded permanently.</strong>
              <span>The institution must issue a new credential.</span>
            </div>
          )}
        </section>
        <aside className="side-panel">
          <PanelTitle title="On-chain receipt" eyebrow="PUBLIC INTEGRITY" />
          <Boundary label="Lifecycle" value={status} />
          <Boundary label="Recipient binding" value="0x71...a42D" />
          <Boundary label="Issuer quorum" value="3 of 5" />
          <Boundary label="Soulbound" value="Yes" />
        </aside>
      </div>
    </div>
  );
}

function VerifiedCredential({ field, proofRequested, proofSent, proofDenied }: { field: string; proofRequested: boolean; proofSent: boolean; proofDenied: boolean }) {
  return <div className="workspace"><div className="verified-list-header"><div><span className="eyebrow">YOUR VERIFIED CREDENTIALS</span><h2>Credential #001</h2><p>Confirmed by you · full document remains private</p></div><StatusPill status="Confirmed" /></div><div className="verified-list"><div className="verified-list-item"><span className="verified-check">✓</span><div><strong>Bachelor of Computer Science</strong><small>Northstar Institute of Technology · issued 14 September 2026</small></div><code>root 0x6a1f...d440</code></div></div>{proofRequested && <div className={`request-status ${proofDenied ? "denied" : proofSent ? "shared" : "waiting"}`}><strong>{proofDenied ? "You denied the verifier request" : proofSent ? `You shared only the ${field} proof` : `Verifier requested: ${field}`}</strong><span>{proofDenied ? "No document or field value was shared." : proofSent ? "The field value and sibling hashes were sent. Your document stayed private." : "Open this request to share or deny it."}</span></div>}</div>;
}

const presentationChainId = Number(import.meta.env.VITE_OFFICIAL_CHAIN_ID || 11155111);
const presentationContract = import.meta.env.VITE_VERIBIND_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
const credentialReadAbi = [
  "function credentialRecipient(uint256) view returns (address)",
  "function credentialStatus(uint256) view returns (uint8)",
  "function credentialMerkleRoot(uint256) view returns (bytes32)",
  "function credentialIssuanceDigest(uint256) view returns (bytes32)",
  "function credentialIssuedAt(uint256) view returns (uint64)",
  "function credentialExpiresAt(uint256) view returns (uint64)",
];

async function makePresentation(provider: BrowserProvider, recipientAddress: string, field: string): Promise<VeribindPresentation> {
  const leaves = await Promise.all(fields.map(([name, value]) => hashField(1, name.toLowerCase(), value)));
  const fieldIndex = fields.findIndex(([name]) => name === field);
  const certificateMerkleRoot = await buildMerkleRoot(leaves);
  const merkleProof = await buildMerkleProof(leaves, fieldIndex);
  return signPresentation(provider, {
    type: "veribind-presentation",
    version: 1,
    chainId: presentationChainId,
    contractAddress: presentationContract,
    tokenId: "1",
    recipientAddress,
    credentialStatus: "Confirmed",
    disclosures: [{ fieldName: field.toLowerCase(), fieldValue: fields[fieldIndex][1], fieldIndex, merkleProof }],
    certificateMerkleRoot,
    issuanceDigest: "0x0000000000000000000000000000000000000000000000000000000000000000",
    issuedAt: 1790035200,
    expiresAt: 0,
    nonce: randomNonce(),
  });
}

function Presentation({ minted, status, recipientAddress, field, onWalletConnected }: { minted: boolean; status: Status; recipientAddress: string; field: string; onWalletConnected: (address: string) => void }) {
  const [selectedField, setSelectedField] = useState(field);
  const [qrData, setQrData] = useState("");
  const [presentation, setPresentation] = useState<VeribindPresentation | null>(null);
  const [error, setError] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const connectHolderWallet = async () => {
    setError("");
    if (!window.ethereum) return setError("MetaMask was not detected. Install the extension to sign this QR.");
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) return setError("No wallet account was selected.");
      setWalletAddress(accounts[0]);
      onWalletConnected(accounts[0]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet connection was cancelled.");
    }
  };
  const generate = async () => {
    setError("");
    if (!minted || status !== "Confirmed") return setError("Confirm the credential before creating a presentation.");
    if (!window.ethereum) return setError("MetaMask is required because the QR must be signed by the holder wallet.");
    try {
      const provider = new BrowserProvider(window.ethereum as never);
      const accounts = (await provider.send("eth_accounts", [])) as string[];
      if (!accounts[0]) return setError("Connect the holder wallet before generating the signed QR.");
      if (accounts[0].toLowerCase() !== recipientAddress.toLowerCase()) return setError("The connected wallet does not match this credential. Connect the holder wallet.");
      const signed = await makePresentation(provider, accounts[0], selectedField);
      setWalletAddress(accounts[0]);
      setPresentation(signed);
      setQrData(await QRCode.toDataURL(JSON.stringify(signed), { width: 280, margin: 2, errorCorrectionLevel: "M" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet signature was cancelled.");
    }
  };
  return <div className="workspace"><div className="presentation-intro"><span className="eyebrow">RECIPIENT-GENERATED / SIGNED PRESENTATION</span><h2>Show one verified fact</h2><p>This QR is created by your wallet after confirmation. It contains only the selected field, its Merkle proof, and a signature. Your certificate and AES key are never included.</p></div><div className="presentation-grid"><section className="request-card"><label className="field-label">Field to show<select value={selectedField} onChange={(event) => { setSelectedField(event.target.value); setPresentation(null); setQrData(""); }}><option>Name</option><option>Credential</option><option>Institution</option><option>Issued</option></select></label><div className="presentation-facts"><Boundary label="Status" value={status} /><Boundary label="Wallet" value={walletAddress || recipientAddress} /><Boundary label="Network" value={`Chain ${presentationChainId}`} /></div><div className={`wallet-status ${walletAddress ? "connected" : "disconnected"}`}><span className="green-dot" />{walletAddress ? `Holder wallet connected: ${shortAddress(walletAddress)}` : "Holder wallet not connected"}</div>{!walletAddress && <button className="secondary-action" onClick={() => void connectHolderWallet()}>Connect MetaMask to sign</button>}<button className="primary-action" onClick={generate} disabled={!minted || status !== "Confirmed"}>Sign & generate QR <span>→</span></button>{error && <p className="presentation-error">{error}</p>}</section><section className="qr-result">{qrData ? <><img src={qrData} alt="Signed VeriBind presentation QR code" /><strong>Scan to verify {selectedField}</strong><small>New nonce · wallet signed · no file shared</small></> : <div className="qr-empty"><span>QR</span><p>{status !== "Confirmed" ? "Your credential must be Confirmed first." : "Connect the holder wallet, then sign to create your QR."}</p></div>}</section></div>{presentation && <div className="presentation-payload"><span>Signed presentation</span><code>{presentation.holderSignature.slice(0, 18)}... · nonce {presentation.nonce.slice(0, 12)}...</code></div>}</div>;
}

function Verifier({
  minted,
  status,
  field,
  setField,
  proofRequested,
  setProofRequested,
  proofSent,
  setProofSent,
  proofDenied,
  setProofDenied,
}: {
  minted: boolean;
  status: Status;
  field: string;
  setField: (value: string) => void;
  proofRequested: boolean;
  setProofRequested: (value: boolean) => void;
  proofSent: boolean;
  setProofSent: (value: boolean) => void;
  proofDenied: boolean;
  setProofDenied: (value: boolean) => void;
}) {
  return (
    <div className="workspace">
      <div className="verify-intro">
        <span className="eyebrow">PHASE 03 / NO FILE SHARED</span>
        <h2>Ask for one fact. Nothing else.</h2>
        <p>
          The verifier can request a field only after the holder confirms the
          credential. The holder must then approve the response.
        </p>
      </div>
      <div className="verify-grid">
        <section className="request-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">VERIFIER REQUEST</span>
              <h3>Choose a field</h3>
            </div>
            <span className="request-number">01</span>
          </div>
          <label className="field-label">
            Requested claim
            <select
              value={field}
              onChange={(event) => {
                setField(event.target.value);
                setProofRequested(false);
                setProofSent(false);
                setProofDenied(false);
              }}
            >
              <option>Name</option>
              <option>Credential</option>
              <option>Institution</option>
              <option>Issued</option>
            </select>
          </label>
          <div className="request-details">
            <div>
              <span>Credential</span>
              <strong>#001 · Ananya Rao</strong>
            </div>
            <div>
              <span>Recipient status</span>
              <StatusPill status={status} />
            </div>
          </div>
          <button
            className="primary-action"
            onClick={() => { setProofSent(false); setProofDenied(false); setProofRequested(true); }}
            disabled={!minted || status !== "Confirmed" || proofRequested}
          >
            {!minted
              ? "Waiting for issuer to mint"
              : status !== "Confirmed"
              ? "Waiting for holder confirmation"
              : proofRequested
              ? "Request sent to holder"
              : "Ask the holder for proof"}
            <span>→</span>
          </button>
        </section>
        <section className="proof-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">HOLDER RESPONSE</span>
              <h3>
                {proofDenied
                  ? "Holder denied this request"
                  : proofSent
                  ? "Proof verified"
                  : proofRequested
                  ? "Awaiting holder approval"
                  : "No request yet"}
              </h3>
            </div>
            <span className="proof-icon">{proofDenied ? "!" : proofSent ? "✓" : "···"}</span>
          </div>
          {proofDenied ? (
            <div className="denied-result"><strong>Request denied</strong><p>The holder chose not to share this field. No proof was received.</p></div>
          ) : proofSent ? (
            <>
              <div className="match-result">
                <span className="match-check">✓</span>
                <div>
                  <strong>Authentic field</strong>
                  <p>{field} matches the anchored certificate root.</p>
                </div>
              </div>
              <div className="proof-value">
                <span>Shared field value</span>
                <strong>
                  {fields.find(([label]) => label === field)?.[1]}
                </strong>
              </div>
              <div className="proof-meta">
                <span>Field value + sibling hashes</span>
                <code>root 0x6a1f...d440</code>
              </div>
            </>
          ) : (
            <div className="waiting-state">
              <div className="waiting-lines">
                <span />
                <span />
                <span />
              </div>
              <p>
                {proofRequested
                  ? "The holder must open Review and explicitly share this proof."
                  : "Send a request after the holder confirms the credential."}
              </p>
            </div>
          )}
        </section>
      </div>
      <div className="privacy-strip">
        <span className="shield">+</span>
        <div>
          <strong>Zero document disclosure</strong>
          <span>
            No certificate, CID plaintext, AES key, or private key is included.
          </span>
        </div>
        <span className="proof-spec">SHA-256 · Merkle v1</span>
      </div>
      <QrVerifier />
    </div>
  );
}

function QrVerifier() {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<{ valid: boolean; reason?: string } | null>(null);
  const validate = async (value: string) => {
    setRaw(value);
    try {
      const presentation = JSON.parse(value) as VeribindPresentation;
      if (!window.ethereum) throw new Error("Live blockchain status unavailable");
      const provider = new BrowserProvider(window.ethereum as never);
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== presentationChainId) throw new Error("Wrong network");
      const contract = new Contract(presentationContract, credentialReadAbi, provider);
      const tokenId = presentation.tokenId;
      const statusNames = ["Pending", "Confirmed", "Disputed"] as const;
      const status = statusNames[Number(await contract.credentialStatus(tokenId))] ?? "Disputed";
      setResult(await checkPresentation(presentation, { chainId: presentationChainId, contractAddress: presentationContract, recipientAddress: await contract.credentialRecipient(tokenId), tokenId, status, certificateMerkleRoot: await contract.credentialMerkleRoot(tokenId), issuanceDigest: await contract.credentialIssuanceDigest(tokenId), issuedAt: Number(await contract.credentialIssuedAt(tokenId)), expiresAt: Number(await contract.credentialExpiresAt(tokenId)) }));
    } catch (reason) {
      setResult({ valid: false, reason: reason instanceof Error ? reason.message : "Live blockchain status unavailable" });
    }
  };
  const importQr = (file: File) => { const reader = new FileReader(); reader.onload = () => { const image = new Image(); image.onload = () => { const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext("2d"); if (!context) return; context.drawImage(image, 0, 0); const pixels = context.getImageData(0, 0, image.width, image.height); const decoded = jsQR(pixels.data, pixels.width, pixels.height); if (decoded) void validate(decoded.data); else setResult({ valid: false, reason: "QR code could not be read" }); }; image.src = String(reader.result); }; reader.readAsDataURL(file); };
  return <section className="qr-verifier"><div className="card-heading"><div><span className="eyebrow">VERIFIER / IMPORT PRESENTATION</span><h3>Scan or paste a recipient QR</h3></div><span className="request-number">LIVE CHECK</span></div><div className="qr-import-row"><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) importQr(file); }} /><button className="copy-button" onClick={() => void validate(raw)}>Validate pasted QR</button></div><textarea value={raw} onChange={(event) => setRaw(event.target.value)} placeholder="Paste the QR payload JSON here for a live cryptographic check" />{result && <div className={`qr-validation ${result.valid ? "valid" : "invalid"}`}><strong>{result.valid ? "VALID VERIBIND PRESENTATION" : "NOT VERIFIED"}</strong><span>{result.valid ? "Signature, credential status, recipient, root, and Merkle proof passed." : result.reason}</span></div>}</section>;
}

function Debug({
  status,
  registered,
  approved,
  minted,
  proofRequested,
  proofSent,
  proofDenied,
  field,
  walletAddress,
}: {
  status: Status;
  registered: boolean;
  approved: number;
  minted: boolean;
  proofRequested: boolean;
  proofSent: boolean;
  proofDenied: boolean;
  field: string;
  walletAddress: string;
}) {
  const flowSteps = [
    {
      stage: "01",
      label: "Identity",
      type: "Wallet-bound registration",
      state: registered ? "Registered" : "Waiting",
      tone: registered ? "complete" : "waiting",
      detail: registered ? "DID and doc hash bound to wallet" : "No holder identity yet",
    },
    {
      stage: "02",
      label: "Institution",
      type: "Issue approval flow",
      state: minted ? "Minted" : approved >= 3 ? "Ready to mint" : `${approved}/3 approvals`,
      tone: minted ? "complete" : approved >= 3 ? "active" : "waiting",
      detail: minted ? "NFT issued and activated" : "Threshold approvals pending",
    },
    {
      stage: "03",
      label: "Holder review",
      type: "Credential consent",
      state: status,
      tone:
        status === "Confirmed"
          ? "complete"
          : status === "Disputed"
          ? "danger"
          : "active",
      detail:
        status === "Confirmed"
          ? "Holder accepted the credential"
          : status === "Disputed"
          ? "Holder rejected issuance"
          : "Waiting on holder decision",
    },
    {
      stage: "04",
      label: "Selective proof",
      type: "Field-level verifiable share",
      state: proofDenied
        ? "Denied"
        : proofSent
        ? "Shared and verified"
        : proofRequested
        ? "Awaiting response"
        : "Not requested",
      tone: proofDenied ? "danger" : proofSent ? "complete" : proofRequested ? "active" : "waiting",
      detail: proofDenied ? "Verifier request denied by holder" : proofSent ? "Minimal claim delivered" : "No proof shared yet",
    },
  ];

  const values = [
    ["Wallet address", walletAddress, "Connected holder or verifier wallet"],
    ["Role flow", "Holder / Issuer / Verifier", "RBAC route map"],
    ["DID", `did:veribind:${walletAddress.slice(2, 10)}`, "Wallet-linked identity"],
    ["docHash", registered ? "0x8bd4f2c1...e91c" : "Not registered", "User identity anchor"],
    ["Credential field", field, "Currently requested proof field"],
    ["Credential ID", minted ? "#001" : "Not minted", "Soulbound certificate ID"],
    ["Merkle root", minted ? "0x6a1f2e8c...d440" : "Pending generation", "Certificate field root"],
    ["Issuer approvals", `${approved}/5 (threshold 3)`, "Exact issuance tuple"],
    ["Lifecycle", status, "Contract status"],
    ["Proof request", proofRequested ? "Requested" : "Idle", "Verifier side request state"],
    ["Proof status", proofDenied ? "Denied" : proofSent ? "Shared" : "Not shared", "Holder response"],
  ];

  return (
    <div className="debug-workspace">
      <div className="debug-intro">
        <div>
          <span className="eyebrow">LOCAL ONLY / SYNTHETIC DATA</span>
          <h2>Trace the full credential flow</h2>
          <p>
            Follow each wallet-driven state transition from registration to proof
            sharing, and inspect the exact values the verifier checks before trust is granted.
          </p>
        </div>
        <span className="debug-badge">DEBUG MODE</span>
      </div>

      <div className="debug-flow-panel">
        <div className="debug-section-heading">
          <div>
            <span className="eyebrow">FLOW TYPE</span>
            <h3>Credential lifecycle map</h3>
          </div>
          <span className="debug-refresh">wallet-rbac</span>
        </div>

        <div className="debug-flow">
          {flowSteps.map((step, index) => (
            <div className="debug-flow-step-wrap" key={step.stage}>
              <div className={`debug-flow-step ${step.tone}`}>
                <span className="debug-flow-index">{step.stage}</span>
                <div className="debug-flow-copy">
                  <strong>{step.label}</strong>
                  <small>{step.type}</small>
                </div>
                <span className={`debug-flow-status ${step.tone}`}>{step.state}</span>
              </div>
              {index < flowSteps.length - 1 && <span className="debug-flow-connector" />}
            </div>
          ))}
        </div>
      </div>

      <section className="debug-values">
        <div className="debug-section-heading">
          <div>
            <span className="eyebrow">RUNTIME VALUES</span>
            <h3>Hashes, addresses & IDs</h3>
          </div>
          <span className="debug-refresh">fixture-v1</span>
        </div>
        <div className="debug-table">
          {values.map(([label, value, detail]) => (
            <div className="debug-row" key={label}>
              <span>
                {label}
                <small>{detail}</small>
              </span>
              <code>{String(value)}</code>
              <button
                className="copy-button"
                onClick={() => navigator.clipboard?.writeText(String(value))}
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="eyebrow">WORKFLOW PAUSED</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function PanelTitle({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <div className="panel-title">
      <span className="eyebrow">{eyebrow}</span>
      <h3>{title}</h3>
    </div>
  );
}
function Boundary({ label, value }: { label: string; value: string }) {
  return (
    <div className="boundary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`status-pill ${status.toLowerCase()}`}>
      <span /> {status}
    </span>
  );
}

export default App;

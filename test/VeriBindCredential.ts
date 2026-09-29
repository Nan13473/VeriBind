import { expect } from "chai";
import { ethers } from "hardhat";

describe("VeriBindCredential", function () {
  it("requires identity registration and keeps lifecycle transitions append-only", async function () {
    const [owner, holder, issuerTwo, issuerThree] = await ethers.getSigners();
    const contract = await ethers.deployContract("VeriBindCredential");
    await contract.waitForDeployment();
    const docHash = ethers.keccak256(ethers.toUtf8Bytes("fixture-identity-v1"));
    const root = ethers.keccak256(ethers.toUtf8Bytes("certificate-root"));

    await expect(contract.connect(owner).proposeIssuance(holder.address, root, "bafy-demo", ethers.ZeroHash, ethers.ZeroHash, 1, 0))
      .to.be.revertedWithCustomError(contract, "IdentityNotRegistered");
    await contract.connect(holder).registerIdentity(docHash);
    expect(await contract.roleOf(holder.address)).to.equal(1);
    expect(await contract.roleOf(issuerThree.address)).to.equal(3);
    await contract.connect(owner).setIssuer(issuerTwo.address, true);
    await contract.connect(owner).setIssuer(issuerThree.address, true);
    await contract.connect(owner).proposeIssuance(holder.address, root, "bafy-demo", ethers.ZeroHash, ethers.ZeroHash, 1, 0);
    await contract.connect(owner).approveIssuance(1);
    await contract.connect(issuerTwo).approveIssuance(1);
    await expect(contract.connect(owner).finalizeIssuance(1)).to.be.revertedWithCustomError(contract, "ApprovalThresholdNotMet");
    await contract.connect(issuerThree).approveIssuance(1);
    await contract.connect(owner).finalizeIssuance(1);
    expect(await contract.credentialRecipient(1)).to.equal(holder.address);
    expect(await contract.credentialMerkleRoot(1)).to.equal(root);
    expect(await contract.credentialIssuanceDigest(1)).to.equal(ethers.ZeroHash);
    expect(await contract.credentialStatus(1)).to.equal(0);
    expect((await contract.credentials(1)).status).to.equal(0);
    await contract.connect(holder).confirm(1);
    expect((await contract.credentials(1)).status).to.equal(1);
    await expect(contract.connect(holder).dispute(1)).to.be.revertedWithCustomError(contract, "InvalidStatus");
  });

  it("rejects transfers", async function () {
    const [owner, holder, other, thirdIssuer] = await ethers.getSigners();
    const contract = await ethers.deployContract("VeriBindCredential");
    await contract.waitForDeployment();
    await contract.connect(holder).registerIdentity(ethers.keccak256(ethers.toUtf8Bytes("id")));
    await contract.connect(owner).setIssuer(other.address, true);
    await contract.connect(owner).setIssuer(thirdIssuer.address, true);
    await contract.connect(owner).proposeIssuance(holder.address, ethers.ZeroHash, "cid", ethers.ZeroHash, ethers.ZeroHash, 1, 0);
    await contract.connect(owner).approveIssuance(1);
    await contract.connect(other).approveIssuance(1);
    await contract.connect(thirdIssuer).approveIssuance(1);
    await contract.connect(owner).finalizeIssuance(1);
    await expect(contract.connect(holder).transferFrom(holder.address, other.address, 1))
      .to.be.revertedWithCustomError(contract, "Soulbound");
  });
});

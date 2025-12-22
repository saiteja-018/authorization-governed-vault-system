const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Authorization-Governed Vault System", function () {
  let authorizationManager;
  let vault;
  let owner;
  let user1;
  let user2;
  let attacker;

  beforeEach(async function () {
    [owner, user1, user2, attacker] = await ethers.getSigners();

    // Deploy AuthorizationManager with owner as signer
    const AuthorizationManager = await ethers.getContractFactory("AuthorizationManager");
    authorizationManager = await AuthorizationManager.deploy(owner.address);
    await authorizationManager.waitForDeployment();

    // Deploy SecureVault
    const SecureVault = await ethers.getContractFactory("SecureVault");
    vault = await SecureVault.deploy(await authorizationManager.getAddress());
    await vault.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct signer in AuthorizationManager", async function () {
      expect(await authorizationManager.signer()).to.equal(owner.address);
    });

    it("Should set the correct authorization manager in vault", async function () {
      expect(await vault.authorizationManager()).to.equal(await authorizationManager.getAddress());
    });

    it("Should initialize vault with zero balance", async function () {
      expect(await vault.getBalance()).to.equal(0);
      expect(await vault.totalBalance()).to.equal(0);
    });
  });

  describe("Deposits", function () {
    it("Should accept deposits via receive function", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      await expect(
        user1.sendTransaction({
          to: await vault.getAddress(),
          value: depositAmount
        })
      ).to.emit(vault, "Deposit")
        .withArgs(user1.address, depositAmount, depositAmount);

      expect(await vault.getBalance()).to.equal(depositAmount);
      expect(await vault.totalBalance()).to.equal(depositAmount);
    });

    it("Should accept deposits via deposit function", async function () {
      const depositAmount = ethers.parseEther("2.0");
      
      await expect(
        vault.connect(user1).deposit({ value: depositAmount })
      ).to.emit(vault, "Deposit")
        .withArgs(user1.address, depositAmount, depositAmount);

      expect(await vault.getBalance()).to.equal(depositAmount);
    });

    it("Should track multiple deposits correctly", async function () {
      const deposit1 = ethers.parseEther("1.0");
      const deposit2 = ethers.parseEther("2.0");

      await vault.connect(user1).deposit({ value: deposit1 });
      await vault.connect(user2).deposit({ value: deposit2 });

      expect(await vault.totalBalance()).to.equal(deposit1 + deposit2);
    });

    it("Should reject zero deposits", async function () {
      await expect(
        vault.connect(user1).deposit({ value: 0 })
      ).to.be.revertedWith("Cannot deposit zero");
    });
  });

  describe("Authorization", function () {
    async function createAuthorization(recipient, amount, nonce) {
      const vaultAddress = await vault.getAddress();
      const chainId = (await ethers.provider.getNetwork()).chainId;

      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "uint256", "uint256"],
        [vaultAddress, recipient, amount, nonce, chainId]
      );

      const messageHashBytes = ethers.getBytes(messageHash);
      const signature = await owner.signMessage(messageHashBytes);

      return signature;
    }

    it("Should generate correct authorization ID", async function () {
      const vaultAddress = await vault.getAddress();
      const recipient = user1.address;
      const amount = ethers.parseEther("1.0");
      const nonce = 1;

      const authId = await authorizationManager.getAuthorizationId(
        vaultAddress,
        recipient,
        amount,
        nonce
      );

      // bytes32 is 64 hex characters + '0x' prefix = 66 total length
      expect(authId).to.be.properHex(64);
    });

    it("Should accept valid authorization", async function () {
      const amount = ethers.parseEther("1.0");
      const nonce = 1;

      // Fund the vault
      await vault.connect(user2).deposit({ value: ethers.parseEther("2.0") });

      // Create authorization
      const signature = await createAuthorization(user1.address, amount, nonce);

      // Withdraw with valid authorization
      await expect(
        vault.connect(user1).withdraw(user1.address, amount, nonce, signature)
      ).to.emit(vault, "Withdrawal");
    });

    it("Should reject invalid signature", async function () {
      const amount = ethers.parseEther("1.0");
      const nonce = 2;

      await vault.connect(user2).deposit({ value: ethers.parseEther("2.0") });

      // Create invalid signature (signed by attacker instead of owner)
      const vaultAddress = await vault.getAddress();
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "uint256", "uint256"],
        [vaultAddress, user1.address, amount, nonce, chainId]
      );
      const invalidSignature = await attacker.signMessage(ethers.getBytes(messageHash));

      await expect(
        vault.connect(user1).withdraw(user1.address, amount, nonce, invalidSignature)
      ).to.be.revertedWithCustomError(authorizationManager, "InvalidSignature");
    });
  });

  describe("Withdrawals", function () {
    async function createAuthorization(recipient, amount, nonce) {
      const vaultAddress = await vault.getAddress();
      const chainId = (await ethers.provider.getNetwork()).chainId;

      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "uint256", "uint256"],
        [vaultAddress, recipient, amount, nonce, chainId]
      );

      const signature = await owner.signMessage(ethers.getBytes(messageHash));
      return signature;
    }

    it("Should execute valid withdrawal", async function () {
      const depositAmount = ethers.parseEther("5.0");
      const withdrawAmount = ethers.parseEther("2.0");
      const nonce = 100;

      await vault.connect(user2).deposit({ value: depositAmount });

      const initialBalance = await ethers.provider.getBalance(user1.address);
      const signature = await createAuthorization(user1.address, withdrawAmount, nonce);

      await vault.connect(user1).withdraw(user1.address, withdrawAmount, nonce, signature);

      const finalBalance = await ethers.provider.getBalance(user1.address);
      expect(finalBalance).to.be.gt(initialBalance);
      expect(await vault.totalBalance()).to.equal(depositAmount - withdrawAmount);
    });

    it("Should prevent replay attacks", async function () {
      const amount = ethers.parseEther("1.0");
      const nonce = 200;

      await vault.connect(user2).deposit({ value: ethers.parseEther("5.0") });

      const signature = await createAuthorization(user1.address, amount, nonce);

      // First withdrawal should succeed
      await vault.connect(user1).withdraw(user1.address, amount, nonce, signature);

      // Second withdrawal with same authorization should fail
      await expect(
        vault.connect(user1).withdraw(user1.address, amount, nonce, signature)
      ).to.be.revertedWithCustomError(authorizationManager, "AuthorizationAlreadyUsed");
    });

    it("Should reject withdrawal with insufficient balance", async function () {
      const amount = ethers.parseEther("10.0");
      const nonce = 300;

      // Only deposit 1 ETH but try to withdraw 10 ETH
      await vault.connect(user2).deposit({ value: ethers.parseEther("1.0") });

      const signature = await createAuthorization(user1.address, amount, nonce);

      await expect(
        vault.connect(user1).withdraw(user1.address, amount, nonce, signature)
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("Should reject zero amount withdrawal", async function () {
      const nonce = 400;

      await vault.connect(user2).deposit({ value: ethers.parseEther("1.0") });

      const signature = await createAuthorization(user1.address, 0, nonce);

      await expect(
        vault.connect(user1).withdraw(user1.address, 0, nonce, signature)
      ).to.be.revertedWithCustomError(vault, "InvalidAmount");
    });

    it("Should reject withdrawal to zero address", async function () {
      const amount = ethers.parseEther("1.0");
      const nonce = 500;

      await vault.connect(user2).deposit({ value: ethers.parseEther("2.0") });

      const signature = await createAuthorization(ethers.ZeroAddress, amount, nonce);

      await expect(
        vault.connect(user1).withdraw(ethers.ZeroAddress, amount, nonce, signature)
      ).to.be.revertedWithCustomError(vault, "InvalidAmount");
    });

    it("Should handle multiple sequential withdrawals", async function () {
      await vault.connect(user2).deposit({ value: ethers.parseEther("10.0") });

      const amount1 = ethers.parseEther("1.0");
      const amount2 = ethers.parseEther("2.0");
      const amount3 = ethers.parseEther("3.0");

      const sig1 = await createAuthorization(user1.address, amount1, 1);
      const sig2 = await createAuthorization(user1.address, amount2, 2);
      const sig3 = await createAuthorization(user1.address, amount3, 3);

      await vault.connect(user1).withdraw(user1.address, amount1, 1, sig1);
      await vault.connect(user1).withdraw(user1.address, amount2, 2, sig2);
      await vault.connect(user1).withdraw(user1.address, amount3, 3, sig3);

      const expectedBalance = ethers.parseEther("10.0") - amount1 - amount2 - amount3;
      expect(await vault.totalBalance()).to.equal(expectedBalance);
    });
  });

  describe("Security", function () {
    async function createAuthorization(recipient, amount, nonce) {
      const vaultAddress = await vault.getAddress();
      const chainId = (await ethers.provider.getNetwork()).chainId;

      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "uint256", "uint256", "uint256"],
        [vaultAddress, recipient, amount, nonce, chainId]
      );

      const signature = await owner.signMessage(ethers.getBytes(messageHash));
      return signature;
    }

    it("Should prevent authorization reuse with same nonce", async function () {
      const nonce = 1000;
      const amount = ethers.parseEther("1.0");

      await vault.connect(user2).deposit({ value: ethers.parseEther("10.0") });

      const signature = await createAuthorization(user1.address, amount, nonce);

      // Use authorization with correct amount
      await vault.connect(user1).withdraw(user1.address, amount, nonce, signature);

      // Try to reuse same authorization should fail
      await expect(
        vault.connect(user1).withdraw(user1.address, amount, nonce, signature)
      ).to.be.revertedWithCustomError(authorizationManager, "AuthorizationAlreadyUsed");
    });

    it("Should bind authorization to specific vault", async function () {
      // This test demonstrates that signatures are vault-specific
      const amount = ethers.parseEther("1.0");
      const nonce = 1100;

      await vault.connect(user2).deposit({ value: ethers.parseEther("5.0") });

      const signature = await createAuthorization(user1.address, amount, nonce);

      // Deploy a second vault
      const SecureVault = await ethers.getContractFactory("SecureVault");
      const vault2 = await SecureVault.deploy(await authorizationManager.getAddress());
      await vault2.waitForDeployment();
      await vault2.connect(user2).deposit({ value: ethers.parseEther("5.0") });

      // Authorization signed for vault1 should not work for vault2
      await expect(
        vault2.connect(user1).withdraw(user1.address, amount, nonce, signature)
      ).to.be.revertedWithCustomError(authorizationManager, "InvalidSignature");
    });

    it("Should maintain correct balance after multiple operations", async function () {
      const deposits = [
        ethers.parseEther("1.0"),
        ethers.parseEther("2.0"),
        ethers.parseEther("3.0")
      ];

      const withdrawals = [
        ethers.parseEther("0.5"),
        ethers.parseEther("1.5")
      ];

      // Make deposits
      for (const deposit of deposits) {
        await vault.connect(user2).deposit({ value: deposit });
      }

      // Make withdrawals
      const sig1 = await createAuthorization(user1.address, withdrawals[0], 10);
      const sig2 = await createAuthorization(user1.address, withdrawals[1], 11);

      await vault.connect(user1).withdraw(user1.address, withdrawals[0], 10, sig1);
      await vault.connect(user1).withdraw(user1.address, withdrawals[1], 11, sig2);

      const totalDeposits = deposits.reduce((a, b) => a + b, 0n);
      const totalWithdrawals = withdrawals.reduce((a, b) => a + b, 0n);
      const expectedBalance = totalDeposits - totalWithdrawals;

      expect(await vault.totalBalance()).to.equal(expectedBalance);
      expect(await vault.getBalance()).to.equal(expectedBalance);
    });
  });
});

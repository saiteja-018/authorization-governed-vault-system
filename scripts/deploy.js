const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n=== Starting Deployment ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");
  
  const network = await hre.ethers.provider.getNetwork();
  console.log("Network:", network.name);
  console.log("Chain ID:", network.chainId.toString());
  console.log("\n");
  
  // Deploy AuthorizationManager
  console.log("Deploying AuthorizationManager...");
  const AuthorizationManager = await hre.ethers.getContractFactory("AuthorizationManager");
  
  // Use the deployer as the signer for authorizations
  const authorizationManager = await AuthorizationManager.deploy(deployer.address);
  await authorizationManager.waitForDeployment();
  
  const authManagerAddress = await authorizationManager.getAddress();
  console.log("✓ AuthorizationManager deployed to:", authManagerAddress);
  console.log("  Signer address:", deployer.address);
  console.log("\n");
  
  // Deploy SecureVault
  console.log("Deploying SecureVault...");
  const SecureVault = await hre.ethers.getContractFactory("SecureVault");
  const vault = await SecureVault.deploy(authManagerAddress);
  await vault.waitForDeployment();
  
  const vaultAddress = await vault.getAddress();
  console.log("✓ SecureVault deployed to:", vaultAddress);
  console.log("\n");
  
  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    contracts: {
      AuthorizationManager: authManagerAddress,
      SecureVault: vaultAddress
    },
    timestamp: new Date().toISOString()
  };
  
  const deploymentDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }
  
  const filename = `deployment-${network.name}-${Date.now()}.json`;
  const filepath = path.join(deploymentDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log("=== Deployment Summary ===");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log("\n✓ Deployment info saved to:", filepath);
  console.log("\n=== Deployment Complete ===\n");
  
  return deploymentInfo;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

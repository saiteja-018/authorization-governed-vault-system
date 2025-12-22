#!/bin/sh

echo "================================"
echo "Starting Blockchain Node"
echo "================================"

# Start Hardhat node in background
npx hardhat node &

# Wait for node to be ready
echo "Waiting for blockchain node to be ready..."
sleep 10

echo ""
echo "================================"
echo "Compiling Smart Contracts"
echo "================================"
npx hardhat compile

echo ""
echo "================================"
echo "Deploying Contracts"
echo "================================"
npx hardhat run scripts/deploy.js --network localhost

echo ""
echo "================================"
echo "Deployment Complete"
echo "================================"
echo "Blockchain node is running on http://localhost:8545"
echo "Check deployments/ directory for contract addresses"
echo ""

# Keep container running
tail -f /dev/null

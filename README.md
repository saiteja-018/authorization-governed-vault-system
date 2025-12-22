# Authorization-Governed Vault System

A secure decentralized vault system that enforces strict authorization controls for fund withdrawals. The system separates concerns between fund custody and permission validation through two specialized smart contracts.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Security Features](#security-features)
- [Installation](#installation)
- [Usage](#usage)
- [Testing](#testing)
- [Deployment](#deployment)
- [Authorization Design](#authorization-design)
- [Security Considerations](#security-considerations)

## Overview

This system implements a multi-contract architecture where:
- **SecureVault**: Holds and transfers funds
- **AuthorizationManager**: Validates withdrawal permissions through cryptographic signatures

The separation of concerns ensures that the vault contract never performs signature verification itself, relying exclusively on the authorization manager for permission validation.

## Architecture

```
┌─────────────────┐
│   User/Client   │
└────────┬────────┘
         │
         ├─ Deposit
         │    │
         │    ▼
    ┌────┴──────────┐         ┌──────────────────────┐
    │ SecureVault   │────────▶│AuthorizationManager  │
    │               │  verify │                      │
    │ - Hold funds  │◀────────│ - Validate signature │
    │ - Execute tx  │ confirm │ - Track usage        │
    └───────────────┘         │ - Prevent replay     │
                              └──────────────────────┘
```

### Contract Responsibilities

#### SecureVault
- Accepts deposits from any address
- Holds pooled funds securely
- Requests authorization validation before withdrawals
- Executes fund transfers only after authorization confirmation
- Maintains internal accounting (totalBalance)
- Emits events for deposits and withdrawals

#### AuthorizationManager
- Validates ECDSA signatures from authorized signer
- Tracks consumed authorizations to prevent replay attacks
- Binds permissions to specific parameters:
  - Vault address
  - Blockchain network (chain ID)
  - Recipient address
  - Withdrawal amount
  - Unique nonce
- Exposes verification interface callable by vault

## Security Features

### 1. Replay Protection
Each authorization is uniquely identified by a hash of:
- Vault contract address
- Recipient address
- Amount
- Nonce (unique identifier)
- Chain ID

Once an authorization is consumed, it's marked in a mapping and cannot be reused.

### 2. Signature Verification
Uses ECDSA (Elliptic Curve Digital Signature Algorithm) to verify that authorizations come from the designated signer. The system:
- Recovers the signer address from the signature
- Compares it with the authorized signer
- Rejects any signature from unauthorized parties

### 3. Checks-Effects-Interactions Pattern
The vault follows best practices by:
1. **Checks**: Validating authorization and balance
2. **Effects**: Updating internal state (totalBalance)
3. **Interactions**: Transferring funds to recipient

This prevents reentrancy attacks and ensures state consistency.

### 4. Context Binding
Authorizations are tightly bound to:
- **Specific vault instance**: Cannot be used across different vaults
- **Specific network**: Chain ID prevents cross-chain replay
- **Specific recipient**: Cannot be redirected to different address
- **Specific amount**: Cannot be modified

### 5. Single-Use Guarantees
Each authorization can only produce one successful state transition. The AuthorizationManager marks authorizations as consumed atomically.

## Installation

### Prerequisites
- Node.js v18 or higher
- Docker and Docker Compose (for containerized deployment)
- npm or yarn

### Local Setup

```bash
# Clone the repository
git clone <repository-url>
cd authorization-governed-vault-system

# Install dependencies
npm install

# Compile contracts
npm run compile
```

## Usage

### Using Docker (Recommended)

The easiest way to deploy and test the system:

```bash
# Start blockchain node and deploy contracts
docker-compose up

# The system will:
# 1. Start a local Hardhat node
# 2. Compile the smart contracts
# 3. Deploy AuthorizationManager
# 4. Deploy SecureVault
# 5. Output contract addresses

# Contract addresses will be saved in ./deployments/
```

### Manual Deployment

```bash
# Start local blockchain node
npm run node

# In a new terminal, deploy contracts
npm run deploy

# Deployment info will be saved to ./deployments/
```

### Interacting with the System

#### 1. Deposit Funds

Any address can deposit funds into the vault:

```javascript
const { ethers } = require("hardhat");

async function deposit() {
  const vault = await ethers.getContractAt("SecureVault", VAULT_ADDRESS);
  
  // Deposit via receive function
  await signer.sendTransaction({
    to: VAULT_ADDRESS,
    value: ethers.parseEther("1.0")
  });
  
  // Or via deposit function
  await vault.deposit({ value: ethers.parseEther("1.0") });
}
```

#### 2. Create Authorization

To withdraw funds, create a signed authorization:

```javascript
async function createAuthorization(vaultAddress, recipient, amount, nonce, signer) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  
  // Create message hash
  const messageHash = ethers.solidityPackedKeccak256(
    ["address", "address", "uint256", "uint256", "uint256"],
    [vaultAddress, recipient, amount, nonce, chainId]
  );
  
  // Sign the message
  const signature = await signer.signMessage(ethers.getBytes(messageHash));
  
  return signature;
}
```

#### 3. Withdraw Funds

With a valid authorization, execute withdrawal:

```javascript
async function withdraw(recipient, amount, nonce, signature) {
  const vault = await ethers.getContractAt("SecureVault", VAULT_ADDRESS);
  
  await vault.withdraw(recipient, amount, nonce, signature);
}
```

## Testing

Comprehensive test suite covering:
- Deployment and initialization
- Deposits (multiple users, edge cases)
- Authorization validation
- Successful and failed withdrawals
- Replay attack prevention
- Cross-vault security
- Balance consistency
- Edge cases and security scenarios

```bash
# Run all tests
npm test

# Run with gas reporting
REPORT_GAS=true npm test

# Run with coverage
npm run coverage
```

### Test Coverage

The test suite includes:
- ✓ Correct deployment and initialization
- ✓ Deposit functionality and event emissions
- ✓ Valid authorization acceptance
- ✓ Invalid signature rejection
- ✓ Replay attack prevention
- ✓ Insufficient balance handling
- ✓ Zero amount/address validation
- ✓ Multiple sequential withdrawals
- ✓ Cross-vault authorization isolation
- ✓ Balance consistency across operations

## Deployment

### Deployment Output

After running deployment, you'll see:

```
=== Starting Deployment ===

Deploying contracts with account: 0x...
Account balance: 10000.0 ETH

Network: localhost
Chain ID: 31337

Deploying AuthorizationManager...
✓ AuthorizationManager deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
  Signer address: 0x...

Deploying SecureVault...
✓ SecureVault deployed to: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

=== Deployment Summary ===
{
  "network": "localhost",
  "chainId": "31337",
  "deployer": "0x...",
  "contracts": {
    "AuthorizationManager": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "SecureVault": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
  },
  "timestamp": "2025-12-22T..."
}

✓ Deployment info saved to: ./deployments/deployment-localhost-xxx.json

=== Deployment Complete ===
```

## Authorization Design

### Message Structure

Authorizations use a deterministic message construction:

```solidity
keccak256(abi.encodePacked(
    vaultAddress,    // Binds to specific vault
    recipient,       // Binds to specific recipient
    amount,          // Binds to specific amount
    nonce,           // Ensures uniqueness
    block.chainid    // Prevents cross-chain replay
))
```

### Signature Flow

1. **Off-chain**: Authorized signer creates signature
   - Constructs message with all parameters
   - Signs with private key using ECDSA
   
2. **On-chain**: Authorization verification
   - User submits withdrawal request with signature
   - Vault requests validation from AuthorizationManager
   - Manager verifies signature authenticity
   - Manager checks if authorization already used
   - Manager marks authorization as consumed
   - Vault executes withdrawal

### Nonce Management

Nonces ensure each authorization is unique. In production:
- Use sequential nonces (1, 2, 3, ...)
- Or timestamp-based nonces
- Or random 256-bit values
- Track used nonces to prevent gaps

## Security Considerations

### Invariants Maintained

1. **Single-use authorization**: Each authorization produces exactly one state transition
2. **Balance consistency**: `vault.balance == vault.totalBalance` at all times
3. **Non-negative balance**: Balance never goes negative
4. **Authorization binding**: Signatures cannot be reused across vaults/networks/parameters
5. **Signature authenticity**: Only the designated signer can create valid authorizations

### Attack Vectors Prevented

#### 1. Replay Attacks
**Prevented by**: Authorization tracking in `usedAuthorizations` mapping

#### 2. Cross-Contract Replay
**Prevented by**: Including vault address in signature message

#### 3. Cross-Chain Replay
**Prevented by**: Including chain ID in signature message

#### 4. Signature Malleability
**Prevented by**: Standard ECDSA signature verification

#### 5. Reentrancy
**Prevented by**: Checks-Effects-Interactions pattern

#### 6. Front-Running
**Note**: Authorization can be submitted by any address. If front-running is a concern, bind the transaction sender in the authorization.

### Known Limitations

1. **Off-chain signer dependency**: System relies on off-chain signer for authorization generation
2. **Nonce management**: Requires careful nonce tracking to prevent collisions
3. **Gas costs**: Authorization verification has gas overhead
4. **No authorization revocation**: Once signed, authorization is valid until used

### Recommendations for Production

1. **Multi-sig signer**: Use multi-signature wallet as authorization signer
2. **Rate limiting**: Implement withdrawal rate limits
3. **Amount limits**: Set maximum withdrawal amounts
4. **Time locks**: Add time-based restrictions for large withdrawals
5. **Monitoring**: Monitor for suspicious authorization patterns
6. **Key rotation**: Plan for signer key rotation mechanism
7. **Emergency pause**: Consider pausable pattern for emergencies

## Project Structure

```
authorization-governed-vault-system/
├── contracts/
│   ├── AuthorizationManager.sol    # Permission validation
│   └── SecureVault.sol              # Fund custody
├── scripts/
│   └── deploy.js                    # Deployment script
├── test/
│   └── system.spec.js               # Comprehensive tests
├── docker/
│   ├── Dockerfile                   # Container image
│   └── entrypoint.sh                # Startup script
├── deployments/                     # Deployment records
├── docker-compose.yml               # Orchestration
├── hardhat.config.js                # Hardhat configuration
├── package.json                     # Dependencies
└── README.md                        # This file
```

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
- Open an issue on GitHub
- Review test cases for usage examples
- Check deployment logs for debugging

---

**Built with security and correctness as top priorities.**

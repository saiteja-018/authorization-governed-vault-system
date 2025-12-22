// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AuthorizationManager
 * @notice Manages withdrawal authorizations for the SecureVault
 * @dev Uses ECDSA signature verification and tracks used authorizations to prevent replay attacks
 */
contract AuthorizationManager {
    // Address authorized to sign withdrawal permissions
    address public immutable signer;
    
    // Tracks consumed authorization identifiers to prevent replay
    mapping(bytes32 => bool) public usedAuthorizations;
    
    // Events
    event AuthorizationConsumed(bytes32 indexed authorizationId, address indexed recipient, uint256 amount);
    event SignerInitialized(address indexed signer);
    
    // Custom errors
    error AlreadyInitialized();
    error InvalidSignature();
    error AuthorizationAlreadyUsed();
    error InvalidAuthorization();
    
    /**
     * @notice Initializes the authorization manager with a signer address
     * @param _signer The address authorized to sign withdrawal permissions
     */
    constructor(address _signer) {
        require(_signer != address(0), "Invalid signer address");
        signer = _signer;
        emit SignerInitialized(_signer);
    }
    
    /**
     * @notice Verifies a withdrawal authorization
     * @param vault The vault contract address
     * @param recipient The address receiving the withdrawal
     * @param amount The withdrawal amount
     * @param nonce Unique identifier for this authorization
     * @param signature The ECDSA signature from the authorized signer
     * @return bool True if authorization is valid
     */
    function verifyAuthorization(
        address vault,
        address recipient,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external returns (bool) {
        // Generate unique authorization ID
        bytes32 authorizationId = getAuthorizationId(vault, recipient, amount, nonce);
        
        // Check if authorization has already been used
        if (usedAuthorizations[authorizationId]) {
            revert AuthorizationAlreadyUsed();
        }
        
        // Verify signature
        bytes32 messageHash = getMessageHash(vault, recipient, amount, nonce);
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);
        
        if (!verifySignature(ethSignedMessageHash, signature)) {
            revert InvalidSignature();
        }
        
        // Mark authorization as consumed
        usedAuthorizations[authorizationId] = true;
        
        emit AuthorizationConsumed(authorizationId, recipient, amount);
        
        return true;
    }
    
    /**
     * @notice Generates the authorization ID
     * @dev This ID uniquely identifies an authorization and prevents replay
     */
    function getAuthorizationId(
        address vault,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                vault,
                recipient,
                amount,
                nonce,
                block.chainid
            )
        );
    }
    
    /**
     * @notice Constructs the message hash for signing
     */
    function getMessageHash(
        address vault,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                vault,
                recipient,
                amount,
                nonce,
                block.chainid
            )
        );
    }
    
    /**
     * @notice Prefixes the message hash with Ethereum signed message prefix
     */
    function getEthSignedMessageHash(bytes32 messageHash) public pure returns (bytes32) {
        return keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
    }
    
    /**
     * @notice Verifies an ECDSA signature
     */
    function verifySignature(
        bytes32 ethSignedMessageHash,
        bytes memory signature
    ) internal view returns (bool) {
        address recoveredSigner = recoverSigner(ethSignedMessageHash, signature);
        return recoveredSigner == signer;
    }
    
    /**
     * @notice Recovers the signer address from a signature
     */
    function recoverSigner(
        bytes32 ethSignedMessageHash,
        bytes memory signature
    ) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        
        return ecrecover(ethSignedMessageHash, v, r, s);
    }
    
    /**
     * @notice Checks if an authorization has been used
     */
    function isAuthorizationUsed(bytes32 authorizationId) external view returns (bool) {
        return usedAuthorizations[authorizationId];
    }
}

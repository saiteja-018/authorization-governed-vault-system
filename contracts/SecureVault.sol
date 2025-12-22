// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AuthorizationManager.sol";

/**
 * @title SecureVault
 * @notice A secure vault that holds funds and executes withdrawals only with valid authorizations
 * @dev Relies on AuthorizationManager for permission validation
 */
contract SecureVault {
    // Reference to the authorization manager
    AuthorizationManager public immutable authorizationManager;
    
    // Track total balance (for accounting verification)
    uint256 public totalBalance;
    
    // Events
    event Deposit(address indexed depositor, uint256 amount, uint256 newBalance);
    event Withdrawal(
        address indexed recipient,
        uint256 amount,
        uint256 nonce,
        uint256 remainingBalance
    );
    
    // Custom errors
    error UnauthorizedWithdrawal();
    error InsufficientBalance();
    error TransferFailed();
    error InvalidAmount();
    
    /**
     * @notice Initializes the vault with a reference to the authorization manager
     * @param _authorizationManager Address of the AuthorizationManager contract
     */
    constructor(address _authorizationManager) {
        require(_authorizationManager != address(0), "Invalid authorization manager");
        authorizationManager = AuthorizationManager(_authorizationManager);
    }
    
    /**
     * @notice Accept deposits from any address
     */
    receive() external payable {
        require(msg.value > 0, "Cannot deposit zero");
        totalBalance += msg.value;
        emit Deposit(msg.sender, msg.value, totalBalance);
    }
    
    /**
     * @notice Allows deposits via explicit function call
     */
    function deposit() external payable {
        require(msg.value > 0, "Cannot deposit zero");
        totalBalance += msg.value;
        emit Deposit(msg.sender, msg.value, totalBalance);
    }
    
    /**
     * @notice Executes a withdrawal with proper authorization
     * @param recipient The address receiving the funds
     * @param amount The amount to withdraw
     * @param nonce Unique identifier for this authorization
     * @param signature The authorization signature
     */
    function withdraw(
        address recipient,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external {
        // Validate inputs
        if (amount == 0) {
            revert InvalidAmount();
        }
        
        if (recipient == address(0)) {
            revert InvalidAmount();
        }
        
        // Check sufficient balance
        if (address(this).balance < amount) {
            revert InsufficientBalance();
        }
        
        // Request authorization validation from the authorization manager
        // This will revert if authorization is invalid or already used
        bool authorized = authorizationManager.verifyAuthorization(
            address(this),  // vault address
            recipient,
            amount,
            nonce,
            signature
        );
        
        if (!authorized) {
            revert UnauthorizedWithdrawal();
        }
        
        // Update internal accounting BEFORE transfer (checks-effects-interactions)
        totalBalance -= amount;
        
        // Transfer funds
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) {
            revert TransferFailed();
        }
        
        emit Withdrawal(recipient, amount, nonce, totalBalance);
    }
    
    /**
     * @notice Returns the current balance of the vault
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @notice Returns the tracked total balance (for verification)
     */
    function getTotalBalance() external view returns (uint256) {
        return totalBalance;
    }
}

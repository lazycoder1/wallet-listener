// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TestToken
 * @dev A simple ERC20 token for testing purposes.
 */
contract TestToken is ERC20 {
    /**
     * @dev Constructor that gives msg.sender all of existing tokens.
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply * (10 ** decimals()));
    }

    /**
     * @dev Public function to mint tokens to a specific account.
     * Only for testing convenience, typically this would be restricted.
     */
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}

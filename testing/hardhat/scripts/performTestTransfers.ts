import { ethers } from "hardhat";
import { TestToken } from "../typechain-types"; // Adjust if typechain output path is different

async function main() {
    const [deployer, account1, account2] = await ethers.getSigners();

    console.log("Deployer address:", deployer.address);
    console.log("Account1 address:", account1.address);
    console.log("Account2 address:", account2.address);
    console.log("Initial Deployer ETH balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
    console.log("Initial Account1 ETH balance:", ethers.formatEther(await ethers.provider.getBalance(account1.address)));

    // Deploy TestToken
    console.log("\nDeploying TestToken...");
    const TestTokenFactory = await ethers.getContractFactory("TestToken");
    const testToken = await TestTokenFactory.deploy("Test Token", "TTK", ethers.parseUnits("1000000", 18)) as TestToken;
    await testToken.waitForDeployment();
    const testTokenAddress = await testToken.getAddress();
    console.log(`TestToken deployed to: ${testTokenAddress}`);

    const deployerTokenBalance = await testToken.balanceOf(deployer.address);
    console.log(`Deployer initial TestToken balance: ${ethers.formatUnits(deployerTokenBalance, 18)} TTK`);

    // 1. Native ETH Transfer
    console.log("\nPerforming native ETH transfer...");
    const ethAmountToSend = ethers.parseEther("1.0");
    const txNative = await deployer.sendTransaction({
        to: account1.address,
        value: ethAmountToSend,
    });
    await txNative.wait(); // Wait for the transaction to be mined
    console.log(`Sent ${ethers.formatEther(ethAmountToSend)} ETH from ${deployer.address} to ${account1.address}`);
    console.log(`Native ETH transfer transaction hash: ${txNative.hash}`);
    console.log("Deployer ETH balance after native transfer:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
    console.log("Account1 ETH balance after native transfer:", ethers.formatEther(await ethers.provider.getBalance(account1.address)));

    // 2. ERC20 Token Transfer
    console.log("\nPerforming ERC20 token transfer...");
    const tokenAmountToSend = ethers.parseUnits("100", 18); // Send 100 TTK
    const txErc20 = await testToken.connect(deployer).transfer(account1.address, tokenAmountToSend);
    await txErc20.wait(); // Wait for the transaction to be mined
    console.log(`Sent ${ethers.formatUnits(tokenAmountToSend, 18)} TTK from ${deployer.address} to ${account1.address}`);
    console.log(`ERC20 Token transfer transaction hash: ${txErc20.hash}`);

    const deployerTokenBalanceAfter = await testToken.balanceOf(deployer.address);
    const account1TokenBalanceAfter = await testToken.balanceOf(account1.address);
    console.log(`Deployer TestToken balance after transfer: ${ethers.formatUnits(deployerTokenBalanceAfter, 18)} TTK`);
    console.log(`Account1 TestToken balance after transfer: ${ethers.formatUnits(account1TokenBalanceAfter, 18)} TTK`);

    console.log("\n--- Test Transfers Complete ---");
    console.log(`For testing your application, configure a chain with WebSocket RPC: ws://127.0.0.1:8545`);
    console.log(`Relevant addresses for testing:`);
    console.log(`  Account1 (receiver): ${account1.address}`);
    console.log(`  TestToken (ERC20): ${testTokenAddress}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}); 
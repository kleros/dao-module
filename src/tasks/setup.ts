import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { task, types } from "hardhat/config";
import defaultTemplate from "./defaultTemplate.json";
// const RealitioArbitratorProxy = require("./../../test/realitio-v-2-0-arbitrator-proxy.json");
const RealitioArbitratorProxy = require("./../../test/realitio-v-2-1-arbitrator-proxy.json");
const AutoAppealableArbitrator = require("./../../test/auto-appealable-arbitrator.json");

task("setup", "Provides the clearing price to an auction")
    .addParam("dao", "Address of the DAO (e.g. Safe)", undefined, types.string)
    .addParam("oracle", "Address of the oracle (e.g. Realitio)", undefined, types.string)
    .addParam(
        "template", 
        "Template that should be used for proposal questions (See https://github.com/realitio/realitio-dapp#structuring-and-fetching-information)", 
        undefined, 
        types.string
    )
    .addParam("timeout", "Timeout in seconds that should be required for the oracle", 2 * 24 * 3600, types.int, true)
    .addParam("cooldown", "Cooldown in seconds that should be required after a oracle provided answer", 24 * 3600, types.int, true)
    .addParam("expiration", "Time duration in seconds for which a positive answer is valid. After this time the answer is expired", 7 * 24 * 3600, types.int, true)
    .addParam("bond", "Minimum bond that is required for an answer to be accepted", "0", types.string, true)
    .setAction(async (taskArgs, hardhatRuntime) => {
        const [caller] = await hardhatRuntime.ethers.getSigners();
        console.log("Using the account:", caller.address);
        const Module = await hardhatRuntime.ethers.getContractFactory("DaoModule");
        const module = await Module.deploy(taskArgs.dao, taskArgs.oracle, taskArgs.timeout, taskArgs.cooldown, taskArgs.expiration, taskArgs.bond, taskArgs.template);

        console.log("Module deployed to:", module.address);
    });

task("verifyEtherscan", "Verifies the contract on etherscan")
    .addParam("module", "Address of the module", undefined, types.string)
    .addParam("dao", "Address of the DAO (e.g. Safe)", undefined, types.string)
    .addParam("oracle", "Address of the oracle (e.g. Realitio)", undefined, types.string)
    .addParam(
        "template", 
        "Template that should be used for proposal questions (See https://github.com/realitio/realitio-dapp#structuring-and-fetching-information)", 
        undefined, 
        types.string
    )
    .addParam("timeout", "Timeout in seconds that should be required for the oracle", 48 * 3600, types.int, true)
    .addParam("cooldown", "Cooldown in seconds that should be required after a oracle provided answer", 24 * 3600, types.int, true)
    .addParam("expiration", "Time duration in seconds for which a positive answer is valid. After this time the answer is expired", 7 * 24 * 3600, types.int, true)
    .addParam("bond", "Minimum bond that is required for an answer to be accepted", "0", types.string, true)
    .setAction(async (taskArgs, hardhatRuntime) => {
        await hardhatRuntime.run("verify", {
            address: taskArgs.module,
            constructorArgsParams: [
                taskArgs.dao, taskArgs.oracle, `${taskArgs.timeout}`, `${taskArgs.cooldown}`, `${taskArgs.expiration}`, `${taskArgs.bond}`, taskArgs.template
            ]
        })
    });

task("createDaoTemplate", "Creates a question template on the oracle address")
    .addParam("oracle", "Address of the oracle (e.g. Realitio)", undefined, types.string)
    .addParam(
        "template", 
        "Template string for question (should include placeholders for proposal id and txs hash)", 
        JSON.stringify(defaultTemplate), 
        types.string,
        true
    )
    .setAction(async (taskArgs, hardhatRuntime) => {
        const [caller] = await hardhatRuntime.ethers.getSigners();
        console.log("Using the account:", caller.address);
        const oracle = await hardhatRuntime.ethers.getContractAt("Realitio", taskArgs.oracle);
        const receipt = await oracle.createTemplate(taskArgs.template).then((tx: any) => tx.wait());
        const id = receipt.logs[0].topics[1]
        console.log("Template id:", id);
    });

task("deployArbitrator", "Deploy a centralized arbitrator along with a arbitration proxy to be used by Realitio.")
    .addParam("cost", "Price of arbitration in WEI", 1000, types.int)
    .addParam("oracle", "Address of the oracle (e.g. Realitio)", "0xa09ce5e7943f281a782a0dc021c4029f9088bec4", types.string)
    .setAction(async (taskArgs, hardhatRuntime) => {
        if (hardhatRuntime.network.name != "rinkeby") {
            console.log("deployArbitrator is only meant for Rinkeby for testing purposes.");
            console.log("If you want to deploy the DAO module to mainnet, skip this task and just run setup.");
            return;
        }
        const [caller] = await hardhatRuntime.ethers.getSigners();
        console.log("Using the account:", caller.address);

        const autoAppealableArbitrator = await hardhatRuntime.ethers.getContractFactory(AutoAppealableArbitrator.abi, AutoAppealableArbitrator.bytecode);
        const arbitrator = await autoAppealableArbitrator.deploy(taskArgs.cost);

        const metadata = "{\"tos\": , \"template_hashes\": }";
        const metaEvidence = "https://ipfs.kleros.io/ipfs/QmbnMiaatT4tHR2kGDfMSKFU9886tZPkEF8XMuQoNqWnqu";

        const realitioArbitratorProxy = await hardhatRuntime.ethers.getContractFactory(RealitioArbitratorProxy.abi, RealitioArbitratorProxy.bytecode);
        const arbitrationProxy = await realitioArbitratorProxy.deploy(taskArgs.oracle, metadata, arbitrator.address, 0x0, metaEvidence);

        console.log();
        console.log("Arbitration proxy (Realitio's arbitrator) deployed to:", arbitrationProxy.address);
        console.log("Centralized arbitrator deployed to:", arbitrator.address);
        console.log("To use centralized arbitrator go to https://centralizedarbitrator.netlify.app/");
        console.log("Set the DAO module arbitrator to the arbitration proxy address.");
    });

export { };
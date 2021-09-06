import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { Contract } from "ethers";
import { task, types } from "hardhat/config";
import { readFileSync } from "fs";

const RealitioArbitratorProxy = require("./../../test/realitio-v-2-1-arbitrator-proxy.json");
const AutoAppealableArbitrator = require("./../../test/auto-appealable-arbitrator.json");

interface Proposal {
    id: string,
    txs: ModuleTransaction[]
}

interface ExtendedProposal extends Proposal {
    txsHashes: string[]
}

interface ModuleTransaction {
    to: string,
    value: string,
    data: string,
    operation: number,
    nonce: number
}

const getProposalDetails = async (module: Contract, path: string): Promise<ExtendedProposal> => {
    const proposal: Proposal = JSON.parse(readFileSync(path, "utf-8"))
    const txsHashes = await Promise.all(proposal.txs.map(async (tx, index) => {
        return await module.getTransactionHash(tx.to, tx.value, tx.data, tx.operation, index)
    }));
    return {
        ...proposal,
        txsHashes
    }
}

task("addProposal", "Adds a proposal question")
        .addParam("module", "Address of the module", undefined, types.string)
        .addParam("proposalFile", "File with proposal information json", "sample_proposal.json", types.inputFile)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const Module = await ethers.getContractFactory("DaoModule");
            const module = await Module.attach(taskArgs.module);

            const proposal = await getProposalDetails(module, taskArgs.proposalFile);

            const tx = await module.addProposal(proposal.id, proposal.txsHashes);
            console.log("Transaction:", tx.hash);
        });

task("showProposal", "Shows proposal quesion details")
        .addParam("module", "Address of the module", undefined, types.string)
        .addParam("proposalFile", "File with proposal information json", "sample_proposal.json", types.inputFile)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const Module = await ethers.getContractFactory("DaoModule");
            const module = await Module.attach(taskArgs.module);

            const proposal = await getProposalDetails(module, taskArgs.proposalFile);

            const txHashesImages = ethers.utils.solidityPack(["bytes32[]"], [proposal.txsHashes])
            const txHashesHash = ethers.utils.keccak256(txHashesImages)

            console.log("### Proposal ####");
            console.log("ID:", proposal.id);
            console.log("Transactions hashes hash:", txHashesHash);
            console.log("Transactions hashes:", proposal.txsHashes);
            console.log("Transactions:", proposal.txs);
        });

task("executeProposal", "Executes a proposal")
        .addParam("module", "Address of the module", undefined, types.string)
        .addParam("proposalFile", "File with proposal information json", "sample_proposal.json", types.inputFile)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const Module = await ethers.getContractFactory("DaoModule");
            const module = await Module.attach(taskArgs.module);

            const proposal = await getProposalDetails(module, taskArgs.proposalFile);

            for (const index in proposal.txs) {
                const moduleTx = proposal.txs[index]
                const tx = await module.executeProposalWithIndex(
                    proposal.id, proposal.txsHashes, moduleTx.to, moduleTx.value, moduleTx.data, moduleTx.operation, index
                );
                console.log("Transaction:", tx.hash);
            }
        });

task("raiseDispute", "Requests arbitration for given question.")
        .addParam("proxy", "Address of the realitio-kleros arbitration proxy", undefined, types.string)
        .addParam("questionid", "Question id in realitio", undefined, types.string)
        .addParam("maxprevious", "If specified, reverts if a bond higher than this was submitted after you sent your transaction.", 0, types.int)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const realitioArbitratorProxy = await ethers.getContractFactory(RealitioArbitratorProxy.abi, RealitioArbitratorProxy.bytecode);
            const arbitrationProxy = await realitioArbitratorProxy.attach(taskArgs.proxy);

            const arbitrationCost = await arbitrationProxy.getDisputeFee(taskArgs.questionid);
            await arbitrationProxy.requestArbitration(taskArgs.questionid, taskArgs.maxprevious, {
                value: arbitrationCost
            });
        });

task("reportAnswer", "Requests arbitration for given question.")
        .addParam("module", "Address of the module", undefined, types.string)
        .addParam("proxy", "Address of the realitio-kleros arbitration proxy", undefined, types.string)
        .addParam("oracle", "Address of the oracle (e.g. Realitio)", undefined, types.string)
        .addParam("questionid", "Question id in realitio", "", types.string)
        .addParam(
            "template", 
            "Template that should be used for proposal questions (See https://github.com/realitio/realitio-dapp#structuring-and-fetching-information)", 
            undefined, 
            types.string
        )
        .addParam("proposalFile", "File with proposal information json", "sample_proposal.json", types.inputFile)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const realitioArbitratorProxy = await ethers.getContractFactory(RealitioArbitratorProxy.abi, RealitioArbitratorProxy.bytecode);
            const arbitrationProxy = await realitioArbitratorProxy.attach(taskArgs.proxy);

            const realitio = await ethers.getContractAt("Realitio", taskArgs.oracle);

            const Module = await ethers.getContractFactory("DaoModule");
            const module = await Module.attach(taskArgs.module);
            const proposal = await getProposalDetails(module, taskArgs.proposalFile);

            let questionID = taskArgs.questionid;
            if (taskArgs.questionid == "") {
                const question = await module.buildQuestion(proposal.id, proposal.txsHashes);
                const questionTimeout = await module.questionTimeout();
                questionID = await module.getQuestionId(taskArgs.template, question, taskArgs.proxy, questionTimeout, 0, 0);
            }
            let eventFilter = realitio.filters.LogNewAnswer(null, questionID);
            const events = await realitio.queryFilter(eventFilter);
            const lastEvent = events[0].args || { history_hash: null, answer: null, user: null };
            
            let historyHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
            if (events.length > 1) {
                const secondLastEvent = events[1].args || { history_hash: null, answer: null, user: null };
                historyHash = secondLastEvent.history_hash;
            }

            await arbitrationProxy.reportAnswer(questionID, historyHash, lastEvent.answer, lastEvent.user);
        });

task("executeRuling", "Requests arbitration for given question.")
        .addParam("arbitrator", "Address of the arbitrator", undefined, types.string)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const autoAppealableArbitrator = await ethers.getContractFactory(AutoAppealableArbitrator.abi, AutoAppealableArbitrator.bytecode);
            const arbitrator = await autoAppealableArbitrator.attach(taskArgs.arbitrator);

            await arbitrator.executeRuling(0);
        });

export { };
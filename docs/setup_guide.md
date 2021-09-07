# SafeSnap Setup Guide

This guide shows how to setup the DAO module with a Gnosis Safe on the Rinkeby testnetwork. It will use [Realitio](https://realit.io/) and can be used with [Snapshot](https://snapshot.org/).

For more information on SafeSnap please refer to the [Gnosis blog](https://blog.gnosis.pm/ea67eb95c34f).

## Prerequisites

To start the process you need to create a Safe on the Rinkeby test network (e.g. via https://rinkeby.gnosis-safe.io). This Safe will represent the DAO and hold all the assets (e.g. tokens and collectibles). A Safe transaction is required to setup the DAO module.

For the hardhat tasks to work the environment needs to be properly configured. See the [sample env file](../.env.sample) for more information.

The guide will use the Rinkeby ETH Realitio v2.1 contract at [`0xa09ce5e7943f281a782a0dc021c4029f9088bec4`](https://rinkeby.etherscan.io/address/0xa09ce5e7943f281a782a0dc021c4029f9088bec4#code). Other network addresses can be found in the truffle build folder on the [Realitio GitHub repo](https://github.com/realitio/realitio-contracts). E.g. on mainnet the ETH Realitio contract can be found at [`0x325a2e0f3cca2ddbaebb4dfc38df8d19ca165b47`](https://etherscan.io/address/0x325a2e0f3cca2ddbaebb4dfc38df8d19ca165b47#code).

DISCLAIMER: Check the deployed Realitio contracts before using them.

## Setting up the module

The first step is to deploy the module. Every DAO will have their own module. The module is linked to a DAO (called executor in the contract) and an oracle (e.g. Realitio). These cannot be changed after deployment.

As part of the setup you need to define or choose a template on Realitio. More information can be found in [their docs](https://github.com/realitio/realitio-dapp#structuring-and-fetching-information) 

### Setup the Realitio template

To define your own template a hardhat task is provided in the repository. It is possible to provide a template to that task via `--template` else the [default template](../src/tasks/defaultTemplate.json) is used. If the latter is chosen, replace `<snapshot-space>` in the title field accordingly.

The template should have the following format:
```json
{
    "title": "Did the proposal with the id %s pass the execution of the transactions with hash 0x%s?",
    "lang": "en",
    "type": "bool",
    "category": "DAO proposal"
}
```

- It is important that the `type` is `bool` as the module expects the outcome reported by Realitio to be `true`, `false` or `INVALID`
- The `category` and `lang` can be freely choosen and are only used in the Realitio web interfaces
- The title will also be displayed in the Realitio web interface and MUST include two `%s` placeholders
  - The first placeholder is for the `id` of the proposal (e.g. a ipfs hash)
  - The second placeholder is the hash of the concatenation of the EIP-712 transaction hashes (see the [README](../README.md) for more information)
- IMPORTANT: The template should make it clear when and how to vote on your questions
  - An example can be found in the [🍯DAO requirements](https://cloudflare-ipfs.com/ipfs/QmeJwtwdG4mPzC8sESrW7zqixZqdHDYnREz6ar9GCewgz7/)
  - DISCLAIMER: DO NOT BLINDLY COPY THE REQUIREMENTS. You should check the requirements and make the adjustments for your setup.

Using this template you can run the task by using `yarn hardhat --network <network> createDaoTemplate --oracle <oracle address> --template <your template json>` and this should provide you with a template id.

An example for this on Rinkeby would be (using the default template):
`yarn hardhat --network rinkeby createDaoTemplate --oracle 0xa09ce5e7943f281a782a0dc021c4029f9088bec4`

For this guide we will assume that the returned template id is `0x0000000000000000000000000000000000000000000000000000000000000dad`

### Deploying the module

Now that we have a template, a hardhat task can be used to deploy a DAO module instance. This setup task requires the following parameters: `dao` (the address of the Safe), `oracle` (the address of the Realitio contract) and `template` (the template to be used with Realitio). There are also optional parameters, for more information run `yarn hardhat setup --help`. In order to test the whole process conveniently, we are going to set the cooldown parameter to a low value. This means that we won't have to wait to execute the proposal once the oracle/kleros got a final answer.

An example for this on Rinkeby would be:
`yarn hardhat --network rinkeby setup --dao <safe_address> --oracle 0xa09ce5e7943f281a782a0dc021c4029f9088bec4 --template 0x0000000000000000000000000000000000000000000000000000000000000dad --cooldown 30`

This should return the address of the deployed DAO module. For this guide we assume this to be `0x4242424242424242424242424242424242424242`

Once the module is deployed you should verify the source code. If you use a network that is Etherscan compatible and you configure the `ETHERSCAN_API_KEY` in your environment you can use the provided hardhat task to do this. 

An example for this on Rinkeby would be:
`yarn hardhat --network rinkeby verifyEtherscan --module 0x4242424242424242424242424242424242424242 --dao <safe_address> --oracle 0xa09ce5e7943f281a782a0dc021c4029f9088bec4 --template 0x0000000000000000000000000000000000000000000000000000000000000dad --cooldown 30`

### Enabling the module

To allow the DAO module to actually execute transaction it is required to enable it on the Safe that it is connected to. For this it is possible to use the Transaction Builder on https://rinkeby.gnosis-safe.io. For this you can follow our tutorial on [adding a module](https://help.gnosis-safe.io/en/articles/4934427-add-a-module).

### Setting the module's arbitrator

By default, the arbitrator to which Realitio sends disputed proposals is the Safe's multisig itself. Of course this goes against the spirit of decentralized governance, but it could be useful during setup and the early days of the DAO. Eventually, the ruling power should be given to an impartial third party, a.k.a. Kleros.

For testing purposes, we recommend to start using a centralized arbitrator, fully controled by the deployer address. To deploy a centralized abritrator together with a proxy contract that connects Realitio with the arbitrator, run:

`yarn hardhat --network rinkeby deployArbitrator --oracle 0xa09ce5e7943f281a782a0dc021c4029f9088bec4`

Now go to https://rinkeby.gnosis-safe.io and create a "New Transaction" to interact with the SafeSnap contract. Complete the data as following:

- Contract address: address of the SafeSnap module (for example `0x4242424242424242424242424242424242424242`).
- From the dropdown choose `setArbitrator`.
- arbitrator (address): paste the address of the arbitration **proxy** contract deployed in the previous step.

Once the transaction gets confirmed, you can start ruling disputed proposals from https://centralizedarbitrator.netlify.app/.

### Removing Gnosis Safe signers

Last but not least, we have to remove the signers of the Safe, as they still have control over the multisig and some privileges over the SafeSnap module. Go again to https://rinkeby.gnosis-safe.io, go to "Settings" --> "Owners", and remove all owners of the multisig except for yourself. It's not possible to have an ownerless Safe. For this reason, the remaining owner (you) has to be replaced by the SafeSnap module address.

## Snapshot integration

Once the module is setup it is possible to configure a space on [Snapshot](https://snapshot.org/) to enable the SafeSnap plugin. For this the space settings needs to include the SafeSnap plugin with this configuration: 
```
{
  "address": "<module_address>"
}
```
. 
An example for this can be found in the [🍯DAO space configuration](https://cloudflare-ipfs.com/ipfs/QmahDCSkdED9BLZ3VtH6aJ8P5TmvMYEfA7fJa4hGsvEpi2/).

Once your space is configured you can attach transactions to you proposals via the plugin section:

1. Open the plugin selection

![Open the plugin selection](./snapshot_plugin_section.png)


2. Add SafeSnap plugin

![Add DAO module plugin](./snapshot_add_plugin.png)

3. Add DAO module transaction

<img src="./snapshot_module_add_tx.png"
     alt="Add DAO module transaction"
     width="250"/>
<img src="./snapshot_module_tx_details.png"
     alt="Enter transactiond etails"
     width="250" />
<img src="./snapshot_module_tx_confirm.png"
     alt="Check transaction details"
     width="250"/>

4. Check preview of transactions

![Transactions preview](./snapshot_plugin_preview.png)

Once the proposal has been resolved it is possible to submit the proposal to the DAO module via the plugin. 

This can also be done via the hardhat tasks provided in this repository. For more information run `yarn hardhat addProposal --help` or `yarn hardhat executeProposal --help`.

Once the question is available it can be answered via the Realitio web interface (e.g. https://reality.eth.link/app/).

## Testing Kleros arbitration

In order to test proposal disputes resolved by Kleros, "Apply for arbitration" on [reality.eth.link](reality.eth.link) after posting an answer. This will raise a dispute that you can control with the [centralized arbitrator](https://centralizedarbitrator.netlify.app/). To use the centralized arbitrator "Select" the centralized arbitrator address deployed earlier. Expand the dispute item and unselect "Give an appealable ruling". Next, choose the arbitrator ruling (No, Yes, Refuse to Arbitrate). This last step resolves the dispute, which now we have to report to Realitio by running:

`yarn hardhat --network rinkeby reportAnswer --module 0x4242424242424242424242424242424242424242 --proxy <arbitration_proxy_address> --oracle 0xa09ce5e7943f281a782a0dc021c4029f9088bec4`.

If the proposal was approved, we can execute the proposal using `yarn hardhat executeProposal --help`

## Monitoring your module

As anyone can submit proposals to your module it is recommended to setup some monitoring. The DAO module relies on the oracle (e.g. Realitio) to provide the correct answer so that no malicious transactions are executed. In the worst case the executor (e.g. the connected Safe) can invalidate a submitted proposal (see [README](../README.md) for more information). 

To make sure that all the involved stakeholders can react in a timely manner, the events emitted by the module contract should be monitored. Each time a new proposal is submitted the contract will emit a `ProposalQuestionCreated` event with the following parameters:
```
event ProposalQuestionCreated(
    bytes32 indexed questionId, // e.g. Realitio question id
    string indexed proposalId // e.g. Snapshot proposal id
);
```

There are different services available for this such as the [OpenZepplin Defender Sentinel](https://docs.openzeppelin.com/defender/sentinel).

# DreamCat Composite Market Registry

Permissionless Solidity registry for third-party composite markets (e.g. parlays) built on top of DreamDEX event-contract markets. Builders register metadata (name + ordered list of DreamDEX `marketId` legs); the DreamCat Terminal indexes these registrations for display.

- `src/Registry.sol` — the registry contract (`^0.8.25`). Entry ids are deterministic over `(deployer, name, legs)`; only the registering address may unregister. No access control, no upgradeability.
- `test/Registry.t.sol` — Foundry tests.
- `script/Deploy.s.sol` — broadcast deploy script reading `PRIVATE_KEY`.

## Test

```bash
cd contracts
forge test -vvv
```

(Foundry required: https://foundry.paradigm.xyz)

## Deploy to Somnia Shannon testnet

Not yet deployed — no funded deployer key exists. When ready:

```bash
cd contracts
export PRIVATE_KEY=0x<your-funded-private-key>

# via deploy script
forge script script/Deploy.s.sol \
  --rpc-url https://dream-rpc.somnia.network \
  --chain 50312 \
  --broadcast

# or directly
forge create src/Registry.sol:Registry \
  --rpc-url https://dream-rpc.somnia.network \
  --chain 50312 \
  --private-key $PRIVATE_KEY
```

Record the deployed address in this README.

## Terminal consumption

From the deployment block, fetch all `Registered(bytes32 indexed id, address indexed deployer, string name)` logs (`eth_getLogs`, topic0 of the event), then read `entries(id)` for each id to get `{deployer, name, legs[], createdAt}`. `Unregistered(id, deployer)` logs mark entries to drop; `entryCount()` / `allEntryIds()` provide an on-chain fallback enumeration.

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title Registry for third-party composite markets built on DreamDEX event contracts.
/// @notice Permissionless registry of composite market metadata. Anyone may register;
///     only the registering address (the deployer) may unregister its own entries.
contract Registry {
    /// @notice Metadata for one composite market. Each leg is a bytes32 DreamDEX marketId.
    struct MarketEntry {
        address deployer;
        string name;
        bytes32[] legs;
        uint64 createdAt;
    }

    /// @notice A composite market was registered.
    /// @param id Deterministic id derived from (deployer, name, legs).
    /// @param deployer Address that registered the entry.
    /// @param name Name of the composite market.
    event Registered(bytes32 indexed id, address indexed deployer, string name);

    /// @notice A composite market entry was removed by its deployer.
    /// @param id Id of the removed entry.
    /// @param deployer Address that registered and then removed the entry.
    event Unregistered(bytes32 indexed id, address indexed deployer);

    error EmptyName();
    error InvalidLegCount();
    error AlreadyRegistered();
    error NotDeployer();
    error NotFound();

    mapping(bytes32 id => MarketEntry) private _entries;
    bytes32[] private _ids;
    mapping(bytes32 id => uint256 position) private _positions;

    /// @dev `_positions` stores index + 1 so zero means "not registered".

    /// @notice Entry metadata by id. Unregistered ids return an empty entry (`deployer == address(0)`).
    function entries(bytes32 id) external view returns (MarketEntry memory) {
        return _entries[id];
    }

    /// @notice Registers a composite market and returns its deterministic id.
    /// @dev Reverts with `AlreadyRegistered` if the same address previously registered,
    ///     and has not unregistered, an identical (name, legs) combination.
    /// @param name Non-empty display name of the composite market.
    /// @param legs 2 to 10 DreamDEX marketIds, in order.
    /// @return id The derived entry id.
    function register(string calldata name, bytes32[] calldata legs) external returns (bytes32 id) {
        if (bytes(name).length == 0) revert EmptyName();
        if (legs.length < 2 || legs.length > 10) revert InvalidLegCount();

        bytes32 nameHash = keccak256(bytes(name));
        bytes32 legsHash = keccak256(abi.encodePacked(legs));
        id = keccak256(abi.encode(msg.sender, nameHash, legsHash));
        if (_positions[id] != 0) revert AlreadyRegistered();

        bytes32[] memory legCopy = legs;
        _entries[id] = MarketEntry({
            deployer: msg.sender,
            name: name,
            legs: legCopy,
            createdAt: uint64(block.timestamp)
        });
        _positions[id] = _ids.length + 1;
        _ids.push(id);

        emit Registered(id, msg.sender, name);
    }

    /// @notice Removes the caller's own registration.
    /// @param id Id returned at registration time.
    function unregister(bytes32 id) external {
        MarketEntry storage entry = _entries[id];
        if (entry.createdAt == 0) revert NotFound();
        if (entry.deployer != msg.sender) revert NotDeployer();

        delete _entries[id];

        uint256 index = _positions[id] - 1;
        uint256 lastIndex = _ids.length - 1;
        bytes32 lastId = _ids[lastIndex];
        _ids[index] = lastId;
        _positions[lastId] = index + 1;
        _ids.pop();
        delete _positions[id];

        emit Unregistered(id, msg.sender);
    }

    /// @notice Number of currently registered entries.
    function entryCount() external view returns (uint256) {
        return _ids.length;
    }

    /// @notice Id of the entry at `index` in the enumerable id list (order not stable across unregisters).
    function entryIdAt(uint256 index) external view returns (bytes32) {
        return _ids[index];
    }

    /// @notice All currently registered ids; convenience view for indexers.
    function allEntryIds() external view returns (bytes32[] memory) {
        return _ids;
    }
}

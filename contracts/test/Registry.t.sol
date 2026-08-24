// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";

contract RegistryTest is Test {
    Registry internal registry;

    string constant NAME = "BTC 2-leg parlay";
    bytes32[] internal defaultLegs;

    event Registered(bytes32 indexed id, address indexed deployer, string name);
    event Unregistered(bytes32 indexed id, address indexed deployer);

    function setUp() public {
        registry = new Registry();
        defaultLegs = new bytes32[](2);
        defaultLegs[0] = keccak256("dreamdex-market-1");
        defaultLegs[1] = keccak256("dreamdex-market-2");
    }

    function _expectedId(address deployer, string memory name, bytes32[] memory legs)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(deployer, keccak256(bytes(name)), keccak256(abi.encodePacked(legs)))
        );
    }

    function testRegisterHappyPath() public {
        vm.prank(makeAddr("builder"));
        bytes32 id = registry.register(NAME, defaultLegs);

        assertEq(id, _expectedId(makeAddr("builder"), NAME, defaultLegs));
        assertEq(registry.entryCount(), 1);
        assertEq(registry.entryIdAt(0), id);

        Registry.MarketEntry memory entry = registry.entries(id);
        assertEq(entry.deployer, makeAddr("builder"));
        assertEq(entry.name, NAME);
        assertEq(entry.legs.length, 2);
        assertEq(entry.legs[0], defaultLegs[0]);
        assertEq(entry.legs[1], defaultLegs[1]);
        assertEq(entry.createdAt, block.timestamp);
    }

    function testRegisterEmitsEvent() public {
        address builder = makeAddr("builder");
        bytes32 id = _expectedId(builder, NAME, defaultLegs);

        vm.prank(builder);
        vm.expectEmit(true, true, false, true, address(registry));
        emit Registered(id, builder, NAME);
        registry.register(NAME, defaultLegs);
    }

    function testNameCannotBeEmpty() public {
        vm.expectRevert(Registry.EmptyName.selector);
        registry.register("", defaultLegs);
    }

    function testOneLegReverts() public {
        bytes32[] memory legs = new bytes32[](1);
        legs[0] = keccak256("only");
        vm.expectRevert(Registry.InvalidLegCount.selector);
        registry.register(NAME, legs);
    }

    function testElevenLegsRevert() public {
        bytes32[] memory legs = new bytes32[](11);
        for (uint256 i = 0; i < legs.length; i++) {
            legs[i] = keccak256(abi.encode(i));
        }
        vm.expectRevert(Registry.InvalidLegCount.selector);
        registry.register(NAME, legs);
    }

    function testTwoAndTenLegsAreAllowed() public {
        bytes32[] memory two = new bytes32[](2);
        two[0] = keccak256("a");
        two[1] = keccak256("b");
        registry.register("two", two);

        bytes32[] memory ten = new bytes32[](10);
        for (uint256 i = 0; i < ten.length; i++) {
            ten[i] = keccak256(abi.encode("leg", i));
        }
        registry.register("ten", ten);

        assertEq(registry.entryCount(), 2);
    }

    function testDuplicateRegistrationRejected() public {
        registry.register(NAME, defaultLegs);
        vm.expectRevert(Registry.AlreadyRegistered.selector);
        registry.register(NAME, defaultLegs);
        assertEq(registry.entryCount(), 1);
    }

    function testSameNameDifferentDeployerIsAllowed() public {
        vm.prank(makeAddr("alice"));
        registry.register(NAME, defaultLegs);
        vm.prank(makeAddr("bob"));
        registry.register(NAME, defaultLegs);
        assertEq(registry.entryCount(), 2);
    }

    function testSameDeployerDifferentLegsIsAllowed() public {
        bytes32[] memory otherLegs = new bytes32[](3);
        otherLegs[0] = defaultLegs[0];
        otherLegs[1] = defaultLegs[1];
        otherLegs[2] = keccak256("extra");
        registry.register(NAME, defaultLegs);
        registry.register(NAME, otherLegs);
        assertEq(registry.entryCount(), 2);
    }

    function testUnregisterByNonDeployerReverts() public {
        vm.prank(makeAddr("builder"));
        bytes32 id = registry.register(NAME, defaultLegs);

        vm.prank(makeAddr("attacker"));
        vm.expectRevert(Registry.NotDeployer.selector);
        registry.unregister(id);
    }

    function testUnregisterUnknownIdReverts() public {
        vm.expectRevert(Registry.NotFound.selector);
        registry.unregister(_expectedId(address(this), NAME, defaultLegs));
    }

    function testUnregisterRemovesEntry() public {
        address builder = makeAddr("builder");
        vm.startPrank(builder);
        bytes32 id = registry.register(NAME, defaultLegs);

        vm.expectEmit(true, true, false, true, address(registry));
        emit Unregistered(id, builder);
        registry.unregister(id);
        vm.stopPrank();

        assertEq(registry.entryCount(), 0);

        Registry.MarketEntry memory entry = registry.entries(id);
        assertEq(entry.createdAt, 0);
        assertEq(entry.deployer, address(0));

        vm.prank(builder);
        registry.register(NAME, defaultLegs);
        assertEq(registry.entryCount(), 1);
    }

    function testEnumerationReturnsRegisteredIds() public {
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");

        vm.prank(alice);
        bytes32 idA = registry.register(NAME, defaultLegs);

        bytes32[] memory bobLegs = new bytes32[](3);
        bobLegs[0] = keccak256("b0");
        bobLegs[1] = keccak256("b1");
        bobLegs[2] = keccak256("b2");
        vm.prank(bob);
        bytes32 idB = registry.register("bob special", bobLegs);

        vm.prank(alice);
        bytes32 idC = registry.register("another one", bobLegs);

        assertEq(registry.allEntryIds().length, 3);
        assertTrue(
            registry.allEntryIds()[0] == idA && registry.allEntryIds()[1] == idB
                && registry.allEntryIds()[2] == idC
        );

        vm.prank(bob);
        registry.unregister(idB);

        assertEq(registry.entryCount(), 2);
        bytes32[] memory ids = registry.allEntryIds();
        assertTrue(ids[0] == idA && ids[1] == idC);
        assertTrue((registry.entryIdAt(0) == idA && registry.entryIdAt(1) == idC));

        vm.prank(alice);
        registry.unregister(idA);
        assertEq(registry.entryCount(), 1);
        assertEq(registry.entryIdAt(0), idC);
    }

    function testFuzzRegisterWithinBounds(uint8 legCount, string calldata name) public {
        legCount = uint8(bound(legCount, 2, 10));
        bytes32[] memory legs = new bytes32[](legCount);
        for (uint256 i = 0; i < legCount; i++) {
            legs[i] = keccak256(abi.encode("fuzz", i));
        }
        string memory nonEmpty = bytes(name).length == 0 ? NAME : name;

        vm.prank(makeAddr("fuzzer"));
        bytes32 id = registry.register(nonEmpty, legs);

        Registry.MarketEntry memory entry = registry.entries(id);
        assertEq(entry.legs.length, legCount);
        assertEq(entry.deployer, makeAddr("fuzzer"));
    }
}

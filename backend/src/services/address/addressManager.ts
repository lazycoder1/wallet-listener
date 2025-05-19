import type { Hex } from 'viem';

/**
 * Manages the list of tracked wallet addresses.
 * Provides methods to update, query, and check for tracked addresses.
 * Designed to be extensible for different storage backends in the future (e.g., Redis).
 */
export class AddressManager {
    private trackedAddressesSet: Set<Hex>;

    constructor(initialAddresses: Hex[] = []) {
        this.trackedAddressesSet = new Set(initialAddresses.map(a => a.toLowerCase() as Hex));
        console.log(`AddressManager initialized with ${this.trackedAddressesSet.size} addresses.`);
    }

    /**
     * Updates the entire list of tracked addresses.
     * @param newAddresses - The new list of addresses to track.
     */
    public updateAddresses(newAddresses: Hex[]): void {
        this.trackedAddressesSet.clear();
        newAddresses.forEach(address => {
            this.trackedAddressesSet.add(address.toLowerCase() as Hex);
        });
        console.log(`AddressManager updated. Now tracking ${this.trackedAddressesSet.size} addresses.`);
    }

    /**
     * Checks if a specific address is currently being tracked.
     * @param address - The address to check.
     * @returns True if the address is tracked, false otherwise.
     */
    public isTracking(address: Hex): boolean {
        return this.trackedAddressesSet.has(address.toLowerCase() as Hex);
    }

    /**
     * Retrieves a copy of all currently tracked addresses.
     * @returns An array of tracked addresses.
     */
    public getTrackedAddresses(): Hex[] {
        return Array.from(this.trackedAddressesSet);
    }

    /**
     * Gets the count of currently tracked addresses.
     * @returns The number of tracked addresses.
     */
    public getTrackedAddressCount(): number {
        return this.trackedAddressesSet.size;
    }
} 
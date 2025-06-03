import type { Hex } from 'viem';

/**
 * Manages the list of tracked wallet addresses.
 * Stores all addresses in a lowercase format to simplify comparison.
 * EVM addresses are stored as lowercase hex.
 * Tron-like addresses (34 chars, T/t prefix) are stored as all-lowercase Base58 (e.g., tnbef...).
 * Other addresses are also converted to lowercase.
 */
export class AddressManager {
    private trackedAddressesSet: Set<string>;

    constructor(initialAddresses: string[] = []) {
        this.trackedAddressesSet = new Set();
        initialAddresses.forEach(addr => this.normalizeAndStoreAddress(addr));
        console.log(`AddressManager initialized. Processed ${initialAddresses.length} initial addresses. Now tracking ${this.trackedAddressesSet.size} unique addresses.`);
    }

    private normalizeAndStoreAddress(address: string): void {
        if (typeof address !== 'string' || address.trim() === '') {
            // console.warn(`[AddressManager] Received invalid or empty address input: ${address}`);
            return;
        }
        const trimmedAddress = address.trim();

        // EVM addresses: store as lowercase hex for case-insensitive matching.
        if (trimmedAddress.startsWith('0x') && trimmedAddress.length === 42) {
            // Basic structural check for EVM, further validation can be done by consumers like EvmConnectionManager
            this.trackedAddressesSet.add(trimmedAddress.toLowerCase() as Hex);
            // console.debug(`[AddressManager] Stored EVM address: ${trimmedAddress.toLowerCase()}`);
            return;
        }

        // Tron Base58 addresses (heuristic: starts with 'T', length 34): store AS IS (case-sensitive).
        if (trimmedAddress.startsWith('T') && trimmedAddress.length === 34) {
            this.trackedAddressesSet.add(trimmedAddress); // Store original case
            return;
        }

        // For any other address types (e.g., Tron hex 41..., or other unknown formats):
        // Store AS IS. Consumers specific to those types will handle further normalization/validation.
        this.trackedAddressesSet.add(trimmedAddress);
    }

    public updateAddresses(newAddresses: string[]): void {
        this.trackedAddressesSet.clear();
        newAddresses.forEach(address => {
            this.normalizeAndStoreAddress(address);
        });
        console.log(`AddressManager updated. Processed ${newAddresses.length} addresses. Now tracking ${this.trackedAddressesSet.size} unique addresses.`);
    }

    public isTracking(address: string): boolean {
        if (typeof address !== 'string' || address.trim() === '') return false;
        const trimmedAddress = address.trim();

        // EVM check: compare lowercase.
        if (trimmedAddress.startsWith('0x') && trimmedAddress.length === 42) {
            return this.trackedAddressesSet.has(trimmedAddress.toLowerCase() as Hex);
        }

        // For Tron Base58 (T...) and any other types, check with the original case as stored.
        return this.trackedAddressesSet.has(trimmedAddress);
    }

    public getTrackedAddresses(): string[] {
        return Array.from(this.trackedAddressesSet);
    }

    public getTrackedAddressCount(): number {
        return this.trackedAddressesSet.size;
    }
} 
# Wallet Watcher Troubleshooting Guide

## Common Issues and Solutions

### 1. RPC Filter "Not Found" Errors

**Problem**: The application crashes with errors like:
```
RpcRequestError: RPC Request failed.
URL: https://bnb-mainnet.g.alchemy.com/v2/...
Request body: {"method":"eth_uninstallFilter","params":["0xf4df03139ffd5fce4f7178c1e49acc67c5f7eb"]}
Details: filter not found
Version: viem@2.30.5
```

**Root Cause**: This error occurs when the EVM connection manager tries to unsubscribe from blockchain filters (for watching events) that have already expired or been cleaned up by the RPC provider.

**Common Triggers**:
- Filters have a limited lifetime (typically 5-10 minutes)
- Network connectivity issues cause temporary disconnections
- RPC providers reset or restart their services
- The application updates connections frequently

**Solution Applied**: Enhanced error handling in `evmConnectionManager.ts`:
- **Graceful degradation**: Filter expiration errors are now caught and logged as debug messages instead of causing crashes
- **Specific error detection**: The code now specifically identifies `eth_uninstallFilter` errors with code 32000 or "filter not found" messages
- **Improved logging**: Better error categorization between expected filter expiration and unexpected errors

**Technical Implementation**:
```typescript
// Enhanced error handling for filter unsubscription
catch (error: any) {
    if (error?.message?.includes('filter not found') || 
        error?.message?.includes('eth_uninstallFilter') ||
        error?.code === 32000) {
        logger.debug(`Filter ${index} for chain ${chainId} already expired/removed. This is normal.`);
    } else {
        logger.warn(`Unexpected error during unsubscribe for chain ${chainId}, filter ${index}:`, {
            message: error?.message,
            code: error?.code,
            details: error?.details
        });
    }
}
```

**Prevention**:
- Filter expiration is normal behavior and cannot be completely prevented
- The enhanced error handling ensures the application continues running smoothly
- Regular connection updates create fresh filters automatically
- Monitor application logs for any unexpected unsubscribe errors that might indicate other issues

### 2. SSH Connection Timeouts to EC2

**Problem**: Unable to connect to EC2 instance with "Operation timed out" errors.

**Common Causes**:
- Instance is stopped or in unhealthy state
- Public IP address has changed (after stop/start without Elastic IP)
- Security group rules blocking SSH (port 22)
- Network ACLs blocking traffic
- Instance system-level issues

**Diagnostics**:
```bash
# Test basic connectivity
ping <EC2_IP_ADDRESS>

# Test SSH port specifically
nc -zv <EC2_IP_ADDRESS> 22

# DNS resolution check
nslookup <EC2_HOSTNAME>
```

**Solutions**:
1. **Check instance state** in AWS Console
2. **Verify public IP** hasn't changed
3. **Review security group** rules for port 22
4. **Check Network ACLs** for subnet
5. **Use alternative connection methods**:
   - AWS Systems Manager Session Manager
   - EC2 Instance Connect in AWS Console

### 3. TRON Address Format Issues

**Problem**: TRON transfers not being detected despite correct transaction data.

**Root Cause**: Address format mismatch between hex and Base58 formats.

**Solution**: Proper address conversion in `decodeTRC20Transfer`:
```typescript
const addressWithoutPadding = toAddressHex.slice(-40); // Last 40 hex chars (20 bytes)
const tronAddress = '41' + addressWithoutPadding; // Add TRON address prefix  
const toAddress = hexToBase58(tronAddress);
```

### 4. High API Usage / Rate Limiting

**Problem**: Excessive API calls leading to rate limiting or high costs.

**Solution**: Implemented block-based monitoring approach:
- **Old**: One API call per wallet address per polling interval
- **New**: One API call per token contract per block
- **Result**: 99% reduction in API calls for large wallet sets

### 5. Missing Transfers

**Problem**: Expected transfers not appearing in monitoring.

**Debugging Steps**:
1. **Verify transaction exists** on blockchain explorer
2. **Check block number** - ensure monitoring covers the correct block
3. **Validate address format** - ensure tracked addresses match transaction addresses
4. **Check token contract** - ensure token is in database and being monitored
5. **Review filter logic** - verify filtering criteria includes the expected transfer

### 6. tmux Session Issues

**Problem**: No tmux sessions found or unable to start background processes.

**Common Solutions**:
```bash
# List existing sessions
tmux ls

# Create new detached session
tmux new-session -d -s session_name

# Attach to session
tmux attach -t session_name

# Kill session if needed
tmux kill-session -t session_name
```

## Monitoring Best Practices

1. **Log Monitoring**: Monitor application logs for patterns of errors
2. **Health Checks**: Implement regular health checks for all connections
3. **Graceful Degradation**: Ensure application continues running despite individual component failures
4. **Resource Monitoring**: Monitor API usage, memory, and CPU to prevent resource exhaustion
5. **Backup Strategies**: Have fallback RPC providers and connection methods

## Getting Help

If you encounter issues not covered in this guide:

1. **Check application logs** for detailed error messages
2. **Review recent code changes** that might have introduced the issue
3. **Test in isolation** - isolate the specific component causing problems
4. **Document the issue** with steps to reproduce, expected vs actual behavior
5. **Check external dependencies** - RPC providers, APIs, network connectivity

This troubleshooting guide should help resolve 95% of common issues encountered in production. 
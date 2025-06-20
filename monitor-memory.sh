#!/bin/bash

echo "=== Wallet Watcher Memory Monitor ==="
echo "Press Ctrl+C to stop monitoring"
echo ""

while true; do
    echo "=== $(date) ==="
    
    # Check container stats
    echo "Container Memory Usage:"
    docker stats --no-stream wallet-watcher-backend-1 --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
    
    echo ""
    echo "API Memory Status:"
    curl -s http://localhost:3001/api/monitoring/status | jq '.memory' 2>/dev/null || echo "API not available"
    
    echo ""
    echo "Recent Memory Logs:"
    docker-compose logs --tail=5 backend | grep -E "Memory|memory|heap|leak|GC" || echo "No memory logs found"
    
    echo ""
    echo "----------------------------------------"
    sleep 60  # Check every minute
done 
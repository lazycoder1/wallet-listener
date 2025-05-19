import type { UnifiedTransferEvent } from './wsConnectionManager';

export async function handleWebSocketEvent(event: UnifiedTransferEvent): Promise<void> {
    console.log('Received WebSocket event:', {
        type: event.type,
        chainId: event.chainId,
        data: event.data
    });
} 
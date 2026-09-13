import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '../api/client';

// Keep a single shared socket connection across the app rather than
// reconnecting on every component mount.
let sharedSocket: Socket | null = null;

function getSocket() {
  if (!sharedSocket) {
    sharedSocket = io(API_URL);
  }
  return sharedSocket;
}

export function usePactUpdates(pactId: number | undefined, onUpdate: () => void) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!pactId) return;
    const socket = getSocket();
    socket.emit('join_pact', pactId);

    function handleUpdate(data: { pactId: number }) {
      if (data.pactId === pactId) {
        onUpdateRef.current();
      }
    }

    socket.on('pact_update', handleUpdate);
    return () => {
      socket.off('pact_update', handleUpdate);
    };
  }, [pactId]);
}

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

export type PactInviteEvent = {
  pactId: number;
  habitDescription: string;
  frequencyPerWeek: number;
  stakeAmount: number;
  cycleLengthDays: number;
  isGroup: boolean;
  from: { id: number; email: string };
};

// Joins a room keyed to the current user so the server can push things
// like a live pact-invite popup or a friend-request notification without
// the page needing to poll or reload.
export function useUserNotifications(
  userId: number | undefined,
  handlers: {
    onPactInvite?: (data: PactInviteEvent) => void;
    onFriendRequest?: () => void;
    onFriendRequestAccepted?: () => void;
  }
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId) return;
    const socket = getSocket();
    socket.emit('join_user', userId);

    function handlePactInvite(data: PactInviteEvent) {
      handlersRef.current.onPactInvite?.(data);
    }
    function handleFriendRequest() {
      handlersRef.current.onFriendRequest?.();
    }
    function handleFriendRequestAccepted() {
      handlersRef.current.onFriendRequestAccepted?.();
    }

    socket.on('pact_invite', handlePactInvite);
    socket.on('friend_request', handleFriendRequest);
    socket.on('friend_request_accepted', handleFriendRequestAccepted);

    return () => {
      socket.off('pact_invite', handlePactInvite);
      socket.off('friend_request', handleFriendRequest);
      socket.off('friend_request_accepted', handleFriendRequestAccepted);
    };
  }, [userId]);
}

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '../api/client';

// One shared connection across the app.
let sharedSocket: Socket | null = null;

function getSocket() {
  if (!sharedSocket) {
    sharedSocket = API_URL ? io(API_URL) : io();
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
  stakeAmount: number;
  scheduledDays: number;
  startDate: string;
  endDate: string;
  isGroup: boolean;
  from: { id: number; email: string; username?: string | null };
};

export type FriendRequestEvent = {
  id: number;
  from: { id: number; email: string; username?: string | null };
};

export type PactDayCompletedEvent = {
  pactId: number;
  habitDescription: string;
  scheduledDate: string;
};

export type DebtReminderEvent = {
  settlementId: number;
  pactId: number;
  habitDescription: string;
  scheduledDate: string;
  amount: number;
};

export type PaymentReceivedEvent = {
  pactId: number;
  habitDescription: string;
  scheduledDate: string;
  amount: number;
  payer: { id: number; username: string | null; email: string };
};

export function useUserNotifications(
  userId: number | undefined,
  handlers: {
    onPactInvite?: (data: PactInviteEvent) => void;
    onFriendRequest?: (data: FriendRequestEvent) => void;
    onFriendRequestAccepted?: () => void;
    onPactDayCompleted?: (data: PactDayCompletedEvent) => void;
    onDebtReminder?: (data: DebtReminderEvent) => void;
    onPaymentReceived?: (data: PaymentReceivedEvent) => void;
  }
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId) return;
    const socket = getSocket();
    // Sends the token, not a bare id — server verifies and joins the real room.
    const token = localStorage.getItem('token');
    if (token) socket.emit('join_user', token);

    function handlePactInvite(data: PactInviteEvent) { handlersRef.current.onPactInvite?.(data); }
    function handleFriendRequest(data: FriendRequestEvent) { handlersRef.current.onFriendRequest?.(data); }
    function handleFriendRequestAccepted() { handlersRef.current.onFriendRequestAccepted?.(); }
    function handlePactDayCompleted(data: PactDayCompletedEvent) { handlersRef.current.onPactDayCompleted?.(data); }
    function handleDebtReminder(data: DebtReminderEvent) { handlersRef.current.onDebtReminder?.(data); }
    function handlePaymentReceived(data: PaymentReceivedEvent) { handlersRef.current.onPaymentReceived?.(data); }

    socket.on('pact_invite', handlePactInvite);
    socket.on('friend_request', handleFriendRequest);
    socket.on('friend_request_accepted', handleFriendRequestAccepted);
    socket.on('pact_day_completed', handlePactDayCompleted);
    socket.on('debt_reminder', handleDebtReminder);
    socket.on('payment_received', handlePaymentReceived);

    return () => {
      socket.off('pact_invite', handlePactInvite);
      socket.off('friend_request', handleFriendRequest);
      socket.off('friend_request_accepted', handleFriendRequestAccepted);
      socket.off('pact_day_completed', handlePactDayCompleted);
      socket.off('debt_reminder', handleDebtReminder);
      socket.off('payment_received', handlePaymentReceived);
    };
  }, [userId]);
}

import type { PaymentReceivedEvent } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { formatMoney } from '../lib/format';
import Card from './ui/Card';
import Button from './ui/Button';

// Shown live to everyone who was owed a share of a missed day's stake, the
// moment either side (payer or any receiver) confirms it was paid.
export default function PaymentReceivedPopup({
  event,
  onDone,
}: {
  event: PaymentReceivedEvent;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const payerName = event.payer.username || event.payer.email;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <p className="text-3xl mb-2">💸</p>
        <h2 className="font-display text-lg text-[var(--ink)] mb-1">Payment confirmed</h2>
        <p className="text-sm text-[var(--graphite)] mb-4">
          {payerName} paid up {formatMoney(event.amount, user?.currency)} for missing "{event.habitDescription}" on {event.scheduledDate}.
        </p>
        <Button className="w-full" onClick={onDone}>
          Nice
        </Button>
      </Card>
    </div>
  );
}

import type { PactDayCompletedEvent } from '../api/socket';
import Card from './ui/Card';
import Button from './ui/Button';

// Shown when a day closes out with everyone checked in.
export default function PactCompletedPopup({
  event,
  onDone,
}: {
  event: PactDayCompletedEvent;
  onDone: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <p className="text-3xl mb-2">🎉</p>
        <h2 className="font-display text-lg text-[var(--ink)] mb-1">Bravo!</h2>
        <p className="text-sm text-[var(--graphite)] mb-4">
          Everyone kept up their end on "{event.habitDescription}" for {event.scheduledDate} — no stakes lost.
        </p>
        <Button className="w-full" onClick={onDone}>
          Nice
        </Button>
      </Card>
    </div>
  );
}

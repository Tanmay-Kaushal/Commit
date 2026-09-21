import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import NavBar from '../components/NavBar';

type Event = {
  id: number;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
};

const eventLabels: Record<string, string> = {
  pact_created: 'Pact created',
  pact_accepted: 'A participant accepted the invite',
  participant_declined: 'A participant declined the invite',
  participant_left: 'A participant left the pact',
  participant_added: 'Creator added a participant',
  participant_removed: 'Creator removed a participant',
  pact_activated: 'Pact activated',
  pact_cancelled: 'Pact cancelled (fewer than 2 accepted by the start date)',
  pact_closed: 'Pact closed early by its creator',
  pact_reopened: 'Pact reopened by its creator',
  pact_modified: 'Creator edited the pact',
  check_in: 'Checked in',
  check_in_undone: 'Check-in undone',
  day_settled: 'Day settled',
  dispute_raised: 'Dispute raised',
  dispute_resolved: 'Dispute resolved',
  settlement_confirmed: 'Payment confirmed',
};

export default function TimelinePage() {
  const { id } = useParams();
  const [events, setEvents] = useState<Event[]>([]);
  const [loadError, setLoadError] = useState('');

  function load() {
    setLoadError('');
    client
      .get(`/events/${id}`)
      .then((res) => setEvents(res.data))
      .catch((err) => setLoadError(err.response?.data?.error || 'Could not load history. Try refreshing the page.'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to={`/pacts/${id}`} className="text-sm text-stone-500 dark:text-stone-400 underline">
          &larr; Back to pact
        </Link>

        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mt-4 mb-6">History</h1>

        {loadError && (
          <p className="text-red-600 dark:text-red-400 text-sm mb-4">
            {loadError}{' '}
            <button onClick={load} className="underline">
              Retry
            </button>
          </p>
        )}

        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3 flex items-center justify-between"
            >
              <span className="text-sm text-stone-900 dark:text-stone-100">
                {eventLabels[event.event_type] || event.event_type}
              </span>
              <span className="text-xs text-stone-400 dark:text-stone-500">
                {new Date(event.created_at + 'Z').toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  pact_accepted: 'Partner accepted the invite',
  cycle_started: 'New cycle started',
  check_in: 'Checked in',
  cycle_completed: 'Cycle completed',
  cycle_forfeited: 'Cycle forfeited',
  dispute_raised: 'Dispute raised',
  dispute_resolved: 'Dispute resolved',
};

export default function TimelinePage() {
  const { id } = useParams();
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    client.get(`/events/${id}`).then((res) => setEvents(res.data));
  }, [id]);

  return (
    <div className="min-h-screen bg-stone-50">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to={`/pacts/${id}`} className="text-sm text-stone-500 underline">
          &larr; Back to pact
        </Link>

        <h1 className="text-xl font-semibold text-stone-900 mt-4 mb-6">History</h1>

        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white border border-stone-200 rounded-lg px-4 py-3 flex items-center justify-between"
            >
              <span className="text-sm text-stone-900">
                {eventLabels[event.event_type] || event.event_type}
              </span>
              <span className="text-xs text-stone-400">
                {new Date(event.created_at + 'Z').toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

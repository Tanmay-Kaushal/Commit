import { useState } from 'react';

export default function InviteLinkButton({
  label,
  fetchLink,
  className,
}: {
  label: string;
  fetchLink: () => Promise<string>;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    if (url) {
      setUrl(null);
      return;
    }
    setError('');
    setBusy(true);
    try {
      setUrl(await fetchLink());
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not get an invite link');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={busy}
        className={className || 'text-sm text-stone-900 dark:text-stone-100 underline disabled:opacity-40'}
      >
        {busy ? 'Loading...' : label}
      </button>
      {error && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{error}</p>}
      {url && (
        <div className="mt-2 flex items-center gap-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 border border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 rounded-lg px-3 py-2 text-xs"
          />
          <button
            onClick={handleCopy}
            className="text-xs bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-3 py-2 whitespace-nowrap hover:bg-stone-300 dark:hover:bg-stone-600 transition"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}

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
        className={className || 'text-sm text-[var(--ink)] underline disabled:opacity-40'}
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
            className="flex-1 min-w-0 border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] rounded-xl px-3 py-2 text-xs"
          />
          <button
            onClick={handleCopy}
            className="text-xs border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] rounded-xl px-3 py-2 whitespace-nowrap hover:bg-[var(--line)] transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Share2, MessageCircle, Mail, Download, ChevronDown } from 'lucide-react';

/**
 * A "Share / Send" action menu for a generated PDF document.
 *
 * getBlob: async () => { blob, filename } — fetches the PDF from the authenticated API.
 * customerPhone / customerEmail: used to pre-fill WhatsApp / email fallbacks.
 *
 * Behavior is honest about browser capability:
 * - If the Web Share API supports sharing files (most Android browsers, some desktop),
 *   "Share PDF" hands the file straight to the native share sheet (WhatsApp, Email,
 *   Telegram, etc. all show up there automatically).
 * - Where that isn't supported (most desktop browsers, iOS Safari for files), WhatsApp
 *   and Email fall back to: download the PDF, then open the WhatsApp/mailto link with a
 *   clear instruction to attach the file manually. We never claim a browser can silently
 *   attach a local file to WhatsApp or an email — that isn't possible from a web app.
 */
export default function ShareMenu({ getBlob, documentLabel, customerPhone, customerEmail, className = '' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function withBlob(action) {
    if (typeof getBlob !== 'function') return;
    setBusy(true);
    try {
      const { blob, filename } = await getBlob();
      const file = new File([blob], filename || `${documentLabel}.pdf`, { type: 'application/pdf' });
      if (typeof action === 'function') {
        await action(file, blob, filename);
      }
    } catch (err) {
      toast.error(`Failed to prepare ${documentLabel}.`);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  function triggerDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `${documentLabel}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  }

  async function handleNativeShare() {
    await withBlob(async (file) => {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: documentLabel, text: documentLabel });
      } else {
        toast.error('Your browser does not support sharing files directly. Use WhatsApp, Email, or Download instead.');
      }
    });
  }

  async function handleWhatsApp() {
    await withBlob(async (file, blob, filename) => {
      // A browser cannot programmatically attach a local file to WhatsApp — that API
      // doesn't exist. Try native file sharing first (many mobile browsers route this
      // straight into the WhatsApp share target); otherwise download + open the chat
      // with clear instructions.
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: documentLabel, text: documentLabel });
          return;
        } catch (e) {
          // user cancelled or share failed — fall through to the manual fallback below
        }
      }
      triggerDownload(blob, filename);
      const digits = (customerPhone || '').replace(/[^\d+]/g, '');
      const waUrl = digits ? `https://wa.me/${digits.replace(/^\+/, '')}` : 'https://wa.me/';
      window.open(waUrl, '_blank');
      toast.success('PDF downloaded. Attach it manually in the WhatsApp chat that just opened.', { duration: 6000 });
    });
  }

  async function handleEmail() {
    await withBlob(async (file, blob, filename) => {
      triggerDownload(blob, filename);
      const subject = encodeURIComponent(documentLabel);
      const body = encodeURIComponent(`Please find attached: ${filename}.\n\n(The file has been downloaded — please attach it manually before sending.)`);
      const mailto = `mailto:${customerEmail || ''}?subject=${subject}&body=${body}`;
      window.location.href = mailto;
      toast.success('PDF downloaded. Attach it manually in the email that just opened.', { duration: 6000 });
    });
  }

  async function handleDownload() {
    await withBlob(async (file, blob, filename) => triggerDownload(blob, filename));
  }

  const canNativeShareFiles = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button className="btn-secondary" disabled={busy} onClick={() => setOpen((o) => !o)}>
        <Share2 className="w-4 h-4" /> <span className="hidden sm:inline">Share / Send</span> <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 max-w-[85vw] card p-1 z-30 shadow-lg">
          {canNativeShareFiles && (
            <MenuItem icon={Share2} label="Share PDF" onClick={handleNativeShare} disabled={busy} />
          )}
          <MenuItem icon={MessageCircle} label="WhatsApp" onClick={handleWhatsApp} disabled={busy} />
          <MenuItem icon={Mail} label="Email" onClick={handleEmail} disabled={busy} />
          <MenuItem icon={Download} label="Download" onClick={handleDownload} disabled={busy} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, disabled }) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Cloud, CheckCircle2, AlertCircle, ExternalLink, X, KeyRound, Copy } from 'lucide-react';
import { backupApi } from '../../api/services';

export default function GoogleConnectModal({ isOpen, onClose, isConfigured }) {
  const [authUrl, setAuthUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      backupApi
        .getOAuthUrl()
        .then((res) => {
          if (res.data?.url) setAuthUrl(res.data.url);
        })
        .catch(() => {
          setAuthUrl('');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const redirectUriLocal = `${window.location.protocol}//${window.location.hostname}:5000/api/backup/oauth/callback`;

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-2xl p-0 overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-blue-500" />
            <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100">
              CONNECT PERSONAL GOOGLE DRIVE (100% FREE CLOUD BACKUP)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200">
            <p className="font-bold flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="w-4 h-4 text-blue-500" /> PKR 0 Recurring Cost Protection
            </p>
            <p className="text-[11px] text-blue-800 dark:text-blue-300 mt-1 leading-relaxed">
              This system connects directly to your dedicated personal Gmail account using Google's official free Drive
              API (OAuth 2.0). It only requests access to create and manage its own private folder (
              <code>Installment-System-Backups</code>), without touching any other files in your Google Drive.
            </p>
          </div>

          {/* Setup Guide */}
          <div className="space-y-3">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 text-xs uppercase tracking-wider">
              Step-by-Step Google Cloud Console Setup Instructions
            </h3>

            <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300 leading-relaxed">
              <li>
                Open{' '}
                <a
                  href="https://console.cloud.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-600 hover:underline font-semibold inline-flex items-center gap-0.5"
                >
                  Google Cloud Console <ExternalLink className="w-3 h-3 inline" />
                </a>{' '}
                and create a free project named <strong>Installment-Backup</strong>.
              </li>
              <li>
                Go to <strong>APIs & Services → Library</strong>, search for <strong>Google Drive API</strong>, and click{' '}
                <strong>Enable</strong>.
              </li>
              <li>
                Go to <strong>APIs & Services → OAuth consent screen</strong>:
                <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-gray-600 dark:text-gray-400">
                  <li>User Type: <strong>External</strong></li>
                  <li>App name: <strong>Installment Management System</strong></li>
                  <li>User support email: Your new Gmail account</li>
                  <li>
                    Under <strong>Test users</strong>, click <strong>Add Users</strong> and add your new Gmail account.
                  </li>
                </ul>
              </li>
              <li>
                Go to <strong>APIs & Services → Credentials → Create Credentials → OAuth client ID</strong>:
                <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-gray-600 dark:text-gray-400">
                  <li>Application type: <strong>Web application</strong></li>
                  <li>Name: <strong>Installment Web Client</strong></li>
                  <li>
                    Authorized redirect URIs (add this exact URL):
                    <div className="flex items-center gap-1.5 mt-1 font-mono text-[11px] bg-gray-100 dark:bg-gray-800 p-1.5 rounded">
                      <span className="truncate flex-1">{redirectUriLocal}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(redirectUriLocal)}
                        className="text-primary-600 hover:text-primary-700 p-0.5"
                        title="Copy Redirect URI"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </li>
                </ul>
              </li>
              <li>
                Copy the generated <strong>Client ID</strong> and <strong>Client Secret</strong> into your{' '}
                <code>backend/.env</code> file:
                <pre className="mt-1 p-2 bg-gray-900 text-gray-100 rounded font-mono text-[11px] overflow-x-auto">
{`GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=${redirectUriLocal}`}
                </pre>
              </li>
            </ol>
          </div>

          {/* Connection Trigger */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
            {authUrl ? (
              <div className="flex flex-col items-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-center">
                <p className="font-bold text-xs text-emerald-800 dark:text-emerald-300">
                  ✓ Google OAuth Credentials Detected!
                </p>
                <p className="text-[11px] text-gray-600 dark:text-gray-400">
                  Click below to authorize this application with your new dedicated Gmail account.
                </p>
                <a
                  href={authUrl}
                  className="btn-primary mt-2 text-xs flex items-center gap-2 py-2 px-4 shadow-md"
                >
                  <Cloud className="w-4 h-4" />
                  Sign In with Google Account
                </a>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-500" /> Awaiting Google Cloud Credentials in backend/.env
                </p>
                <p className="text-[11px] text-gray-600 dark:text-gray-400">
                  Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to your backend environment,
                  then reopen this modal to sign in with your Gmail account.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end bg-gray-50 dark:bg-gray-800/40">
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

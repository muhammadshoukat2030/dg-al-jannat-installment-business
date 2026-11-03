import React from 'react';

/**
 * Developer branding footer for all screen displays, normal printouts, and thermal slips.
 * Exact Required Text: Developed by SHOUKAT | 03348004300 | devzore.com
 *
 * Characteristics:
 * - Short, compact, and professionally aligned.
 * - Subtle accent color (Indigo: #4F46E5 / text-indigo-600 dark:text-indigo-400 print:text-indigo-700)
 *   that remains readable across Light Mode, Dark Mode, and paper/PDF prints.
 * - Small font (11px / 12px) with crisp contrast.
 * - Clickable phone link (`tel:03348004300`) and website link (`https://devzore.com`).
 * - For thermal print slips (thermal={true}), outputs compact plain monospace text without icons.
 * - Break-inside avoid prevents pagination splits or extra blank pages.
 */
export default function DeveloperFooter({ className = '', thermal = false }) {
  if (thermal) {
    return (
      <div
        className={`developer-branding-footer font-mono text-[10px] tracking-tight text-center text-gray-500 dark:text-gray-400 py-1.5 select-none ${className}`}
        data-testid="developer-footer-thermal"
      >
        Developed by SHOUKAT | 03348004300 | devzore.com
      </div>
    );
  }

  return (
    <footer
      className={`developer-branding-footer py-3 text-center text-xs transition-colors border-t border-theme-border mt-6 print:mt-4 print:pt-2 print:border-t print:border-gray-200 print:break-inside-avoid ${className}`}
      data-testid="developer-footer"
    >
      <span className="text-indigo-600 dark:text-indigo-400 print:text-indigo-700 font-medium">
        Developed by SHOUKAT
      </span>
      <span className="text-gray-400 dark:text-gray-500 print:text-gray-400 select-none"> | </span>
      <a
        href="tel:03348004300"
        className="text-indigo-600 dark:text-indigo-400 print:text-indigo-700 hover:underline transition-colors font-medium"
        title="Call 03348004300"
      >
        03348004300
      </a>
      <span className="text-gray-400 dark:text-gray-500 print:text-gray-400 select-none"> | </span>
      <a
        href="https://devzore.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-600 dark:text-indigo-400 print:text-indigo-700 hover:underline transition-colors font-medium"
        title="Visit devzore.com"
      >
        devzore.com
      </a>
    </footer>
  );
}

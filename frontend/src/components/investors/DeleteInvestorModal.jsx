import { useState } from 'react';
import toast from 'react-hot-toast';
import { investorApi } from '../../api/services';

export default function DeleteInvestorModal({ investor, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    try {
      const res = await investorApi.remove(investor._id);
      toast.success(res.data.message || 'Investor removed.');
      onDeleted();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove investor.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold mb-2 text-red-600">Delete Investor</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
          You are about to delete <span className="font-semibold">{investor.name}</span> ({investor.investorId}).
        </p>
        <p className="text-sm text-gray-500 mb-4">
          If this investor has no investment or contract history, they'll be permanently removed. If they do, they'll
          be safely archived instead — their transactions and funded contracts stay fully intact and nothing is lost.
        </p>
        <div className="flex justify-end gap-3 flex-wrap">
          <button className="btn-secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button className="btn-danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Removing...' : 'Delete Investor'}
          </button>
        </div>
      </div>
    </div>
  );
}

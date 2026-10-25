import { useState } from 'react';
import toast from 'react-hot-toast';
import { customerApi } from '../../api/services';

export default function DeleteCustomerModal({ customer, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    try {
      const res = await customerApi.remove(customer._id);
      toast.success(res.data.message || 'Customer deleted.');
      onDeleted();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete customer.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold mb-2 text-red-600">Delete Customer</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
          You are about to delete <span className="font-semibold">{customer.name}</span> ({customer.customerId}).
        </p>
        <p className="text-sm text-gray-500 mb-4">
          This customer will no longer appear in your customer list. Any existing financial history is preserved
          safely and will not be lost.
        </p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button className="btn-danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

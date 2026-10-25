import { formatCurrency, formatDate } from '../../utils/format';
import StatusBadge from '../common/StatusBadge';

export default function InstallmentTable({ schedule, onRecordPayment }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">No.</th>
            <th className="px-3 py-2 font-medium">Month</th>
            <th className="px-3 py-2 font-medium">Due Date</th>
            <th className="px-3 py-2 font-medium">Amount Due</th>
            <th className="px-3 py-2 font-medium">Paid</th>
            <th className="px-3 py-2 font-medium">Remaining</th>
            <th className="px-3 py-2 font-medium">Payment Date</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium no-print">Actions</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((row) => (
            <tr key={row._id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-2">{row.installmentNumber}</td>
              <td className="px-3 py-2">{row.monthLabel}</td>
              <td className="px-3 py-2">{formatDate(row.dueDate)}</td>
              <td className="px-3 py-2">{formatCurrency(row.amountDue)}</td>
              <td className="px-3 py-2">{formatCurrency(row.paidAmount)}</td>
              <td className="px-3 py-2">{formatCurrency(row.amountDue - row.paidAmount)}</td>
              <td className="px-3 py-2">{formatDate(row.paymentDate)}</td>
              <td className="px-3 py-2">
                <StatusBadge status={row.status} />
              </td>
              <td className="px-3 py-2 no-print">
                {row.status !== 'PAID' && (
                  <button className="text-primary-600 text-xs font-medium hover:underline" onClick={() => onRecordPayment(row)}>
                    Record
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

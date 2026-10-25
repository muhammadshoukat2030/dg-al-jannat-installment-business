import { STATUS_STYLES } from '../../utils/format';

export default function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_STYLES[status] || STATUS_STYLES.PENDING}`}>{status}</span>;
}

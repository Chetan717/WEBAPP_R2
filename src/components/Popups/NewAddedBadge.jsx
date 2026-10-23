import { isNewSubtypeDate } from "../../utils/popupModel";
import "./PopupCard.css";
export function hasNewSubtype(group) {
  const values = Array.isArray(group?.newSubtypeDates) ? group.newSubtypeDates : (group?.templates || []).map(row => row.subtypeAddedAt);
  return values.some(value => isNewSubtypeDate(value));
}
export default function NewAddedBadge({ date, dates, className = "" }) {
  if (!(Array.isArray(dates) ? dates.some(value => isNewSubtypeDate(value)) : isNewSubtypeDate(date))) return null;
  return <span className={`mlm-new-added ${className}`}>New Added</span>;
}

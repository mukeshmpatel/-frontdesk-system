export function taskSlaMinutes(task: { urgency: string; assignedRole: string }) {
  if (task.urgency === "CRITICAL") return 10;
  if (task.assignedRole === "HOUSEKEEPING") return 15;
  return 15;
}

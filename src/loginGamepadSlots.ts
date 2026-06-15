/** Ordered targets for login screen controller navigation (top → bottom). */
export type LoginSlotId =
  | "host"
  | "username"
  | "password"
  | "togglePassword"
  | "remember"
  | "submit"
  | "offline"
  | "retry";

export function loginSlotOrder(
  includeRetry: boolean,
  includeOffline = false,
): LoginSlotId[] {
  const base: LoginSlotId[] = [
    "host",
    "username",
    "password",
    "togglePassword",
    "remember",
    "submit",
  ];
  if (includeOffline) base.push("offline");
  if (includeRetry) base.push("retry");
  return base;
}

export function loginSlotIndex(
  order: LoginSlotId[],
  id: LoginSlotId,
): number {
  const i = order.indexOf(id);
  return i >= 0 ? i : 0;
}

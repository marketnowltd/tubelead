export const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", waiting_customer: "Waiting for customer", resolved: "Resolved", closed: "Closed" };
export const STATUS_TONE: Record<string, "neutral" | "cyan" | "amber" | "green" | "red"> = { open: "cyan", in_progress: "cyan", waiting_customer: "amber", resolved: "green", closed: "neutral" };
export const REFUND_TONE: Record<string, "neutral" | "cyan" | "amber" | "green" | "red"> = { pending: "amber", approved: "cyan", rejected: "neutral", refunded: "green" };
export const CATEGORY_LABEL: Record<string, string> = { general: "General", technical: "Technical", billing: "Billing", refund: "Refund", cancellation: "Cancellation", account: "Account" };
export const money = (pence: number, currency = "gbp") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(pence / 100);

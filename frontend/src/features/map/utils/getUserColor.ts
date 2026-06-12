const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea"];

export function getUserColor(userId: string) {
  let hash = 0;

  for (let i = 0; i < userId.length; i++) {
    hash += userId.charCodeAt(i);
  }
  return COLORS[hash % COLORS.length];
}

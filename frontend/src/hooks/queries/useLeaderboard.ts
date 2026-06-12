import { useQuery } from "@tanstack/react-query";
import { getLeaderboard, getTopLeaderboard, getMyLeaderboard, getUserLeaderboard } from "../../api/leaderboard.api";

export function useLeaderboard(page = 1, limit = 50) {
  return useQuery({
    queryKey: ["leaderboard", page, limit],
    queryFn: () => getLeaderboard(page, limit),
  });
}

export function useTopLeaderboard() {
  return useQuery({
    queryKey: ["leaderboard", "top"],
    queryFn: getTopLeaderboard,
  });
}

export function useMyLeaderboard() {
  return useQuery({
    queryKey: ["leaderboard", "me"],
    queryFn: getMyLeaderboard,
  });
}

export function useUserLeaderboard(userId: string) {
  return useQuery({
    queryKey: ["leaderboard", "user", userId],
    queryFn: () => getUserLeaderboard(userId),
    enabled: !!userId,
  });
}

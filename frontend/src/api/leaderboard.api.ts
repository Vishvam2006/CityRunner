import { apiClient } from "./client";
import { LeaderboardUser, LeaderboardResponse } from "../types";

export const getLeaderboard = async (page = 1, limit = 50): Promise<LeaderboardResponse> => {
  const { data } = await apiClient.get<LeaderboardResponse>(`/leaderboard?page=${page}&limit=${limit}`);
  return data;
};

export const getTopLeaderboard = async (): Promise<LeaderboardUser[]> => {
  const { data } = await apiClient.get<LeaderboardUser[]>("/leaderboard/top");
  return data;
};

export const getMyLeaderboard = async (): Promise<LeaderboardUser> => {
  const { data } = await apiClient.get<LeaderboardUser>("/leaderboard/me");
  return data;
};

export const getUserLeaderboard = async (id: string): Promise<LeaderboardUser> => {
  const { data } = await apiClient.get<LeaderboardUser>(`/leaderboard/user/${id}`);
  return data;
};

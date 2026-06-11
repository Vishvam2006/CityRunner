import { apiClient } from "./client";
import { LoginPayload, RegisterPayload, AuthResponse, UserResponse } from "../types";

export const authApi = {
  login: async (data: LoginPayload): Promise<AuthResponse> => {
    const res = await apiClient.post<AuthResponse>("/auth/login", data);
    return res.data;
  },
  register: async (data: RegisterPayload): Promise<{ user: any }> => {
    const res = await apiClient.post<{ user: any }>("/auth/register", data);
    return res.data;
  },
  getMe: async (): Promise<UserResponse> => {
    const res = await apiClient.get<UserResponse>("/auth/me");
    return res.data;
  },
};

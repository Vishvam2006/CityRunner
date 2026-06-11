import { useMutation, useQuery } from "@tanstack/react-query";
import { authApi } from "../../api/auth.api";
import { useAuthStore } from "../../store/auth.store";

export const useLogin = () => {
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAuth(data.token);
    },
  });
};

export const useRegister = () => {
  return useMutation({
    mutationFn: authApi.register,
  });
};

export const useUser = () => {
  const token = useAuthStore((state) => state.token);
  const setUser = useAuthStore((state) => state.setUser);

  return useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const data = await authApi.getMe();
      setUser(data.user);
      return data;
    },
    enabled: !!token,
  });
};

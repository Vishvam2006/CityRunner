import axios, { AxiosError } from "axios";
import { useAuthStore } from "../../../store/auth.store";

const baseUrl = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: baseUrl,
});

export async function getTerritories() {
  try {
    const token = useAuthStore.getState().token;

    const response = await api.get("/territory", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error(
      "Failed to fetch territories:",
      axiosError.response?.data || axiosError.message,
    );
    throw axiosError;
  }
}

export async function createTerritory(polygonWkt: string, area: number) {
  const token = useAuthStore.getState().token;

  const response = await api.post(
    "/territory",
    {
      polygonWkt,
      area,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return response.data;
}

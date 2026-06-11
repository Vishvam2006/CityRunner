import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRegister, useLogin } from "../../hooks/queries/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

export function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const register = useRegister();
  const login = useLogin();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register.mutate(
      { username, email, password },
      {
        onSuccess: () => {
          // Auto login after register
          login.mutate(
            { email, password },
            {
              onSuccess: () => navigate("/"),
            }
          );
        },
        onError: (err: any) => {
          alert(err.response?.data?.message || "Registration failed");
        },
      }
    );
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-900 border-slate-800">
        <CardHeader className="text-center pb-8">
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Join CityRunner
          </CardTitle>
          <p className="text-slate-400 mt-2">Claim your territory</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Runner ID (Username)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full mt-6" disabled={register.isPending || login.isPending}>
              {(register.isPending || login.isPending) ? "Processing..." : "Register"}
            </Button>
            
            <p className="text-center text-sm text-slate-400 mt-4">
              Already on the grid?{" "}
              <Link to="/login" className="text-blue-400 hover:text-blue-300">
                Login here
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

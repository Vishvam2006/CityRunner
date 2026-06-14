import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useStartRun,
  useFinishRun,
  useGetRunLoops,
} from "../../hooks/queries/useRuns";
import { useRunStore } from "../../store/run.store";
import { useGeolocation } from "../../hooks/useGeolocation";
import { RealtimeLoop } from "../../types";
import CityMap from "../map/components/CityMap";
import UserMarker from "../map/components/UserMarker";
import RoutePolyline from "../map/components/RoutePolyline";
import TerritoryPolygon from "../map/components/TerritoryPolygon";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import {
  StopCircle,
  MapPin,
  Loader2,
  ArrowLeft,
  WifiOff,
  AlertTriangle,
  Gauge,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Colour-coded confidence label for detected loops. */
function ConfidenceBadge({ confidence }: { confidence: number }) {
  const label =
    confidence >= 90 ? "High confidence" :
    confidence >= 70 ? "Good confidence" :
    confidence >= 50 ? "Moderate confidence" :
    "Low confidence";

  const colour =
    confidence >= 90 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" :
    confidence >= 70 ? "text-blue-400    bg-blue-500/10    border-blue-500/30" :
    confidence >= 50 ? "text-amber-400   bg-amber-500/10   border-amber-500/30" :
                       "text-red-400     bg-red-500/10     border-red-500/30";

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${colour}`}>
      <Gauge className="w-3.5 h-3.5" />
      <span>{label} — {confidence}%</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActiveRun() {
  const navigate  = useNavigate();
  const { mutate: startRun, isPending: starting }     = useStartRun();
  const { mutateAsync: finishRun, isPending: finishing } = useFinishRun();
  const {
    currentRunId,
    isTracking,
    routePoints,
    detectedLoops,
    startTracking,
    stopTracking,
    resetRun,
  } = useRunStore();

  const [showSummary,    setShowSummary]    = useState(false);
  const [runResult,      setRunResult]      = useState<any>(null);

  const { gpsStatus, gpsError } = useGeolocation();

  // Recovery hook: if the user reloads the page mid-run, fetch any loops
  // they already captured on the backend so they still show on the map.
  const { data: recoveryLoopsData } = useGetRunLoops(currentRunId);
  const displayLoops = detectedLoops.length > 0
    ? detectedLoops
    : (recoveryLoopsData?.loops ?? []);

  // ── Auto-start run on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!isTracking && !showSummary) {
      startRun(undefined, {
        onSuccess: (data) => startTracking(data.id),
        onError:   () => { alert("Failed to start run. Is the backend running?"); navigate("/"); },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Stop handler ─────────────────────────────────────────────────────────
  const handleStopRun = async () => {
    if (!currentRunId) return;

    const idToFinish = currentRunId;
    stopTracking();

    try {
      const res = await finishRun(idToFinish);
      setRunResult(res);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "";
      if (
        err?.response?.status !== 400 ||
        msg !== "Run contains no GPS points"
      ) {
        alert("Failed to finish run cleanly.");
        resetRun();
        navigate("/");
        return;
      }
    }

    setShowSummary(true);
  };

  const handleClose = () => {
    resetRun();
    navigate("/");
  };

  const currentLocation = routePoints[routePoints.length - 1];
  const mapCenter = currentLocation
    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
    : { lat: 19.076, lng: 72.8777 };

  // ── Summary Screen ────────────────────────────────────────────────────────
  if (showSummary) {
    const finalLoops: RealtimeLoop[] = runResult?.loops ?? [];

    return (
      <div className="flex-1 flex flex-col p-4 pt-12 space-y-6 overflow-y-auto">
        <header className="flex items-center">
          <button
            onClick={handleClose}
            className="p-2 -ml-2 rounded-full hover:bg-slate-800"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-3xl font-bold ml-2">Run Completed</h1>
        </header>

        <Card className="bg-slate-900 border-slate-800 p-6 flex flex-col items-center justify-center space-y-4">
          {runResult?.status === "REJECTED" ? (
            /* ── Rejected run ──────────────────────────────────────────── */
            <div className="text-center space-y-2">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/50">
                <AlertTriangle className="w-10 h-10 text-red-400" />
              </div>
              <p className="text-2xl font-bold text-red-400">Run Rejected</p>
              <p className="text-sm text-slate-400">
                Suspicious activity detected. Fraud score: {runResult?.fraudScore}
              </p>
            </div>
          ) : (
            <>
              {/* ── Flagged warning banner ─────────────────────────────── */}
              {runResult?.status === "FLAGGED" && (
                <div className="bg-amber-900/50 border border-amber-700/50 p-3 rounded-lg flex items-start space-x-3 mb-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200">
                    This run has been flagged for review (Score: {runResult?.fraudScore}).
                    Rewards may be withheld.
                  </p>
                </div>
              )}

              <h2 className="text-xl font-semibold text-slate-300">Territory Status</h2>

              {finishing ? (
                <div className="flex flex-col items-center space-y-2 text-blue-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p>Processing run data…</p>
                </div>
              ) : finalLoops.length > 0 ? (
                /* ── ✅ Loops detected ──────────────────────────────────── */
                <div className="text-center space-y-6 w-full">
                  <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-2 border border-emerald-500/50">
                    <MapPin className="w-10 h-10 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-bold text-emerald-400">
                    {finalLoops.length} {finalLoops.length === 1 ? 'Territory' : 'Territories'} Captured!
                  </p>

                  <div className="space-y-4 w-full">
                    {finalLoops.map((loop, idx) => (
                      <div key={loop.loopId} className="bg-slate-800/50 p-4 rounded-xl text-left border border-slate-700 w-full flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-slate-200">Territory #{idx + 1}</span>
                          <span className="text-sm text-slate-400">{Math.round(loop.area_m2)} m²</span>
                        </div>
                        <ConfidenceBadge confidence={loop.confidence} />
                      </div>
                    ))}
                  </div>
                </div>

              ) : routePoints.length === 0 ? (
                /* ── No GPS data at all ───────────────────────────────── */
                <div className="text-center space-y-2">
                  <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
                    <WifiOff className="w-10 h-10 text-amber-400" />
                  </div>
                  <p className="text-xl font-semibold text-slate-300">No GPS Data Recorded</p>
                  <p className="text-sm text-slate-500">Enable location permissions and try again.</p>
                </div>

              ) : (
                /* ── Loop not detected ────────────────────────────────── */
                <div className="text-center space-y-3">
                  <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-2">
                    <MapPin className="w-10 h-10 text-slate-500" />
                  </div>
                  <p className="text-xl font-semibold text-slate-300">No Territories Captured</p>

                  <p className="text-sm text-slate-400 max-w-xs mx-auto">
                    Try returning closer to a path you crossed earlier to complete a loop.
                  </p>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Mini-map of the run */}
        {routePoints.length > 0 && (
          <div className="h-64 rounded-3xl overflow-hidden relative border border-slate-800">
            <CityMap center={mapCenter}>
              <RoutePolyline
                points={routePoints.map((p) => ({ lat: p.latitude, lng: p.longitude }))}
              />
              {finalLoops.map(loop => (
                <TerritoryPolygon
                  key={loop.loopId}
                  coordinates={loop.polygonCoords}
                  userId="current-user"
                />
              ))}
            </CityMap>
          </div>
        )}

        <Button onClick={handleClose} className="w-full">
          Back to Home
        </Button>
      </div>
    );
  }

  // ── Active Run Screen ─────────────────────────────────────────────────────
  return (
    <div className="flex-1 relative flex flex-col h-full w-full">
      {/* Full-screen map */}
      <div className="absolute inset-0 z-0">
        <CityMap center={mapCenter}>
          {currentLocation && (
            <UserMarker
              position={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
            />
          )}
          {routePoints.length > 0 && (
            <RoutePolyline
              points={routePoints.map((p) => ({ lat: p.latitude, lng: p.longitude }))}
            />
          )}
          {displayLoops.map(loop => (
            <TerritoryPolygon
              key={loop.loopId}
              coordinates={loop.polygonCoords}
              userId="current-user"
            />
          ))}
        </CityMap>
      </div>

      {/* GPS Error Banner */}
      {gpsStatus === "error" && gpsError && (
        <div className="absolute top-16 left-4 right-4 z-30 bg-red-900/80 border border-red-700 backdrop-blur-md rounded-2xl px-4 py-3 flex items-start space-x-3 shadow-lg">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-200">{gpsError.message}</p>
        </div>
      )}

      {/* Floating overlays */}
      <div className="relative z-10 flex flex-col justify-between h-full p-4 pointer-events-none pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {/* Top HUD */}
        <div className="flex justify-between items-start pt-[env(safe-area-inset-top)]">
          <div className="glass px-4 py-2 rounded-full flex items-center space-x-2 pointer-events-auto shadow-lg">
            {gpsStatus === "active" ? (
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            ) : gpsStatus === "locating" ? (
              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-red-400" />
            )}
            <span className="font-semibold tracking-wider text-sm">
              {gpsStatus === "active"
                ? "REC"
                : gpsStatus === "locating"
                ? "GPS…"
                : "NO GPS"}
            </span>
          </div>
          <div className="flex flex-col gap-2 pointer-events-auto">
            <div className="glass px-4 py-2 rounded-full shadow-lg text-right">
              <span className="font-mono">{routePoints.length} PTS</span>
            </div>
            {displayLoops.length > 0 && (
              <div className="glass px-4 py-2 rounded-full shadow-lg text-right border border-emerald-500/50">
                <span className="font-mono text-emerald-400">{displayLoops.length} LOOP{displayLoops.length > 1 ? 'S' : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* Acquiring GPS pill */}
        {(starting ||
          (isTracking && gpsStatus === "locating" && routePoints.length === 0)) && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass-card px-6 py-3 rounded-full flex items-center space-x-3 shadow-2xl pointer-events-none">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <span className="font-medium text-sm text-slate-200">
              {starting ? "Starting run…" : "Acquiring GPS…"}
            </span>
          </div>
        )}

        {/* Stop button */}
        <div className="flex justify-center w-full pointer-events-auto">
          <button
            onClick={handleStopRun}
            disabled={finishing}
            className="flex items-center justify-center w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full shadow-2xl shadow-red-900/50 transition-transform transform active:scale-90 border-4 border-slate-900 disabled:opacity-50"
          >
            {finishing ? (
              <Loader2 className="w-8 h-8 animate-spin text-white" />
            ) : (
              <StopCircle className="w-10 h-10 text-white" fill="currentColor" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

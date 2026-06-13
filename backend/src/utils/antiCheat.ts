import * as turf from "@turf/turf";

export interface ValidationResult {
  isValid: boolean;
  fraudScoreAdded: number;
  reason: string | null;
}

const MAX_HUMAN_SPEED_MPS = 15; // 15 m/s is extremely fast, > Usain Bolt (10.44 m/s)

export function validateSequence(
  newSequenceNumber: number,
  lastSequenceNumber: number
): ValidationResult {
  if (newSequenceNumber <= lastSequenceNumber) {
    return {
      isValid: false,
      fraudScoreAdded: 50,
      reason: `Replay Attack / Invalid Sequence: ${newSequenceNumber} <= ${lastSequenceNumber}`,
    };
  }
  return { isValid: true, fraudScoreAdded: 0, reason: null };
}

export function validateBurstUpload(
  serverReceiveDeltaMs: number,
  clientTimeDeltaMs: number
): ValidationResult {
  // If the server received this point very quickly (< 100ms) but the client claims
  // it took > 10 seconds, it's likely a batch upload / burst
  if (serverReceiveDeltaMs < 100 && clientTimeDeltaMs > 10000) {
    return {
      isValid: false,
      fraudScoreAdded: 40,
      reason: `Burst Upload Detected: claimed ${clientTimeDeltaMs}ms elapsed but server received in ${serverReceiveDeltaMs}ms`,
    };
  }
  return { isValid: true, fraudScoreAdded: 0, reason: null };
}

export function validateMovement(
  lastPoint: { latitude: number; longitude: number; client_timestamp: Date },
  newPoint: { latitude: number; longitude: number; client_timestamp: Date }
): ValidationResult {
  const from = turf.point([lastPoint.longitude, lastPoint.latitude]);
  const to = turf.point([newPoint.longitude, newPoint.latitude]);

  // Distance in meters
  const distanceMeters = turf.distance(from, to, { units: "kilometers" }) * 1000;
  
  const timeDeltaSeconds =
    (newPoint.client_timestamp.getTime() - lastPoint.client_timestamp.getTime()) / 1000;

  if (timeDeltaSeconds <= 0) {
    // If time delta is <= 0 but distance moved is > 0, it's teleportation
    if (distanceMeters > 5) {
      return {
        isValid: false,
        fraudScoreAdded: 50,
        reason: `Teleportation: moved ${distanceMeters.toFixed(2)}m in <= 0s`,
      };
    }
    return { isValid: true, fraudScoreAdded: 0, reason: null };
  }

  const speedMps = distanceMeters / timeDeltaSeconds;

  // 1. Teleportation / Physical Impossibility Check
  const maxPossibleDistance = MAX_HUMAN_SPEED_MPS * timeDeltaSeconds;
  if (distanceMeters > maxPossibleDistance) {
    return {
      isValid: false,
      fraudScoreAdded: 50,
      reason: `Teleportation: moved ${distanceMeters.toFixed(2)}m in ${timeDeltaSeconds}s (max possible: ${maxPossibleDistance.toFixed(2)}m)`,
    };
  }

  // 2. Graduated Speed Scoring
  if (speedMps > 15) {
    return {
      isValid: true, // Still "valid" point, but adds heavy fraud score
      fraudScoreAdded: 50,
      reason: `Severe Fraud Speed: ${speedMps.toFixed(2)} m/s`,
    };
  } else if (speedMps > 10) {
    return {
      isValid: true,
      fraudScoreAdded: 25,
      reason: `Highly Suspicious Speed: ${speedMps.toFixed(2)} m/s`,
    };
  } else if (speedMps > 7) {
    return {
      isValid: true,
      fraudScoreAdded: 10,
      reason: `Suspicious Speed: ${speedMps.toFixed(2)} m/s`,
    };
  }

  return { isValid: true, fraudScoreAdded: 0, reason: null };
}

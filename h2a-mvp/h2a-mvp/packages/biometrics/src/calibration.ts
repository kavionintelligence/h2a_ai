export interface BiometricCalibrationObservation {
  fixture_id: string;
  label: 'genuine' | 'impostor';
  matched_record_count: number;
}

export interface BiometricCalibrationPolicyResult {
  required_matches: number;
  genuine_accepted: number;
  genuine_rejected: number;
  impostor_accepted: number;
  impostor_rejected: number;
  false_accept_rate: number;
  false_reject_rate: number;
}

export interface BiometricCalibrationReport {
  report_version: 1;
  profile: 'synthetic-labeled-bch-fixtures';
  calibration_status: 'demo-unmeasured';
  production_claim_permitted: false;
  token_set_size: number;
  genuine_fixture_count: number;
  impostor_fixture_count: number;
  policies: BiometricCalibrationPolicyResult[];
  limitation: string;
}

export function evaluateBiometricCalibration(
  observations: BiometricCalibrationObservation[],
  tokenSetSize: number,
  requiredMatchPolicies: number[]
): BiometricCalibrationReport {
  if (!Number.isInteger(tokenSetSize) || tokenSetSize < 20 || tokenSetSize > 70) {
    throw new Error('Calibration token set size must be an integer from 20 through 70.');
  }
  if (observations.length === 0 || new Set(observations.map((item) => item.fixture_id)).size !== observations.length) {
    throw new Error('Calibration observations must be non-empty and have unique fixture IDs.');
  }
  const genuine = observations.filter((item) => item.label === 'genuine');
  const impostor = observations.filter((item) => item.label === 'impostor');
  if (genuine.length === 0 || impostor.length === 0) {
    throw new Error('Calibration requires both genuine and impostor labeled fixtures.');
  }
  for (const observation of observations) {
    if (!Number.isInteger(observation.matched_record_count) || observation.matched_record_count < 0 || observation.matched_record_count > tokenSetSize) {
      throw new Error('Calibration matched record counts must be valid for the token set.');
    }
  }
  const thresholds = [...new Set(requiredMatchPolicies)].sort((left, right) => left - right);
  if (thresholds.length === 0 || thresholds.some((value) => !Number.isInteger(value) || value < 1 || value > tokenSetSize)) {
    throw new Error('Calibration policies must contain valid required-match thresholds.');
  }

  return {
    report_version: 1,
    profile: 'synthetic-labeled-bch-fixtures',
    calibration_status: 'demo-unmeasured',
    production_claim_permitted: false,
    token_set_size: tokenSetSize,
    genuine_fixture_count: genuine.length,
    impostor_fixture_count: impostor.length,
    policies: thresholds.map((requiredMatches) => {
      const genuineAccepted = genuine.filter((item) => item.matched_record_count >= requiredMatches).length;
      const impostorAccepted = impostor.filter((item) => item.matched_record_count >= requiredMatches).length;
      return {
        required_matches: requiredMatches,
        genuine_accepted: genuineAccepted,
        genuine_rejected: genuine.length - genuineAccepted,
        impostor_accepted: impostorAccepted,
        impostor_rejected: impostor.length - impostorAccepted,
        false_accept_rate: impostorAccepted / impostor.length,
        false_reject_rate: (genuine.length - genuineAccepted) / genuine.length
      };
    }),
    limitation: 'Synthetic BCH fixtures validate policy mechanics only. Human FAR/FRR remains unmeasured until the labeled two-participant camera ceremony.'
  };
}

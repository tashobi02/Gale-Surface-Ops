/**
 * Mars24 solar functions (docs/specs/02 §D.5; Allison & McEwen 2000; ADR-005). FR-11.
 * Implemented by TASK-06 (T06.06); cross-checked against the Python `marstime` package.
 * Pitfall (02 §C.4.1): many Mars24 implementations take west longitude; this app stores
 * east-positive longitude everywhere.
 */

// Leap second offset table for UTC to TT conversion (TAI - UTC offset in seconds).
// Modern leap seconds began 1972-01-01 UTC (MJD 41317, JD 2441317.5, rel = 0).
// Table includes all leap seconds through 2017-01-01 (37 s), including the 2015 and 2017
// leap seconds added by IERS after the original Allison & McEwen (2000) publication.
const LEAP_DATES: [offsetDay: number, leapSec: number][] = [
  [0, 10],
  [182, 11],
  [366, 12],
  [731, 13],
  [1096, 14],
  [1461, 15],
  [1827, 16],
  [2192, 17],
  [2557, 18],
  [2922, 19],
  [3469, 20],
  [3834, 21],
  [4199, 22],
  [4930, 23],
  [5844, 24],
  [6575, 25],
  [6940, 26],
  [7487, 27],
  [7852, 28],
  [8217, 29],
  [8766, 30],
  [9313, 31],
  [9862, 32],
  [12419, 33],
  [13515, 34],
  [14792, 35],
  [15522, 36],
  [16436, 37],
];

// Clancy et al. (2000) Mars Year zero-crossing table (J2000 offset TT in days for L_s = 0°)
const CLANCY_MY_J2K_OFFSETS: number[] = [
  -16336.044076, -15649.093471, -14962.0892946, -14275.0960023, -13588.1458658,
  -12901.1772635, -12214.2082215, -11527.2637345, -10840.2842249, -10153.2828749,
  -9466.3114025, -8779.3356111, -8092.3607738, -7405.4236452, -6718.4615347,
  -6031.4574604, -5344.4876509, -4657.5318339, -3970.5474528, -3283.5848372,
  -2596.6329362, -1909.6426682, -1222.6617049, -535.7040268, 151.2736522,
  838.2369682, 1525.1834712, 2212.1799182, 2899.1848518, 3586.1403058,
  4273.1024234, 4960.0765368, 5647.0207838, 6333.986502, 7020.9875066,
  7707.9629132, 8394.9318782, 9081.9102062, 9768.8526533, 10455.8028354,
  11142.8050514, 11829.7873254, 12516.7417734, 13203.725449, 13890.6991502,
  14577.6484912, 15264.6324865, 15951.6217969, 16638.5798914, 17325.5517216,
  18012.5209097, 18699.4628887, 19386.4443201, 20073.4534421, 20760.4152811,
  21447.3696661, 22134.3466251, 22821.2966642, 23508.2529432, 24195.2539572,
  24882.2400506, 25569.2081296, 26256.1902459, 26943.1429481, 27630.0847446,
  28317.0793316, 29004.0710936, 29691.0238241, 30377.9991486, 31064.9784277,
  31751.9249377, 32438.896907, 33125.8902412, 33812.8520242, 34499.8183442,
  35186.7944595, 35873.740573, 36560.7112423, 37247.7247318,
];

// Orbital perturbation periodic terms (Allison & McEwen 2000 Eq. 18)
const A_PERTURBS = [0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.0020, 0.0018];
const TAU_PERTURBS = [2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493];
const PHI_PERTURBS = [49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095];

/**
 * Compute elapsed days since the J2000 epoch (2000-01-01 12:00:00 TT, JD 2451545.0) in Terrestrial Time (TT).
 *
 * Valid range: Dates >= 1972-01-01 UTC (the start of the modern leap second system).
 * Dates before 1972 throw RangeError.
 * Assumption: Times after the last scheduled leap second (2017-01-01) keep ΔAT = 37 s.
 */
export function j2000OffsetTt(utc: Date): number {
  if (!(utc instanceof Date) || isNaN(utc.getTime())) {
    throw new RangeError("Invalid Date provided to Mars24 calculation");
  }

  const m = utc.getTime();
  const jdayUtc = 2440587.5 + m / 86400000.0;
  const jdayMin = 2441317.5; // 1972-01-01 00:00:00 UTC
  const rel = jdayUtc - jdayMin;

  if (rel < 0) {
    throw new RangeError("Dates before 1972-01-01 UTC are outside the valid Mars24 leap-second table range");
  }

  // Assumption: times after the last leap second (2017-01-01) retain ΔAT = 37 s.
  let leapSec = 37.0;
  if (rel < LEAP_DATES[LEAP_DATES.length - 1][0]) {
    for (let i = 0; i < LEAP_DATES.length - 1; i++) {
      if (rel >= LEAP_DATES[i][0] && rel < LEAP_DATES[i + 1][0]) {
        leapSec = LEAP_DATES[i][1];
        break;
      }
    }
  }

  const offsetSec = 32.184 + leapSec;
  const jdayTt = jdayUtc + offsetSec / 86400.0;
  return jdayTt - 2451545.0;
}

/**
 * Mars Sol Date (MSD) for a UTC instant (Allison & McEwen 2000 Eq. 27). TASK-06 (T06.06).
 */
export function marsSolDate(utc: Date): number {
  const ott = j2000OffsetTt(utc);
  return (ott - 4.5) / 1.027491252 + 44796.0 - 0.00096;
}

/**
 * Fictional Mean Sun angle in degrees (Allison & McEwen 2000 Eq. 17). Internal helper.
 */
function fictionalMeanSunAngle(ott: number): number {
  return ((270.3863 + 0.5240384 * ott) % 360 + 360) % 360;
}

/**
 * Mars Mean Anomaly in degrees (Allison & McEwen 2000 Eq. 16). Internal helper.
 */
function marsMeanAnomaly(ott: number): number {
  return ((19.387 + 0.52402075 * ott) % 360 + 360) % 360;
}

/**
 * Periodic orbital perturbation terms (PBS) in degrees (Allison & McEwen 2000 Eq. 18). Internal helper.
 */
function alphaPerturbations(ott: number): number {
  let pbs = 0;
  for (let i = 0; i < 7; i++) {
    const angleRad = (((0.985626 * ott) / TAU_PERTURBS[i] + PHI_PERTURBS[i]) * Math.PI) / 180;
    pbs += A_PERTURBS[i] * Math.cos(angleRad);
  }
  return pbs;
}

/**
 * Equation of Center (true anomaly v - mean anomaly M) in degrees (Allison & McEwen 2000 Eq. 19).
 * Used by sun.ts for solar declination and subsolar longitude.
 */
export function equationOfCenter(ott: number): number {
  const mDeg = marsMeanAnomaly(ott);
  const mRad = (mDeg * Math.PI) / 180;
  const pbs = alphaPerturbations(ott);

  return (
    (10.691 + 3.0e-7 * ott) * Math.sin(mRad) +
    0.623 * Math.sin(2 * mRad) +
    0.05 * Math.sin(3 * mRad) +
    0.005 * Math.sin(4 * mRad) +
    0.0005 * Math.sin(5 * mRad) +
    pbs
  );
}

/**
 * Areocentric solar longitude L_s in degrees (Allison & McEwen 2000 Eq. 20).
 * Used by sun.ts for solar declination and solar position.
 */
export function areocentricSolarLongitude(ott: number): number {
  const alphaFms = fictionalMeanSunAngle(ott);
  const vm = equationOfCenter(ott);
  return ((alphaFms + vm) % 360 + 360) % 360;
}

/**
 * Mars Year number (Clancy et al. 2000 convention, where MY 1 begins 1955-04-11). Internal helper.
 */
function marsYear(ott: number): number {
  if (ott < CLANCY_MY_J2K_OFFSETS[0]) {
    return Math.floor(1 + (ott - CLANCY_MY_J2K_OFFSETS[0]) / 686.95);
  }
  if (ott >= CLANCY_MY_J2K_OFFSETS[CLANCY_MY_J2K_OFFSETS.length - 1]) {
    const lastOffset = CLANCY_MY_J2K_OFFSETS[CLANCY_MY_J2K_OFFSETS.length - 1];
    return Math.floor(1 + (ott - lastOffset) / 686.97) + (CLANCY_MY_J2K_OFFSETS.length - 1);
  }
  for (let i = 0; i < CLANCY_MY_J2K_OFFSETS.length - 1; i++) {
    if (ott >= CLANCY_MY_J2K_OFFSETS[i] && ott < CLANCY_MY_J2K_OFFSETS[i + 1]) {
      return i + 1;
    }
  }
  return 1;
}

/** Areocentric solar longitude L_s, degrees, and Mars Year. TASK-06 (T06.06). */
export function solarLongitude(utc: Date): { ls_deg: number; mars_year: number } {
  const ott = j2000OffsetTt(utc);
  return {
    ls_deg: areocentricSolarLongitude(ott),
    mars_year: marsYear(ott),
  };
}

/** Convert east-positive longitude to the west longitude Mars24 expects (02 §C.4.1). TASK-06 (T06.06). */
export function eastToWestLongitude(lonE: number): number {
  if (!Number.isFinite(lonE)) {
    throw new RangeError("Invalid longitude provided to eastToWestLongitude: expected finite number");
  }
  return ((360 - (lonE % 360)) % 360 + 360) % 360;
}

/**
 * Equation of Time (EOT) in degrees (Allison & McEwen 2000 Eq. 22). Internal helper.
 */
function equationOfTime(ott: number): number {
  const lsDeg = areocentricSolarLongitude(ott);
  const lsRad = (lsDeg * Math.PI) / 180;
  const vm = equationOfCenter(ott);

  return (
    2.861 * Math.sin(2 * lsRad) -
    0.071 * Math.sin(4 * lsRad) +
    0.002 * Math.sin(6 * lsRad) -
    vm
  );
}

/**
 * Coordinated Mars Time (MTC) in decimal hours (0 to 24).
 * Used by sun.ts for subsolar longitude calculation.
 */
export function coordinatedMarsTime(ott: number): number {
  const msd = (ott - 4.5) / 1.027491252 + 44796.0 - 0.00096;
  return ((24.0 * msd) % 24 + 24) % 24;
}

/**
 * Local True Solar Time in decimal hours (0 to 24). Internal helper.
 */
function localTrueSolarTimeHours(utc: Date, lonE: number): number {
  if (!Number.isFinite(lonE)) {
    throw new RangeError("Invalid longitude provided to localTrueSolarTime: expected finite number");
  }
  const ott = j2000OffsetTt(utc);
  const lonW = eastToWestLongitude(lonE);
  const mtc = coordinatedMarsTime(ott);
  const lmst = ((mtc - (lonW * 24.0) / 360.0) % 24 + 24) % 24;
  const eotDeg = equationOfTime(ott);
  const eotHours = (eotDeg * 24.0) / 360.0;

  return ((lmst + eotHours) % 24 + 24) % 24;
}

/** Local true solar time "HH:MM" at a site. Input: UTC, lon_e (°). TASK-06 (T06.06). */
export function localTrueSolarTime(utc: Date, lonE: number): string {
  const ltstH = localTrueSolarTimeHours(utc, lonE);
  const h = Math.floor(ltstH) % 24;
  let mins = Math.round((ltstH - Math.floor(ltstH)) * 60);
  let finalH = h;
  if (mins === 60) {
    finalH = (finalH + 1) % 24;
    mins = 0;
  }
  return `${String(finalH).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

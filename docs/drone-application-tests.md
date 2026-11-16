# Drone application: in-game test log

Owen's controlled in-game tests of how mobile drones actually apply, started 2026-11-15. The goal is
a drone model for the damage graph that is better than pyfa's (and ours, since commit ccf98f8):
a drone at least as fast as its target hits 100%, while a slower drone or a sentry gets turret math
from the ship (`getDroneMult`, "Auto" mode).

Nothing below is in the code yet. Step 1 (pyfa parity) is the only change made so far.

## The models being tested

- **Orbit model.** A drone that can keep up settles into an orbit around the target at
  `entityFlyRange` and `entityCruiseSpeed` (the in-game "Orbit Velocity"). No skill or module
  changes either one. The angular velocity is cruise / (orbit distance + radii), which goes through
  the normal turret chance-to-hit with the drone's own tracking, optimalSigRadius and range.
- **Hit size.** The eve-uni formula that pyfa and `calcTurretMult` use: on a hit, the damage
  multiplier is uniform in [0.50, chance-to-hit + 0.49], and 1% of shots wreck for 3x.

## Setup (all runs)

- **Drones:** 2x Vespa II with Owen's skills, on a hull with no drone bonuses.
- **Vespa II stats in game:** 32 kinetic x 3.578 = 114.5 raw per hit, 4 s cycle, optimal 5,760 m,
  falloff 3,000 m, tracking 0.78, MWD 2,835 m/s, orbit 564 m/s.
- **Vespa II from the data:** orbit distance (`entityFlyRange`) 1,600 m, radius 20 m,
  optimalSigRadius 125.
- **Shield layer:** every target stayed in shield for the whole run.
- **Gaps in firing:** the drones sometimes disengaged without being told to. Owen calls this client
  weirdness, so those gaps are left out of the counts below. If it keeps happening, record when.

## Results

| # | Target | Sig | Kin resist (shield) | Movement | Shots | Hit rate | Orbit model | Avg non-wreck hit | Formula predicts | Damage per shot |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Stabber | 142 m | 46% | stationary | 42 | 90.5% | 91% | 1.055x | 0.95x | 1.00x |
| 2 | Stabber | 142 m | 46% | 298 m/s, 20 km orbit | 38 | 92% | ~91% | 1.030x | 0.96x | 1.00x |
| 3 | Stabber | 142 m | 46% | 1,424 m/s, 28 km orbit | 42 | 71% | (orbit breaks?) | 0.878x | 0.85x | 0.63x |
| 4 | Stiletto | 77 m | 48% | 890 m/s (pattern not recorded) | 36 | 78% | 70% | 0.854x | 0.88x | 0.66x |
| 5 | Stiletto | 77 m | ? | ~3,000 m/s | ? | 0% | 0% (cannot catch) | n/a | n/a | 0 |

The multipliers are relative to base damage after resists: 114.5 x (1 - resist). Both wrecking
hits on the Stabber (runs 1 and 2) came to exactly 185 = 2.99x of 61.83, which confirms its base
damage and the 3x wrecking rule. pyfa and Axis show 100% for runs 1 to 4 and 0 for run 5.

### Raw logs (damage per shot, newest first, "-" = miss)

1. 85 81 82 67 58 40 51 46 75 55 87 66 85 50 84 83 66 38 63 57 45 185(wreck) - 69 62 62 82 57 - 82 49 41 61 47 72 65 - - 83 62 87 68
2. 89 80 76 38 68 51 34 185(wreck) 79 67 71 50 84 65 42 33 - 72 - 38 73 64 81 52 84 39 61 53 84 83 56 33 75 57 75 71 - 87
3. 34 - - - 92 46 75 51 80 60 - - 32 42 53 35 61 49 70 - - 55 43 64 - 33 55 66 85 33 36 39 49 - - - - 50 54 82 59 46
   (with a 27 s gap between 23:58:50 and 23:59:17, put down to the drones disengaging)
4. 51 44 77 45 72 40 - 40 - - 57 46 52 41 72 49 68 57 49 49 - 33 - - - 44 50 39 - 63 57 52 55 40 41 40

## What it shows so far

- **Hit rate.** The orbit model matched within noise on every run it covers (1, 2 and 4). For a
  target slower than orbit speed, the target's own speed barely matters (runs 1 and 2).
- **Can't catch it.** A target faster than the MWD speed takes no hits (run 5), which matches
  pyfa's rule.
- **The unclear middle.** A target faster than orbit speed but slower than MWD speed gave mixed
  results. The Stiletto at 890 m/s still looked like an orbit (run 4). The Stabber at 1,424 m/s
  dropped to 71%, below the orbit model, and its per-shot damage (0.63x) was below even the orbit
  model's figure.
- **Hit size.** The formula fit runs 3 and 4, but runs 1 and 2 averaged 7 to 10% above anything it
  allows. Neither the standard formula nor a hit size independent of the hit chance explains all
  four runs. It could be bad luck twice.

## Next tests

1. The stationary Stabber again, longer (60+ shots). Settles whether the high hits in runs 1 and 2
   were luck.
2. The Stabber at about 1,100 m/s on the same 28 km orbit. Brackets where the orbit breaks down,
   between 890 and 1,424 m/s.
3. Optionally, a turret ship shooting the stationary Stabber. Tells whether a hit-size anomaly is
   specific to drones.
4. Later: a frigate-sized target (35 to 56 m sig) while stationary, where the orbit model predicts
   a very low hit rate (Rifter about 18%, Thrasher about 56%), and other drone sizes.

Record for every run: target hull, sig, resist on the layer being hit, speed, movement pattern
(orbit radius or straight line), and the full log.
